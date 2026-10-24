import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/customers/:id — one customer. */
export async function GET(_request: NextRequest, context: Ctx) {
  const { id } = await context.params
  const customer = await (await db())
    .prepare("SELECT * FROM customer WHERE id = ?1")
    .bind(id)
    .first<Record<string, string | number | null>>()
  if (!customer) {
    return NextResponse.json({ message: "Customer not found." }, { status: 404 })
  }
  return NextResponse.json({ customer })
}

/** PUT /api/customers/:id — edit a customer. */
export async function PUT(request: NextRequest, context: Ctx) {
  const { id } = await context.params
  const body = (await request.json()) as {
    email?: string
    first_name?: string
    last_name?: string
    phone?: string
  }
  const d1 = await db()

  const existing = await d1.prepare("SELECT id FROM customer WHERE id = ?1").bind(id).first()
  if (!existing) {
    return NextResponse.json({ message: "Customer not found." }, { status: 404 })
  }

  const sets: string[] = []
  const params: unknown[] = []
  let idx = 1

  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ message: "Email is required." }, { status: 400 })
    }
    const dupe = await d1
      .prepare("SELECT id FROM customer WHERE email = ?1 COLLATE NOCASE AND id != ?2")
      .bind(email, id)
      .first()
    if (dupe) {
      return NextResponse.json({ message: "Another customer already has that email." }, { status: 409 })
    }
    sets.push(`email = ?${++idx}`)
    params.push(email)
  }
  if (body.first_name !== undefined) {
    sets.push(`first_name = ?${++idx}`)
    params.push(body.first_name.trim() || null)
  }
  if (body.last_name !== undefined) {
    sets.push(`last_name = ?${++idx}`)
    params.push(body.last_name.trim() || null)
  }
  if (body.phone !== undefined) {
    sets.push(`phone = ?${++idx}`)
    params.push(body.phone.trim() || null)
  }

  if (!sets.length) {
    return NextResponse.json({ message: "Nothing to update." }, { status: 400 })
  }

  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  await d1
    .prepare(`UPDATE customer SET ${sets.join(", ")} WHERE id = ?1`)
    .bind(id, ...params)
    .run()

  return NextResponse.json({ id, updated: true })
}

/** DELETE /api/customers/:id — delete one customer. */
export async function DELETE(_request: NextRequest, context: Ctx) {
  const { id } = await context.params
  const d1 = await db()
  await d1.prepare("DELETE FROM customer WHERE id = ?1").bind(id).run()
  return NextResponse.json({ id, deleted: true })
}
