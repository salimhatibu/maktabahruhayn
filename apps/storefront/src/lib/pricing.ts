import { getFxRates, refreshFxRates, fxRatesAreStale, roundPrice, type D1 } from "@maktabah/db"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { db } from "./db"

/**
 * Keeps exchange rates current without a scheduled job.
 *
 * When the stored rates are older than six hours the refresh runs after the
 * response through `waitUntil`, so a shopper never waits on a provider. If it
 * fails, prices stay on the last known rates rather than falling back to the
 * base currency.
 */
export async function refreshRatesIfStale(database: D1) {
  try {
    if (!(await fxRatesAreStale(database))) {
      return
    }
    const { ctx } = await getCloudflareContext({ async: true })
    const refresh = refreshFxRates(database).catch(() => undefined)
    if (ctx?.waitUntil) {
      ctx.waitUntil(refresh)
    } else {
      await refresh
    }
  } catch {
    // Never let a rate refresh break a page render.
  }
}

/** Current rates, refreshing them in the background when they age out. */
export async function currentFxRates(): Promise<Record<string, number>> {
  const database = await db()
  await refreshRatesIfStale(database)
  return getFxRates(database)
}

/**
 * Converts a base-currency (USD) figure into the visitor's currency with the
 * stored FX rates, rounded the same way catalogue prices are. Without a rate
 * the base figure is returned rather than an invented one.
 */
export async function convertFromBase(amount: number, currency: string): Promise<number> {
  const code = currency.toLowerCase()
  if (code === "usd") {
    return amount
  }
  const rates = await currentFxRates()
  const rate = rates[code]
  return rate ? roundPrice(amount * rate, code) : amount
}
