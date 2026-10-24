/**
 * Pricing. Every price is stored in minor units of the currency it was set in.
 * A currency with no stored row is converted from the base currency with the
 * latest FX rate and rounded to a shelf-friendly figure, which is why adding a
 * currency needs no price backfill.
 */
export const BASE_CURRENCY = "usd"

/** Currencies quoted in whole units, where ".99" pricing would look wrong. */
const WHOLE_UNIT = new Set(["kes", "ugx", "tzs", "rwf", "bif", "pkr", "ngn", "inr", "egp"])

/**
 * Shelf-friendly rounding of a converted amount, in major units:
 * whole-unit currencies go to the nearest 10 (100 above 10,000), everything
 * else lands on .99, at most one unit above the exact converted figure.
 */
export function roundPrice(amount: number, currency: string): number {
  const code = currency.toLowerCase()
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0
  }
  if (WHOLE_UNIT.has(code)) {
    const step = amount >= 10000 ? 100 : 10
    return Math.max(step, Math.round(amount / step) * step)
  }
  if (amount < 1) {
    return Math.round(amount * 100) / 100
  }
  return Math.ceil(amount) - 0.01
}

export function toMajor(minorUnits: number): number {
  return minorUnits / 100
}

export function toMinor(major: number): number {
  return Math.round(major * 100)
}

/**
 * Converts a base-currency amount into `currency`. Without a rate for the
 * target currency the base amount is returned unchanged, so a stale or
 * missing FX table shows base prices rather than invented ones.
 */
export function convert(baseMinor: number, currency: string, rates: Record<string, number>): number {
  const code = currency.toLowerCase()
  if (code === BASE_CURRENCY) {
    return baseMinor
  }
  const rate = rates[code]
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    return baseMinor
  }
  return toMinor(roundPrice(toMajor(baseMinor) * rate, code))
}

/**
 * Converts an amount already expressed in `currency` back into the base
 * currency. The editor prices in KES, but the storefront converts outwards
 * from the base row, so a price set in the admin has to be written as a base
 * amount too or every non-KES shopper keeps reading the previous figure.
 *
 * Without a usable rate the amount is returned unchanged, matching convert():
 * a missing FX table yields a visibly wrong price rather than a silent zero.
 */
export function convertToBase(amountMinor: number, currency: string, rates: Record<string, number>): number {
  const code = currency.toLowerCase()
  if (code === BASE_CURRENCY) {
    return amountMinor
  }
  const rate = rates[code]
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    return amountMinor
  }
  return toMinor(roundPrice(toMajor(amountMinor) / rate, BASE_CURRENCY))
}
