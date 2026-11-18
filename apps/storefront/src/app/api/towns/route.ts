import { NextResponse } from "next/server"
import { listCountyTowns } from "@maktabah/db"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/** Towns the address form offers beside each county's sub-counties, by county code. */
export async function GET() {
  const towns: Record<string, string[]> = {}
  for (const town of await listCountyTowns(await db())) {
    ;(towns[town.county_code] ||= []).push(town.name)
  }
  return NextResponse.json({ towns }, { headers: { "Cache-Control": "no-store" } })
}
