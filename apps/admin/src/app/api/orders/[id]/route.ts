import { NextResponse, type NextRequest } from "next/server"
import { notifyOrder, toMajor } from "@maktabah/db"
import { db } from "@/lib/db"
import { orderNotificationConfig } from "@/lib/order-notifications"

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

  const [items, payments, shipments, notifications] = await database.batch<Record<string, string | number | null>>([
    database.prepare(`SELECT oi.*, p.delivery_type FROM order_item oi
      LEFT JOIN variant v ON v.id = oi.variant_id LEFT JOIN product p ON p.id = v.product_id
      WHERE oi.order_id = ?1`).bind(id),
    database.prepare(`SELECT * FROM payment WHERE order_id = ?1 ORDER BY created_at DESC`).bind(id),
    database.prepare(`SELECT * FROM shipment WHERE order_id = ?1 ORDER BY created_at DESC`).bind(id),
    database.prepare(`SELECT event, status FROM order_notification WHERE order_id = ?1`).bind(id),
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
      notifications: notifications.results,
    },
  })
}

/** DELETE /api/orders/:id — permanently remove the order and its payment history. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const database = await db()
  const result = await database.prepare(`DELETE FROM "order" WHERE id = ?1`).bind(id).run()
  if (!result.meta?.changes) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 })
  }
  return NextResponse.json({ id, deleted: true })
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
    retry_notification?: string
  }
  const database = await db()

  const order = await database.prepare(`SELECT id, status, payment_status, fulfillment_status FROM "order" WHERE id = ?1`).bind(id)
    .first<{ id: string; status: string; payment_status: string; fulfillment_status: string }>()
  if (!order) {
    return NextResponse.json({ message: "Order not found." }, { status: 404 })
  }
  if (body.retry_notification && !(
    (body.retry_notification === "order_placed" && order.payment_status === "captured") ||
    (body.retry_notification === "order_completed" && order.status === "completed") ||
    (body.retry_notification === "review_request" && order.fulfillment_status === "delivered") ||
    (body.retry_notification === "digital_delivery" && order.payment_status === "captured" && order.status !== "cancelled")
  )) {
    return NextResponse.json({ message: "That notification cannot be sent for this order." }, { status: 400 })
  }

  const sets: string[] = []
  const params: unknown[] = [id]

  if (body.fulfillment_status) {
    if (!["not_fulfilled", "shipped", "delivered", "returned"].includes(body.fulfillment_status)) {
      return NextResponse.json({ message: "Unknown fulfillment status." }, { status: 400 })
    }
    sets.push(`fulfillment_status = ?${params.length + 1}`)
    params.push(body.fulfillment_status)
    if (body.fulfillment_status === "delivered") {
      sets.push(`delivered_at = COALESCE(delivered_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
    }
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

  const event = body.retry_notification === "order_placed" || body.retry_notification === "order_completed" || body.retry_notification === "review_request" || body.retry_notification === "digital_delivery"
    ? body.retry_notification
    : body.status === "completed" && order.status !== "completed"
    ? "order_completed"
    : body.payment_status === "captured" && order.payment_status !== "captured"
      ? "order_placed"
      : null
  const config = orderNotificationConfig()
  const notification = event ? await notifyOrder(database, id, event, config) : null
  const digital = !body.retry_notification &&
    (body.payment_status === "captured" || (order.payment_status === "captured" && !body.payment_status)) &&
    ((body.status === "completed" && order.status !== "completed") ||
      (body.payment_status === "captured" && order.payment_status !== "captured"))
    ? await notifyOrder(database, id, "digital_delivery", config)
    : null
  return NextResponse.json({ id, updated: true, notificationError: notification?.error || digital?.error })
}
