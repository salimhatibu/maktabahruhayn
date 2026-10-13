import type { OrderDetailDTO, RemoteQueryFunction } from "@medusajs/framework/types"
import { getLastFulfillmentStatus, getLastPaymentStatus } from "@medusajs/medusa/core-flows"
import { convertAmount } from "./fx-rates"

type Query = Omit<RemoteQueryFunction, symbol>

export type DateRange = { from: Date; to: Date }

type OrderRow = {
  id: string
  display_id: number
  created_at: string
  email: string | null
  status: string
  payment_status?: string
  fulfillment_status?: string
  total: number
  currency_code: string
  customer_id: string | null
  metadata: Record<string, unknown> | null
  sales_channel?: { name: string } | null
  region?: { name: string } | null
  items?: { product_id: string | null; product_title: string | null; title: string; quantity: number; unit_price: number; thumbnail?: string | null }[]
  payment_collections?: {
    payments?: { provider_id: string; amount: number; currency_code: string; captured_at: string | null; refunds?: { amount: number }[] }[]
  }[]
}

/**
 * Payment and fulfilment status are not stored on the order; Medusa computes
 * them from these relations (the same way its order list does).
 */
const STATUS_FIELDS = [
  "currency_code",
  "payment_collections.status",
  "payment_collections.amount",
  "payment_collections.captured_amount",
  "payment_collections.refunded_amount",
  "fulfillments.packed_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "items.raw_quantity",
  "items.detail.raw_fulfilled_quantity",
]

function withStatuses<T extends Record<string, unknown>>(order: T): T & { payment_status: string; fulfillment_status: string } {
  const detail = { payment_collections: [], fulfillments: [], items: [], ...order } as unknown as OrderDetailDTO
  return { ...order, payment_status: getLastPaymentStatus(detail), fulfillment_status: getLastFulfillmentStatus(detail) }
}

const ORDER_FIELDS = [
  ...STATUS_FIELDS,
  "id",
  "display_id",
  "created_at",
  "email",
  "status",
  "total",
  "currency_code",
  "customer_id",
  "metadata",
  "sales_channel.name",
  "region.name",
  "items.product_id",
  "items.product_title",
  "items.thumbnail",
  "items.title",
  "items.quantity",
  "items.unit_price",
  "payment_collections.payments.provider_id",
  "payment_collections.payments.amount",
  "payment_collections.payments.currency_code",
  "payment_collections.payments.captured_at",
  "payment_collections.payments.refunds.amount",
]

/** Orders created within the range (newest first). Sized for a single store. */
export async function ordersInRange(query: Query, range: DateRange, take = 5000): Promise<OrderRow[]> {
  const { data } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { created_at: { $gte: range.from.toISOString(), $lte: range.to.toISOString() } },
    pagination: { take, order: { created_at: "DESC" } },
  })
  return (data as Record<string, unknown>[]).map(withStatuses) as unknown as OrderRow[]
}

async function toReporting(amount: number, currency: string, reporting: string) {
  return (await convertAmount(Number(amount) || 0, currency, reporting)) ?? 0
}

const PROVIDER_LABELS: Record<string, string> = {
  pp_daraja_daraja: "M-Pesa",
  pp_stripe_stripe: "Card (Stripe)",
  pp_system_default: "Manual / Test",
}

/** Calendar day in the server's time zone, matching the requested range. */
function dayKey(value: string | Date) {
  return new Date(value).toLocaleDateString("en-CA")
}

/** Totals for one period, in the reporting currency. */
async function summarize(orders: OrderRow[], reporting: string) {
  let gmv = 0
  let revenue = 0
  const customers = new Set<string>()
  const valid = orders.filter((o) => o.status !== "canceled")
  for (const o of valid) {
    gmv += await toReporting(o.total, o.currency_code, reporting)
    customers.add(o.customer_id || o.email || o.id)
    for (const pc of o.payment_collections || []) {
      for (const p of pc.payments || []) {
        if (p.captured_at) {
          const refunded = (p.refunds || []).reduce((n, r) => n + Number(r.amount), 0)
          revenue += await toReporting(Number(p.amount) - refunded, p.currency_code, reporting)
        }
      }
    }
  }
  return { gmv, revenue, orders: valid.length, customers: customers.size }
}

