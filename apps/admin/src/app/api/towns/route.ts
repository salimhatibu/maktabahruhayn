import { NextResponse, type NextRequest } from "next/server"
import { findKenyaCounty } from "@maktabah/shared"
import { addCountyTown, deleteCountyTown, listCountyTowns } from "@maktabah/db"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/** GET /api/towns — every admin-managed town. */
export async function GET() {
  return NextResponse.json({ towns: await listCountyTowns(await db()) }, { headers: { "Cache-Control": "no-store" } })
}

/** POST /api/towns { county, name } — add a town to a county. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { county?: string; name?: string }
  const county = findKenyaCounty(body.county)
  const name = String(body.name || "").trim().replace(/\s+/g, " ")
  if (!county) return NextResponse.json({ message: "Choose a county." }, { status: 400 })
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ message: "A town name needs 2-80 characters." }, { status: 400 })
  }
  if (county.subCounties.some((item) => item.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ message: `${name} is already a sub-county of ${county.name}.` }, { status: 409 })
  }
  const result = await addCountyTown(await db(), county.code, name)
  if (result === "exists") {
    return NextResponse.json({ message: `${name} is already listed under ${county.name}.` }, { status: 409 })
  }
  return NextResponse.json({ added: true }, { status: 201 })
}

/** DELETE /api/towns?id= — remove a town. */
export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ message: "Invalid town." }, { status: 400 })
  if (!(await deleteCountyTown(await db(), id))) {
    return NextResponse.json({ message: "Town not found." }, { status: 404 })
  }
  return NextResponse.json({ id, deleted: true })
}
