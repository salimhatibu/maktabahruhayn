import type { D1 } from "./client"

export type CountyTown = { id: number; county_code: string; name: string }

/** Admin-managed towns, grouped by county code, in alphabetical order. */
export async function listCountyTowns(db: D1): Promise<CountyTown[]> {
  const { results } = await db
    .prepare(`SELECT id, county_code, name FROM county_town ORDER BY name COLLATE NOCASE`)
    .all<CountyTown>()
  return results
}

/** The stored spelling of a town in a county, or null when it is not on the list. */
export async function findCountyTown(db: D1, countyCode: string, name: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT name FROM county_town WHERE county_code = ?1 AND name = ?2 COLLATE NOCASE`)
    .bind(countyCode, name.trim())
    .first<{ name: string }>()
  return row?.name ?? null
}

export async function addCountyTown(db: D1, countyCode: string, name: string): Promise<"added" | "exists"> {
  const result = await db
    .prepare(`INSERT OR IGNORE INTO county_town (county_code, name) VALUES (?1, ?2)`)
    .bind(countyCode, name.trim())
    .run()
  return result.meta?.changes ? "added" : "exists"
}

export async function deleteCountyTown(db: D1, id: number): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM county_town WHERE id = ?1`).bind(id).run()
  return Boolean(result.meta?.changes)
}