function change(current: number, previous: number): number | null {
  if (!previous) {
    return current ? null : 0
  }
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function buildDashboard(query: Query, range: DateRange, reporting: string) {
  const span = range.to.getTime() - range.from.getTime()
  const previousRange = { from: new Date(range.from.getTime() - span), to: new Date(range.from.getTime() - 1) }

  const [orders, previousOrders] = await Promise.all([
    ordersInRange(query, range),
    ordersInRange(query, previousRange),
  ])
  const [current, previous] = await Promise.all([summarize(orders, reporting), summarize(previousOrders, reporting)])

  // Daily series
  const days: Record<string, { date: string; orders: number; gmv: number }> = {}
  for (let t = new Date(range.from); t <= range.to; t = new Date(t.getTime() + 86400000)) {
    const key = dayKey(t)
    days[key] = { date: key, orders: 0, gmv: 0 }
  }
  days[dayKey(range.to)] ??= { date: dayKey(range.to), orders: 0, gmv: 0 }
  const channels: Record<string, { name: string; orders: number; value: number }> = {}
  const regions: Record<string, { name: string; orders: number; value: number }> = {}
  const payments: Record<string, { name: string; count: number; value: number }> = {}
  const books: Record<string, { product_id: string; title: string; thumbnail: string | null; quantity: number; value: number }> = {}

  for (const o of orders.filter((x) => x.status !== "canceled")) {
    const value = await toReporting(o.total, o.currency_code, reporting)
    const day = days[dayKey(o.created_at)]
    if (day) {
      day.orders += 1
      day.gmv += value
    }
    const channel = o.metadata?.affiliate_code
      ? `Affiliate: ${String(o.metadata.affiliate_code)}`
      : o.sales_channel?.name || "Unknown"
    channels[channel] ??= { name: channel, orders: 0, value: 0 }
    channels[channel].orders += 1
    channels[channel].value += value

    const region = o.region?.name || o.currency_code.toUpperCase()
    regions[region] ??= { name: region, orders: 0, value: 0 }
    regions[region].orders += 1
    regions[region].value += value

    for (const pc of o.payment_collections || []) {
      for (const p of pc.payments || []) {
        const name = PROVIDER_LABELS[p.provider_id] || p.provider_id
        payments[name] ??= { name, count: 0, value: 0 }
        payments[name].count += 1
        payments[name].value += await toReporting(p.amount, p.currency_code, reporting)
      }
    }
    for (const item of o.items || []) {
      const key = item.product_id || item.title
      books[key] ??= {
        product_id: item.product_id || "",
        title: item.product_title || item.title,
        thumbnail: item.thumbnail || null,
        quantity: 0,
        value: 0,
      }
      books[key].quantity += item.quantity
      books[key].value += await toReporting(Number(item.unit_price) * item.quantity, o.currency_code, reporting)
    }
  }

  const { data: products } = await query.graph({ entity: "product", fields: ["id", "created_at"] })
  const newProducts = products.filter((p) => {
    const t = new Date(p.created_at as string).getTime()
    return t >= range.from.getTime() && t <= range.to.getTime()
  }).length

  const { data: customers } = await query.graph({ entity: "customer", fields: ["id"], filters: { has_account: true } })

  const abandoned = await abandonedCarts(query, { olderThanHours: 1, limit: 500 })

  const round = (n: number) => Math.round(n * 100) / 100
  return {
    currency: reporting,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    kpis: {
      gmv: { value: round(current.gmv), change: change(current.gmv, previous.gmv) },
      revenue: { value: round(current.revenue), change: change(current.revenue, previous.revenue) },
      orders: { value: current.orders, change: change(current.orders, previous.orders) },
      average_order: {
        value: current.orders ? round(current.gmv / current.orders) : 0,
        change: change(current.orders ? current.gmv / current.orders : 0, previous.orders ? previous.gmv / previous.orders : 0),
      },
      products: { value: products.length, new_in_period: newProducts },
      active_customers: { value: current.customers, change: change(current.customers, previous.customers), accounts: customers.length },
      abandoned_carts: { value: abandoned.length, potential: round(await sumCarts(abandoned, reporting)) },
    },
    series: Object.values(days).map((d) => ({ ...d, gmv: round(d.gmv) })),
    channels: Object.values(channels).map((c) => ({ ...c, value: round(c.value) })).sort((a, b) => b.orders - a.orders),
    regions: Object.values(regions).map((r) => ({ ...r, value: round(r.value) })).sort((a, b) => b.value - a.value),
    payments: Object.values(payments).map((p) => ({ ...p, value: round(p.value) })).sort((a, b) => b.value - a.value),
    top_books: Object.values(books)
      .map((b) => ({ ...b, value: round(b.value) }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8),
    recent_orders: orders.slice(0, 8).map((o) => ({
      id: o.id,
      display_id: o.display_id,
      created_at: o.created_at,
      email: o.email,
      total: o.total,
      currency_code: o.currency_code,
      payment_status: o.payment_status,
      fulfillment_status: o.fulfillment_status,
      status: o.status,
    })),
    low_stock: await lowStock(query, 5),
    action_items: await actionItems(query, abandoned),
  }
}

/**
 * Work waiting for the team, independent of the selected date range:
 * orders to fulfil, payments to capture, stock to reorder, carts to chase.
 */
async function actionItems(query: Query, abandoned: AbandonedCart[]) {
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", ...STATUS_FIELDS],
    filters: { status: { $nin: ["canceled", "archived", "draft"] } },
    pagination: { take: 2000 },
  })
  const orders = (data as Record<string, unknown>[]).map(withStatuses)
  const toFulfil = orders.filter((o) => ["not_fulfilled", "partially_fulfilled"].includes(String(o.fulfillment_status))).length
  const toCapture = orders.filter((o) => ["authorized", "partially_authorized"].includes(String(o.payment_status))).length
  const stock = await stockRows(query)
  return {
    orders_to_fulfil: toFulfil,
    payments_to_capture: toCapture,
    out_of_stock: stock.filter((r) => r.available <= 0 && !r.allow_backorder).length,
    low_stock: stock.filter((r) => r.available > 0 && r.available <= 5).length,
    carts_to_remind: abandoned.filter((c) => c.email && !c.reminder_sent_at).length,
  }
}

