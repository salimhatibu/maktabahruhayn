import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"
import { toColumns, type PromotionInput } from "@/lib/promotions"

type Context = { params: Promise<{ id: string }> }

/** PUT /api/promotions/:id — replace a promotion's settings. Its usage count is kept. */
export async function PUT(request: NextRequest, context: Context) {
  const { id } = await context.params
  let columns
  try {
    columns = toColumns((await request.json()) as PromotionInput)
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 })
  }
  const database = await db()
  const clash = await database
    .prepare(`SELECT 1 FROM promotion WHERE code = ?1 COLLATE NOCASE AND id != ?2`)
    .bind(columns.code, id)
    .first()
  if (clash) {
    return NextResponse.json({ message: `The code ${columns.code} already exists.` }, { status: 409 })
  }
  const result = await database
    .prepare(
      `UPDATE promotion SET code = ?2, description = ?3, type = ?4, value = ?5, currency_code = ?6,
              min_subtotal_minor = ?7, starts_at = ?8, ends_at = ?9, usage_limit = ?10,
              is_active = ?11, automatic = ?12
        WHERE id = ?1`
    )
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
  if (!result.meta?.changes) {
    return NextResponse.json({ message: "Promotion not found." }, { status: 404 })
  }
  return NextResponse.json({ id })
}

/** DELETE /api/promotions/:id */
export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params
  await (await db()).prepare(`DELETE FROM promotion WHERE id = ?1`).bind(id).run()
  return NextResponse.json({ id, deleted: true })
}
