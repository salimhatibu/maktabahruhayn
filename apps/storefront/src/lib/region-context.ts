import { cookies } from "next/headers"
import { CURRENCY_REGIONS, resolveRegion, type ResolvedRegion } from "@maktabah/shared"
import { REGION_COOKIE } from "./config"
import { parseRegionCookie } from "./region"

export type RegionContext = ResolvedRegion & {
  country: string
  /** A region is identified by its currency. */
  regionId: string | null
  regionName: string
}

/**
 * The visitor's region, resolved from the country cookie that middleware sets
 * from CF-IPCountry. Regions are static configuration, so this needs neither a
 * database query nor an API call.
 */
export async function currentRegion(): Promise<RegionContext> {
  const jar = await cookies()
  const { country } = parseRegionCookie(jar.get(REGION_COOKIE)?.value)
  const region = resolveRegion(country)
  return { country, ...region, regionId: region.currency, regionName: region.name }
}

/**
 * Every region a shopper can switch to, in the shape the header's region
 * picker renders. Straight from configuration - no query, no API call.
 */
export function listRegionOptions() {
  return CURRENCY_REGIONS.map((region) => ({
    id: region.currency,
    name: region.name,
    currency_code: region.currency,
    countries: region.countries.map((iso_2) => ({ iso_2 })),
  }))
}

export type ShippingCountry = { code: string; name: string; currency: string }

/** Every country we ship to, with the currency it is charged in. */
export function listShippingCountries(): ShippingCountry[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" })
  return CURRENCY_REGIONS.flatMap((region) =>
    region.countries.map((code) => ({
      code,
      name: names.of(code.toUpperCase()) || code.toUpperCase(),
      currency: region.currency,
    }))
  ).sort((a, b) => a.name.localeCompare(b.name))
}
