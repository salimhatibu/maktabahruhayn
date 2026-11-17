import { NextResponse, type NextRequest } from "next/server"
import { newId } from "@maktabah/db"
import { db } from "@/lib/db"
import { present, toColumns, type PromotionInput } from "@/lib/promotions"

const COLUMNS = `code, description, type, value, currency_code, min_subtotal_minor,
  starts_at, ends_at, usage_limit, is_active, automatic`

/** GET /api/promotions — every promotion, newest first. */
export async function GET() {
  const { results } = await (await db())
    .prepare(`SELECT id, ${COLUMNS}, used_count FROM promotion ORDER BY rowid DESC LIMIT 500`)
    .all<Record<string, unknown>>()
  return NextResponse.json({ promotions: results.map(present) })
}

/** POST /api/promotions — create a promotion. */
export async function POST(request: NextRequest) {
  let columns
  try {
    columns = toColumns((await request.json()) as PromotionInput)
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 })
  }
  const database = await db()
  const taken = await database.prepare(`SELECT 1 FROM promotion WHERE code = ?1 COLLATE NOCASE`).bind(columns.code).first()
  if (taken) {
    return NextResponse.json({ message: `The code ${columns.code} already exists.` }, { status: 409 })
  }
  const id = newId("promo")
  await database
    .prepare(`INSERT INTO promotion (id, ${COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
    .bind(
      id,
      columns.code,
      columns.description,
      columns.type,
      columns.value,
      columns.currency_code,
      columns.min_subtotal_minor,
      columns.starts_at,
      columns.ends_at,
      columns.usage_limit,
      columns.is_active,
      columns.automatic
    )
    .run()
  return NextResponse.json({ id }, { status: 201 })
}
