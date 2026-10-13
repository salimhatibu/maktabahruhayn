/**
 * Region-per-currency configuration. Every shopper is priced and charged in
 * their own currency: USD is the catalog's base price, and every other
 * currency is derived from it with live FX rates (see the
 * sync-converted-prices workflow).
 *
 * M-Pesa (Daraja) is Safaricom Kenya only, so it is offered on the Kenya
 * region alone. Stripe settles every currency listed here.
 */
export type CurrencyRegion = {
  name: string
  currency: string
  countries: string[]
  /** Payment provider ids, without the "pp_" prefix. */
  payments: ("daraja_daraja" | "stripe_stripe")[]
  /** Also takes every country that no other region claims. */
  restOfWorld?: boolean
}

/** Destinations we never ship to (comprehensive sanctions, no postal service). */
export const NO_SHIPPING = ["aq", "bv", "cu", "hm", "ir", "kp", "sy", "um"]

export const BASE_CURRENCY = "usd"

export const CURRENCY_REGIONS: CurrencyRegion[] = [
  { name: "Kenya", currency: "kes", countries: ["ke"], payments: ["daraja_daraja", "stripe_stripe"] },
  { name: "Uganda", currency: "ugx", countries: ["ug"], payments: ["stripe_stripe"] },
  { name: "Tanzania", currency: "tzs", countries: ["tz"], payments: ["stripe_stripe"] },
  { name: "Rwanda", currency: "rwf", countries: ["rw"], payments: ["stripe_stripe"] },
  { name: "Burundi", currency: "bif", countries: ["bi"], payments: ["stripe_stripe"] },
  { name: "United Kingdom", currency: "gbp", countries: ["gb"], payments: ["stripe_stripe"] },
  {
    name: "Europe",
    currency: "eur",
    countries: ["de", "fr", "nl", "it", "es", "ie", "be", "at", "pt", "fi"],
    payments: ["stripe_stripe"],
  },
  { name: "Sweden", currency: "sek", countries: ["se"], payments: ["stripe_stripe"] },
  { name: "Norway", currency: "nok", countries: ["no"], payments: ["stripe_stripe"] },
  { name: "Denmark", currency: "dkk", countries: ["dk"], payments: ["stripe_stripe"] },
  { name: "Canada", currency: "cad", countries: ["ca"], payments: ["stripe_stripe"] },
  { name: "Australia", currency: "aud", countries: ["au"], payments: ["stripe_stripe"] },
  { name: "United Arab Emirates", currency: "aed", countries: ["ae"], payments: ["stripe_stripe"] },
  { name: "Saudi Arabia", currency: "sar", countries: ["sa"], payments: ["stripe_stripe"] },
  { name: "Malaysia", currency: "myr", countries: ["my"], payments: ["stripe_stripe"] },
  { name: "Singapore", currency: "sgd", countries: ["sg"], payments: ["stripe_stripe"] },
  { name: "South Africa", currency: "zar", countries: ["za"], payments: ["stripe_stripe"] },
  { name: "India", currency: "inr", countries: ["in"], payments: ["stripe_stripe"] },
  { name: "Pakistan", currency: "pkr", countries: ["pk"], payments: ["stripe_stripe"] },
  { name: "Nigeria", currency: "ngn", countries: ["ng"], payments: ["stripe_stripe"] },
  { name: "Egypt", currency: "egp", countries: ["eg"], payments: ["stripe_stripe"] },
  { name: "Morocco", currency: "mad", countries: ["ma"], payments: ["stripe_stripe"] },
  {
    name: "United States & International",
    currency: "usd",
    // US plus every destination without its own currency region.
    restOfWorld: true,
    countries: [
      "us", "jp", "kr", "tr", "id", "qa", "kw", "bh", "om", "jo", "bd", "lk",
      "nz", "ch", "gh", "et", "so", "dj", "mv", "bn", "ph", "th",
    ],
    payments: ["stripe_stripe"],
  },
]

export const PRICED_CURRENCIES = Array.from(
  new Set(CURRENCY_REGIONS.map((r) => r.currency))
)

/** Currencies whose smallest practical unit is whole (or larger). */
const WHOLE_UNIT = new Set(["kes", "ugx", "tzs", "rwf", "bif", "pkr", "ngn", "inr", "egp"])

/**
 * Rounds a converted amount to a shelf-friendly price:
 * - whole-unit currencies: nearest 10 (or 100 for amounts over 10,000)
 * - others: charm pricing at .99 (at most one unit above the exact rate)
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
