export type TownsByCounty = Record<string, string[]>

export function checkoutPlaces(subCounties: readonly string[], towns: TownsByCounty, countyCode: string): string[] {
  return [...subCounties, ...(towns[countyCode] || [])]
}

export async function fetchCheckoutTowns(fetcher: typeof fetch = fetch): Promise<TownsByCounty> {
  const response = await fetcher("/api/towns", { cache: "no-store" })
  if (!response.ok) throw new Error("Could not load delivery towns")
  const data = await response.json() as { towns?: unknown }
  if (!data.towns || typeof data.towns !== "object" || Array.isArray(data.towns) ||
      !Object.values(data.towns).every((names) => Array.isArray(names) && names.every((name) => typeof name === "string"))) {
    throw new Error("Invalid delivery towns response")
  }
  return data.towns as TownsByCounty
}

export function selectedCheckoutTown(places: readonly string[], value: string): string {
  const normalized = value.trim().toLowerCase()
  return places.find((name) => name.toLowerCase() === normalized) || ""
}
