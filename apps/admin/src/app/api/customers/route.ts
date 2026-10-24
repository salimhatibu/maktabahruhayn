import { NextResponse, type NextRequest } from "next/server"
import { newId, toMajor } from "@maktabah/db"
import { db } from "@/lib/db"

/** GET /api/customers?q= — customers with what they have spent. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase()

  const { results } = await (await db())
    .prepare(
      `SELECT c.id, c.email, c.first_name, c.last_name, c.phone, c.created_at,
              (SELECT COUNT(*) FROM "order" WHERE customer_id = c.id) AS orders,
              (SELECT COALESCE(SUM(total_minor), 0) FROM "order"
                WHERE customer_id = c.id AND payment_status = 'captured') AS spent_minor,
              (SELECT COUNT(*) FROM customer_address WHERE customer_id = c.id) AS addresses
         FROM customer c ORDER BY c.created_at DESC LIMIT 500`
    )
    .all<Record<string, string | number | null>>()

  const rows = results
    .filter((row) =>
      q ? `${row.email} ${row.first_name || ""} ${row.last_name || ""}`.toLowerCase().includes(q) : true
    )
    .map((row) => ({ ...row, spent: toMajor(Number(row.spent_minor || 0)) }))

  return NextResponse.json({ customers: rows, count: rows.length })
}

/** POST /api/customers — bulk import from CSV. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    customers: { email: string; first_name?: string; last_name?: string; phone?: string }[]
  }
  const rows = body.customers || []
  if (!rows.length) {
    return NextResponse.json({ message: "No customers provided." }, { status: 400 })
  }

  const d1 = await db()
  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const email = (row.email || "").trim().toLowerCase()
    if (!email) {
      skipped++
      continue
    }
    const existing = await d1
      .prepare("SELECT id FROM customer WHERE email = ? COLLATE NOCASE")
      .bind(email)
      .first<{ id: string }>()
    if (existing) {
      skipped++
      continue
    }
    await d1
      .prepare(
        `INSERT INTO customer (id, email, first_name, last_name, phone)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        newId("cust"),
        email,
        (row.first_name || "").trim() || null,
        (row.last_name || "").trim() || null,
        (row.phone || "").trim() || null
      )
      .run()
    imported++
  }

  return NextResponse.json({ imported, skipped })
}

/** DELETE /api/customers { ids } — bulk delete. */
export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { ids: string[] }
  const ids = body.ids || []
  if (!ids.length) {
    return NextResponse.json({ message: "No customer IDs provided." }, { status: 400 })
  }

  const d1 = await db()
  const stmts = ids.map((id) => d1.prepare("DELETE FROM customer WHERE id = ?1").bind(id))
  await d1.batch(stmts)

  return NextResponse.json({ deleted: ids.length })
}
