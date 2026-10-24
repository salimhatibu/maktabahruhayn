import type { D1 } from "./client"
import { PRICED_CURRENCIES } from "@maktabah/shared"

/**
 * Exchange rates, USD-based, stored in `fx_rate`.
 *
 * Primary source: open.er-api.com (no key, ~160 currencies including KES,
 * UGX, TZS, AED and NGN). Fallback: Frankfurter (ECB), which lacks several
 * African and Gulf currencies but is enough to keep the major ones current.
 *
 * Only the currencies the shop actually prices in are stored, so the table
 * stays small and a read is one query.
 */
export type FxRefresh = {
  updated: number
  source: string
  /** Currencies the provider had no rate for. */
  missing: string[]
}

/** How old rates may get before a read triggers a refresh behind it. */
export const FX_MAX_AGE_MS = 6 * 60 * 60 * 1000

async function fetchOpenErApi(): Promise<{ rates: Record<string, number>; source: string }> {
  const response = await fetch("https://open.er-api.com/v6/latest/USD")
  if (!response.ok) {
    throw new Error(`open.er-api.com responded ${response.status}`)
  }
  const data = (await response.json()) as { result?: string; rates?: Record<string, number> }
  if (data.result !== "success" || !data.rates) {
    throw new Error("open.er-api.com returned no rates")
  }
  return { rates: { ...data.rates, USD: 1 }, source: "open.er-api.com" }
}

async function fetchFrankfurter(): Promise<{ rates: Record<string, number>; source: string }> {
  const response = await fetch("https://api.frankfurter.dev/v1/latest?base=USD")
  if (!response.ok) {
    throw new Error(`Frankfurter responded ${response.status}`)
  }
  const data = (await response.json()) as { rates: Record<string, number> }
  return { rates: { ...data.rates, USD: 1 }, source: "frankfurter (ECB)" }
}

/**
 * Fetches current rates and writes the ones the shop prices in. Returns what
 * changed, so a caller can log or report it.
 */
export async function refreshFxRates(db: D1): Promise<FxRefresh> {
  let fetched: { rates: Record<string, number>; source: string }
  try {
    fetched = await fetchOpenErApi()
  } catch {
    // The primary source being down must not leave prices stale forever.
    fetched = await fetchFrankfurter()
  }

  const now = new Date().toISOString()
  const missing: string[] = []
  const statements = []

  for (const currency of PRICED_CURRENCIES) {
    const rate = fetched.rates[currency.toUpperCase()]
    if (!rate || !Number.isFinite(rate) || rate <= 0) {
      missing.push(currency)
      continue
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO fx_rate (currency_code, rate, fetched_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (currency_code) DO UPDATE SET rate = excluded.rate, fetched_at = excluded.fetched_at`
        )
        .bind(currency, rate, now)
    )
  }

  if (statements.length) {
    await db.batch(statements)
  }
  return { updated: statements.length, source: fetched.source, missing }
}

/** When the rates were last written, or null if there are none. */
export async function fxRatesAge(db: D1): Promise<number | null> {
  const row = await db
    .prepare(`SELECT MAX(fetched_at) AS fetched_at FROM fx_rate WHERE currency_code != 'usd'`)
    .first<{ fetched_at: string | null }>()
  if (!row?.fetched_at) {
    return null
  }
  const age = Date.now() - new Date(row.fetched_at).getTime()
  return Number.isFinite(age) ? age : null
}

export async function fxRatesAreStale(db: D1): Promise<boolean> {
  const age = await fxRatesAge(db)
  return age === null || age > FX_MAX_AGE_MS
}
