import type { CartRow, D1 } from "@maktabah/db"

type CartSummary = {
  id: string
  customer_id: string | null
  email: string | null
  customer_email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  shipping_address: string | null
  created_at: string
  updated_at: string
  payment_provider: string | null
  payment_status: string | null
  reminder_status: string | null
  reminder_error: string | null
}

export async function listAbandonedCarts(
  database: D1,
  getCart: (db: D1, id: string) => Promise<CartRow | null>,
  options: { view: "inactive" | "all"; search: string; page: number; now: Date }
) {
  const limit = 25
  const cutoff = new Date(options.now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const search = options.search.trim().toLowerCase().slice(0, 100)
  const { results } = await database.prepare(
    `SELECT c.id, c.customer_id, c.email, c.shipping_address, c.created_at, c.updated_at,
            customer.email AS customer_email, customer.first_name, customer.last_name, customer.phone,
            reminder.status AS reminder_status, reminder.error AS reminder_error,
            (SELECT provider FROM (
               SELECT p.provider AS provider, p.created_at AS created_at, p.rowid AS sequence
                 FROM payment p WHERE p.cart_id = c.id
               UNION ALL
               SELECT 'mpesa' AS provider, m.created_at AS created_at, m.rowid AS sequence
                 FROM mpesa_checkout m WHERE m.cart_id = c.id
             ) ORDER BY created_at DESC, sequence DESC LIMIT 1) AS payment_provider,
            (SELECT status FROM (
               SELECT p.status AS status, p.created_at AS created_at, p.rowid AS sequence
                 FROM payment p WHERE p.cart_id = c.id
               UNION ALL
               SELECT m.status AS status, m.created_at AS created_at, m.rowid AS sequence
                 FROM mpesa_checkout m WHERE m.cart_id = c.id
             ) ORDER BY created_at DESC, sequence DESC LIMIT 1) AS payment_status
       FROM cart c LEFT JOIN customer ON customer.id = c.customer_id
       LEFT JOIN cart_reminder reminder ON reminder.cart_id = c.id
      WHERE c.completed_order_id IS NULL
        AND EXISTS (SELECT 1 FROM cart_item i WHERE i.cart_id = c.id)
        AND (?1 = 'all' OR c.updated_at <= ?2)
        AND (?3 = '' OR instr(lower(coalesce(c.email, '') || ' ' || coalesce(customer.email, '') || ' ' ||
             coalesce(customer.first_name, '') || ' ' || coalesce(customer.last_name, '') || ' ' ||
             coalesce(customer.phone, '') || ' ' || coalesce(c.shipping_address, '')), ?3) > 0)
      ORDER BY c.updated_at DESC, c.id DESC LIMIT ?4 OFFSET ?5`
  ).bind(options.view, cutoff, search, limit + 1, options.page * limit).all<CartSummary>()

  const carts = await Promise.all(results.slice(0, limit).map(async (row) => {
    const cart = await getCart(database, row.id)
    if (!cart || cart.completedOrderId || !cart.lines.length) return null
    let address: Record<string, unknown> = {}
    try {
      address = row.shipping_address ? JSON.parse(row.shipping_address) : {}
      if (!address || typeof address !== "object") address = {}
    } catch { /* Older or malformed address data is not needed for this list. */ }
    const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null
    const name = [text(address.first_name) || text(row.first_name), text(address.last_name) || text(row.last_name)]
      .filter(Boolean).join(" ") || null
    return {
      customer_type: row.customer_id ? "linked" : "anonymous",
      name,
      email: text(row.email) || text(row.customer_email),
      phone: text(address.phone) || text(row.phone),
      currency: cart.currency,
      items: cart.lines.map((line) => ({
        title: line.productTitle,
        variant: line.variantTitle,
        quantity: line.quantity,
        unit_price: line.unitPriceMinor / 100,
      })),
      subtotal: cart.totals.itemSubtotalMinor / 100,
      discount: cart.totals.discountMinor / 100,
      shipping: cart.totals.shippingMinor / 100,
      total: cart.totals.totalMinor / 100,
      created_at: row.created_at,
      updated_at: row.updated_at,
      payment: row.payment_status ? { provider: row.payment_provider, status: row.payment_status } : null,
      reminder: row.reminder_status ? { status: row.reminder_status, error: row.reminder_error } : null,
    }
  }))
  return { carts: carts.filter((cart) => cart !== null), has_more: results.length > limit }
}
