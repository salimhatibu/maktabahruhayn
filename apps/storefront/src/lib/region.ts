/**
 * The visitor's country; their region, and so their currency, follows from it.
 * `manual` marks a country the shopper chose (the region picker, or a delivery
 * address), which IP-based detection must then leave alone.
 */
export type RegionPreference = { country: string; manual?: boolean }

export function normalizeCountry(code?: string | null): string {
  const value = (code || "").trim().toUpperCase()
  return /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1" ? value : "US"
}

export function regionFromCountry(code?: string | null): RegionPreference {
  return { country: normalizeCountry(code) }
}

export function manualRegion(code?: string | null): RegionPreference {
  return { country: normalizeCountry(code), manual: true }
}

/** Accepts the current JSON cookie and older shapes. */
export function parseRegionCookie(raw?: string | null): RegionPreference {
  if (!raw) {
    return regionFromCountry("US")
  }
  try {
    const parsed = JSON.parse(raw) as { country?: string; manual?: boolean }
    return { country: normalizeCountry(parsed.country), ...(parsed.manual === true ? { manual: true } : {}) }
  } catch {
    return regionFromCountry(raw)
  }
}
