/** The visitor's country; the Medusa region (and so currency) follows from it. */
export type RegionPreference = { country: string }

export function normalizeCountry(code?: string | null): string {
  const value = (code || "").trim().toUpperCase()
  return /^[A-Z]{2}$/.test(value) && value !== "XX" && value !== "T1" ? value : "US"
}

export function regionFromCountry(code?: string | null): RegionPreference {
  return { country: normalizeCountry(code) }
}

/** Accepts the current JSON cookie and older shapes. */
export function parseRegionCookie(raw?: string | null): RegionPreference {
  if (!raw) {
    return regionFromCountry("US")
  }
  try {
    const parsed = JSON.parse(raw) as { country?: string }
    return regionFromCountry(parsed.country)
  } catch {
    return regionFromCountry(raw)
  }
}
