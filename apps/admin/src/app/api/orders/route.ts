import { NextResponse, type NextRequest } from "next/server"
import { toMajor } from "@maktabah/db"
import { db } from "@/lib/db"

/** GET /api/orders?q=&status= — the order list with full detail. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get("q") || "").trim().toLowerCase()
  const status = params.get("status")

  const d1 = await db()

  const { results } = await d1
    .prepare(
      `SELECT o.id, o.display_id, o.email, o.customer_id, o.currency_code,
              o.subtotal_minor, o.discount_minor, o.shipping_minor, o.total_minor,
              o.status, o.payment_status, o.fulfillment_status, o.shipping_method,
              o.promotion_code, o.created_at,
              (SELECT COUNT(*) FROM order_item WHERE order_id = o.id) AS item_count,
              (SELECT COALESCE(SUM(total_minor), 0) FROM order_item WHERE order_id = o.id) AS items_total_minor,
              (SELECT provider FROM payment WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) AS provider
         FROM "order" o ORDER BY o.created_at DESC LIMIT 500`
    )
    .all<Record<string, string | number | null>>()

  const customerIds = [...new Set(results.map((r) => r.customer_id).filter(Boolean))]
  const customers: Record<string, { first_name: string | null; last_name: string | null; phone: string | null }> = {}
  if (customerIds.length) {
    const placeholders = customerIds.map(() => "?").join(",")
    const { results: crows } = await d1
      .prepare(`SELECT id, first_name, last_name, phone FROM customer WHERE id IN (${placeholders})`)
      .bind(...customerIds)
      .all<{ id: string; first_name: string | null; last_name: string | null; phone: string | null }>()
    for (const c of crows) {
      customers[c.id] = c
    }
  }

  const rows = results
    .filter((row) => (status && status !== "all" ? row.fulfillment_status === status : true))
    .filter((row) =>
      q ? `${row.display_id} ${row.email}`.toLowerCase().includes(q) : true
    )
    .map((row) => {
      const cust = row.customer_id ? customers[row.customer_id as string] : null
      let shipping: { name?: string; amount_minor?: number } = {}
      try {
        shipping = row.shipping_method ? JSON.parse(row.shipping_method as string) : {}
      } catch { /* ignore */ }
      return {
        id: row.id,
        display_id: row.display_id,
        email: row.email,
        currency_code: row.currency_code,
        customer_name: cust
          ? [cust.first_name, cust.last_name].filter(Boolean).join(" ") || null
          : null,
        customer_phone: cust?.phone || null,
        discount: toMajor(Number(row.discount_minor || 0)),
        item_count: row.item_count,
        items_value: toMajor(Number(row.items_total_minor || 0)),
        shipping_method: shipping.name || null,
        shipping_cost: toMajor(Number(shipping.amount_minor || row.shipping_minor || 0)),
        total: toMajor(Number(row.total_minor || 0)),
        status: row.status,
        payment_status: row.payment_status,
        fulfillment_status: row.fulfillment_status,
        provider: row.provider,
        promotion_code: row.promotion_code,
        created_at: row.created_at,
      }
    })

  return NextResponse.json({ orders: rows, count: rows.length })
}