export type AbandonedCart = {
  id: string
  email: string | null
  currency_code: string
  updated_at: string
  created_at: string
  item_total: number
  items: { title: string; quantity: number; unit_price: number; thumbnail?: string | null }[]
  customer_name: string | null
  reminder_sent_at: string | null
}

/** Carts with items, never completed, idle for at least `olderThanHours`. */
export async function abandonedCarts(
  query: Query,
  opts: { olderThanHours: number; limit?: number }
): Promise<AbandonedCart[]> {
  const cutoff = new Date(Date.now() - opts.olderThanHours * 3600000).toISOString()
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "email",
      "currency_code",
      "created_at",
      "updated_at",
      "completed_at",
      "metadata",
      "customer.first_name",
      "customer.last_name",
      "items.product_title",
      "items.title",
      "items.quantity",
      "items.unit_price",
      "items.thumbnail",
    ],
    filters: { completed_at: null, updated_at: { $lte: cutoff } },
    pagination: { take: opts.limit || 200, order: { updated_at: "DESC" } },
  })
  type RawCart = Omit<AbandonedCart, "items" | "item_total" | "customer_name" | "reminder_sent_at"> & {
    items: { product_title?: string; title: string; quantity: number; unit_price: number; thumbnail?: string }[]
    customer?: { first_name?: string; last_name?: string } | null
    metadata?: Record<string, unknown> | null
  }
  return (data as unknown as RawCart[])
    .filter((c) => c.items?.length)
    .map((c) => ({
      id: c.id,
      email: c.email,
      currency_code: c.currency_code,
      created_at: c.created_at,
      updated_at: c.updated_at,
      items: c.items.map((i) => ({ title: i.product_title || i.title, quantity: i.quantity, unit_price: Number(i.unit_price), thumbnail: i.thumbnail })),
      item_total: c.items.reduce((n, i) => n + Number(i.unit_price) * i.quantity, 0),
      customer_name: [c.customer?.first_name, c.customer?.last_name].filter(Boolean).join(" ") || null,
      reminder_sent_at: (c.metadata?.reminder_sent_at as string | undefined) || null,
    }))
}

async function sumCarts(carts: AbandonedCart[], reporting: string) {
  let total = 0
  for (const c of carts) {
    total += await toReporting(c.item_total, c.currency_code, reporting)
  }
  return total
}

export type StockRow = {
  inventory_item_id: string
  sku: string | null
  title: string
  product_id: string | null
  variant_title: string | null
  location_id: string | null
  stocked: number
  reserved: number
  available: number
  allow_backorder: boolean
}

/** Inventory per variant at its first stock location. */
export async function stockRows(query: Query): Promise<StockRow[]> {
  const { data } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "title",
      "sku",
      "allow_backorder",
      "manage_inventory",
      "product.id",
      "product.title",
      "inventory_items.inventory_item_id",
      "inventory_items.inventory.location_levels.location_id",
      "inventory_items.inventory.location_levels.stocked_quantity",
      "inventory_items.inventory.location_levels.reserved_quantity",
    ],
  })
  type Row = {
    title: string
    sku: string | null
    allow_backorder: boolean
    manage_inventory: boolean
    product?: { id: string; title: string } | null
    inventory_items?: {
      inventory_item_id: string
      inventory?: { location_levels?: { location_id: string; stocked_quantity: number; reserved_quantity: number }[] } | null
    }[]
  }
  return (data as unknown as Row[])
    .filter((v) => v.manage_inventory && v.inventory_items?.length)
    .map((v) => {
      const item = v.inventory_items![0]
      const level = item.inventory?.location_levels?.[0]
      const stocked = Number(level?.stocked_quantity || 0)
      const reserved = Number(level?.reserved_quantity || 0)
      return {
        inventory_item_id: item.inventory_item_id,
        sku: v.sku,
        title: v.product?.title || v.title,
        product_id: v.product?.id || null,
        variant_title: v.title,
        location_id: level?.location_id || null,
        stocked,
        reserved,
        available: stocked - reserved,
        allow_backorder: v.allow_backorder,
      }
    })
    .sort((a, b) => a.available - b.available)
}

async function lowStock(query: Query, threshold: number) {
  return (await stockRows(query)).filter((r) => r.available <= threshold).slice(0, 10)
}
