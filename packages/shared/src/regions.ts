/**
 * Region-per-currency configuration: static facts about where the shop sells
 * and in which currency, shared by the storefront and the admin.
 *
 * USD is the catalogue's base price; every other currency is derived from it
 * with live FX rates. This is configuration rather than data, so it lives in
 * code and needs no database round trip to resolve a visitor's region.
 *
 * M-Pesa (Daraja) is Safaricom Kenya only, so it is offered there alone.
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

export const BASE_CURRENCY = "usd"

/** Destinations we never ship to (comprehensive sanctions, no postal service). */
export const NO_SHIPPING = ["aq", "bv", "cu", "hm", "ir", "kp", "sy", "um"]

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

export const PRICED_CURRENCIES = Array.from(new Set(CURRENCY_REGIONS.map((r) => r.currency)))

export type ResolvedRegion = {
  name: string
  currency: string
  /** The visitor's country has a region of its own, rather than the fallback. */
  served: boolean
  mpesa: boolean
  canShip: boolean
}

/** The region a visitor's country is priced and charged in. */
export function resolveRegion(country?: string | null): ResolvedRegion {
  const code = (country || "").trim().toLowerCase()
  const own = CURRENCY_REGIONS.find((r) => r.countries.includes(code))
  const fallback =
    CURRENCY_REGIONS.find((r) => r.restOfWorld) ||
    CURRENCY_REGIONS.find((r) => r.currency === BASE_CURRENCY) ||
    CURRENCY_REGIONS[0]
  const region = own || fallback
  return {
    name: own ? region.name : "International",
    currency: region.currency,
    served: Boolean(own),
    mpesa: region.payments.includes("daraja_daraja"),
    canShip: !NO_SHIPPING.includes(code),
  }
}
