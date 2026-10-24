import { NextResponse, type NextRequest } from "next/server"
import { newId } from "@maktabah/db"
import { db } from "@/lib/db"

/** POST /api/categories { name, parent_id } — the editor's quick-add. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { name?: string; parent_id?: string | null }
  const name = String(body.name || "").trim()
  if (!name) {
    return NextResponse.json({ message: "Enter a category name." }, { status: 400 })
  }
  const handle = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)

  const id = newId("cat")
  try {
    await (await db())
      .prepare(`INSERT INTO category (id, handle, name, parent_id) VALUES (?1, ?2, ?3, ?4)`)
      .bind(id, handle, name, body.parent_id || null)
      .run()
  } catch {
    return NextResponse.json({ message: "A category with that name already exists." }, { status: 409 })
  }
  return NextResponse.json({ id, handle, name })
}
