import { MedusaError } from "@medusajs/framework/utils"
/**
 * Exchange rates shared by the FX module, price sync, Shippo rate conversion,
 * and free-shipping thresholds. Rates are USD-based and cached in memory.
 *
 * Primary source: open.er-api.com (ExchangeRate-API open access, no key,
 * ~160 currencies incl. KES, UGX, TZS, AED, NGN). Fallback: Frankfurter (ECB),
 * which lacks several African and Gulf currencies.
 */
export type FxSnapshot = {
  base: "USD"
  rates: Record<string, number>
  updated_at: string
  source: string
}

const TTL_MS = Number(process.env.FX_CACHE_TTL_MS || 6 * 60 * 60 * 1000)

let cache: { snapshot: FxSnapshot; fetchedAt: number } | null = null
let inflight: Promise<FxSnapshot> | null = null

async function fetchOpenErApi(): Promise<FxSnapshot> {
  const response = await fetch("https://open.er-api.com/v6/latest/USD")
  if (!response.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `open.er-api.com responded ${response.status}`)
  }
  const data = (await response.json()) as {
    result?: string
    rates?: Record<string, number>
    time_last_update_utc?: string
  }
  if (data.result !== "success" || !data.rates) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "open.er-api.com returned no rates")
  }
  return {
    base: "USD",
    rates: { ...data.rates, USD: 1 },
    updated_at: data.time_last_update_utc
      ? new Date(data.time_last_update_utc).toISOString()
      : new Date().toISOString(),
    source: "open.er-api.com",
  }
}

async function fetchFrankfurter(): Promise<FxSnapshot> {
  const response = await fetch("https://api.frankfurter.dev/v1/latest?base=USD")
  if (!response.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Frankfurter responded ${response.status}`)
  }
  const data = (await response.json()) as { rates: Record<string, number>; date: string }
  return {
    base: "USD",
    rates: { ...data.rates, USD: 1 },
    updated_at: new Date(`${data.date}T00:00:00Z`).toISOString(),
    source: "frankfurter (ECB)",
  }
}

/** Fetches fresh rates, ignoring the cache. */
export async function refreshFxRates(): Promise<FxSnapshot> {
  let snapshot: FxSnapshot
  try {
    snapshot = await fetchOpenErApi()
  } catch (primaryError) {
    try {
      snapshot = await fetchFrankfurter()
    } catch {
      throw primaryError
    }
  }
  cache = { snapshot, fetchedAt: Date.now() }
  return snapshot
}

/** Returns cached rates, refreshing when stale. Concurrent callers share one fetch. */
export async function getFxRates(): Promise<FxSnapshot> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return cache.snapshot
  }
  if (!inflight) {
    inflight = refreshFxRates().finally(() => {
      inflight = null
    })
  }
  try {
    return await inflight
  } catch (error) {
    // Serve stale rates rather than failing checkout when the source is down.
    if (cache) {
      return cache.snapshot
    }
    throw error
  }
}

/** Converts between any two currencies via USD. Returns null when unknown. */
export async function convertAmount(
  amount: number,
  from: string,
  to: string
): Promise<number | null> {
  const source = from.toUpperCase()
  const target = to.toUpperCase()
  if (source === target) {
    return amount
  }
  const { rates } = await getFxRates()
  const fromRate = rates[source]
  const toRate = rates[target]
  if (!fromRate || !toRate) {
    return null
  }
  return (amount / fromRate) * toRate
}
