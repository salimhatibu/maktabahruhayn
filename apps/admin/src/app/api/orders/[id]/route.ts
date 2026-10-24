import { NextResponse, type NextRequest } from "next/server"
import { toMajor } from "@maktabah/db"
import { db } from "@/lib/db"

/** GET /api/orders/:id — one order with its items, payment and shipment. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const database = await db()

  const order = await database
    .prepare(`SELECT * FROM "order" WHERE id = ?1`)
    .bind(id)
    .first<Record<string, string | number | null>>()
  if (!order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 })
  }

  const [items, payments, shipments] = await database.batch<Record<string, string | number | null>>([
    database.prepare(`SELECT * FROM order_item WHERE order_id = ?1`).bind(id),
    database.prepare(`SELECT * FROM payment WHERE order_id = ?1 ORDER BY created_at DESC`).bind(id),
    database.prepare(`SELECT * FROM shipment WHERE order_id = ?1 ORDER BY created_at DESC`).bind(id),
  ])

  return NextResponse.json({
    order: {
      ...order,
      subtotal: toMajor(Number(order.subtotal_minor || 0)),
      discount: toMajor(Number(order.discount_minor || 0)),
      shipping: toMajor(Number(order.shipping_minor || 0)),
      total: toMajor(Number(order.total_minor || 0)),
      shipping_address: JSON.parse(String(order.shipping_address || "{}")),
      items: items.results.map((item) => ({
        ...item,
        unit_price: toMajor(Number(item.unit_price_minor || 0)),
        total: toMajor(Number(item.total_minor || 0)),
      })),
      payments: payments.results.map((payment) => ({
        ...payment,
        amount: toMajor(Number(payment.amount_minor || 0)),
      })),
      shipments: shipments.results,
    },
  })
}

/** POST /api/orders/:id — update order status, details, or tracking. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json()) as {
    fulfillment_status?: string
    payment_status?: string
    status?: string
    email?: string
    shipping_address?: Record<string, string>
    tracking_number?: string
    tracking_url?: string
  }
  const database = await db()

  const order = await database.prepare(`SELECT id FROM "order" WHERE id = ?1`).bind(id).first()
  if (!order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 })
  }

  const sets: string[] = []
  const params: unknown[] = [id]

  if (body.fulfillment_status) {
    if (!["not_fulfilled", "shipped", "delivered", "returned"].includes(body.fulfillment_status)) {
      return NextResponse.json({ message: "Unknown fulfillment status." }, { status: 400 })
    }
    sets.push(`fulfillment_status = ?${params.length + 1}`)
    params.push(body.fulfillment_status)
  }

  if (body.payment_status) {
    if (!["awaiting", "authorized", "captured", "failed", "refunded"].includes(body.payment_status)) {
      return NextResponse.json({ message: "Unknown payment status." }, { status: 400 })
    }
    sets.push(`payment_status = ?${params.length + 1}`)
    params.push(body.payment_status)
  }

  if (body.status) {
    if (!["pending", "completed", "cancelled"].includes(body.status)) {
      return NextResponse.json({ message: "Unknown order status." }, { status: 400 })
    }
    sets.push(`status = ?${params.length + 1}`)
    params.push(body.status)
  }

  if (body.email) {
    sets.push(`email = ?${params.length + 1}`)
    params.push(body.email.trim())
  }

  if (body.shipping_address) {
    sets.push(`shipping_address = ?${params.length + 1}`)
    params.push(JSON.stringify(body.shipping_address))
  }

  if (sets.length) {
    sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    await database
      .prepare(`UPDATE "order" SET ${sets.join(", ")} WHERE id = ?1`)
      .bind(...params)
      .run()
  }

  if (body.tracking_number) {
    await database
      .prepare(
        `INSERT INTO shipment (id, order_id, provider, tracking_number, tracking_url, status)
         VALUES (?1, ?2, 'manual', ?3, ?4, 'shipped')`
      )
      .bind(`shp_${id.slice(-8)}_${Date.now().toString(36)}`, id, body.tracking_number, body.tracking_url || null)
      .run()
  }

  return NextResponse.json({ id, updated: true })
}
