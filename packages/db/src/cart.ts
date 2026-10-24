import type { D1 } from "./client"
import { BASE_CURRENCY, convert } from "./money"
import { getFxRates } from "./catalogue"
import { newId } from "./writes"

export type CartLineRow = {
  id: string
  variantId: string
  productId: string
  productHandle: string
  productTitle: string
  productSubtitle: string | null
  variantTitle: string
  thumbnail: string | null
  quantity: number
  unitPriceMinor: number
  subtotalMinor: number
  /** What is actually on the shelf, for the "only 2 left" messages. */
  available: number
  manageInventory: boolean
  allowBackorder: boolean
  /** Centimetres and grams, for rating a parcel. */
  dimensions: { length: number; width: number; height: number; weight: number }
}

export type CartTotals = {
  itemSubtotalMinor: number
  discountMinor: number
  shippingMinor: number
  taxMinor: number
  totalMinor: number
}

export type CartRow = {
  id: string
  customerId: string | null
  email: string | null
  currency: string
  countryCode: string | null
  shippingAddress: Record<string, unknown> | null
  billingAddress: Record<string, unknown> | null
  shippingOptionId: string | null
  promotionCode: string | null
  giftNote: string | null
  completedOrderId: string | null
  lines: CartLineRow[]
  totals: CartTotals
}

const touch = (db: D1, cartId: string) =>
  db
    .prepare(`UPDATE cart SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1`)
    .bind(cartId)

export async function createCart(
  db: D1,
  input: { currency: string; countryCode?: string | null; customerId?: string | null; email?: string | null }
): Promise<string> {
  const id = newId("cart")
  await db
    .prepare(
      `INSERT INTO cart (id, customer_id, email, currency_code, country_code)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    )
    .bind(id, input.customerId ?? null, input.email ?? null, input.currency.toLowerCase(), input.countryCode ?? null)
    .run()
  return id
}

/** Discount for a promotion code, in minor units of the cart's currency. */
async function discountFor(
  db: D1,
  code: string | null,
  subtotalMinor: number,
  currency: string
): Promise<{ minor: number; freeShipping: boolean }> {
  if (!code) {
    return { minor: 0, freeShipping: false }
  }
  const now = new Date().toISOString()
  const promo = await db
    .prepare(
      `SELECT type, value, currency_code, min_subtotal_minor, usage_limit, used_count
         FROM promotion
        WHERE code = ?1 COLLATE NOCASE AND is_active = 1
          AND (starts_at IS NULL OR starts_at <= ?2)
          AND (ends_at IS NULL OR ends_at >= ?2)`
    )
    .bind(code, now)
    .first<{
      type: string
      value: number
      currency_code: string | null
      min_subtotal_minor: number | null
      usage_limit: number | null
      used_count: number
    }>()

  if (!promo || (promo.usage_limit !== null && promo.used_count >= promo.usage_limit)) {
    return { minor: 0, freeShipping: false }
  }
  if (promo.min_subtotal_minor && subtotalMinor < promo.min_subtotal_minor) {
    return { minor: 0, freeShipping: false }
  }
  if (promo.type === "free_shipping") {
    return { minor: 0, freeShipping: true }
  }
  if (promo.type === "percentage") {
    return { minor: Math.round((subtotalMinor * Math.min(promo.value, 100)) / 100), freeShipping: false }
  }
  // A fixed amount is set in one currency and converted into the cart's.
  const rates = await getFxRates(db)
  const inCart =
    (promo.currency_code || BASE_CURRENCY) === currency
      ? promo.value
      : convert(promo.value, currency, rates)
  return { minor: Math.min(inCart, subtotalMinor), freeShipping: false }
}

export async function getCart(db: D1, cartId: string): Promise<CartRow | null> {
  const cart = await db
    .prepare(`SELECT * FROM cart WHERE id = ?1`)
    .bind(cartId)
    .first<Record<string, any>>()
  if (!cart) {
    return null
  }

  const { results: lines } = await db
    .prepare(
      `SELECT ci.id, ci.variant_id, ci.quantity, ci.unit_price_minor, ci.title, ci.subtitle, ci.thumbnail,
              v.title AS variant_title, v.manage_inventory, v.allow_backorder,
              v.length_cm, v.width_cm, v.height_cm, v.weight_g,
              p.id AS product_id, p.handle AS product_handle,
              (SELECT COALESCE(SUM(stocked_quantity - reserved_quantity), 0)
                 FROM inventory_level WHERE variant_id = v.id) AS available
         FROM cart_item ci
         JOIN variant v ON v.id = ci.variant_id
         JOIN product p ON p.id = v.product_id
        WHERE ci.cart_id = ?1
        ORDER BY ci.rowid`
    )
    .bind(cartId)
    .all<Record<string, any>>()

  const mapped: CartLineRow[] = lines.map((line) => ({
    id: line.id,
    variantId: line.variant_id,
    productId: line.product_id,
    productHandle: line.product_handle,
    productTitle: line.title,
    productSubtitle: line.subtitle ?? null,
    variantTitle: line.variant_title,
    thumbnail: line.thumbnail ?? null,
    quantity: Number(line.quantity),
    unitPriceMinor: Number(line.unit_price_minor),
    subtotalMinor: Number(line.unit_price_minor) * Number(line.quantity),
    available: Number(line.available || 0),
    manageInventory: line.manage_inventory === 1,
    allowBackorder: line.allow_backorder === 1,
    dimensions: {
      length: Number(line.length_cm || 0),
      width: Number(line.width_cm || 0),
      height: Number(line.height_cm || 0),
      weight: Number(line.weight_g || 0),
    },
  }))

  const itemSubtotalMinor = mapped.reduce((sum, line) => sum + line.subtotalMinor, 0)
  const discount = await discountFor(db, cart.promotion_code, itemSubtotalMinor, cart.currency_code)
  const shippingMinor = discount.freeShipping ? 0 : Number(cart.shipping_total || 0)

  return {
    id: cart.id,
    customerId: cart.customer_id ?? null,
    email: cart.email ?? null,
    currency: cart.currency_code,
    countryCode: cart.country_code ?? null,
    shippingAddress: cart.shipping_address ? JSON.parse(cart.shipping_address) : null,
    billingAddress: cart.billing_address ? JSON.parse(cart.billing_address) : null,
    shippingOptionId: cart.shipping_option_id ?? null,
    promotionCode: cart.promotion_code ?? null,
    giftNote: cart.gift_note ?? null,
    completedOrderId: cart.completed_order_id ?? null,
    lines: mapped,
    totals: {
      itemSubtotalMinor,
      discountMinor: discount.minor,
      shippingMinor,
      taxMinor: 0,
      totalMinor: Math.max(itemSubtotalMinor - discount.minor + shippingMinor, 0),
    },
  }
}

/**
 * Adds a variant to the cart, or increases the quantity if it is already
 * there. The price is snapshotted so a later change never silently alters a
 * cart the shopper is looking at.
 */
/** Most copies of one edition a single cart line can hold. */
export const MAX_LINE_QUANTITY = 99

/** A whole number of copies in 1..MAX_LINE_QUANTITY; anything unreadable is 1. */
export function clampQuantity(quantity: unknown): number {
  const n = Math.round(Number(quantity))
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_LINE_QUANTITY) : 1
}

export class CartError extends Error {}

export async function addLine(
  db: D1,
  cartId: string,
  variantId: string,
  quantity = 1,
  currency = BASE_CURRENCY
): Promise<void> {
  // Only something a shopper could see on the shelf can go in the cart: a
  // draft, deleted or scheduled product, or one with no price, cannot.
  const row = await db
    .prepare(
      `SELECT p.title, p.subtitle, p.thumbnail, v.title AS variant_title,
              (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'base' AND currency_code = ?2) AS price_cur,
              (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'base' AND currency_code = ?3) AS price_base
         FROM variant v JOIN product p ON p.id = v.product_id
        WHERE v.id = ?1 AND p.status = 'published' AND p.deleted_at IS NULL
          AND (p.publish_at IS NULL OR p.publish_at <= ?4)`
    )
    .bind(variantId, currency.toLowerCase(), BASE_CURRENCY, new Date().toISOString())
    .first<{
      title: string
      subtitle: string | null
      thumbnail: string | null
      variant_title: string
      price_cur: number | null
      price_base: number | null
    }>()
  if (!row) {
    throw new CartError("This edition is not available.")
  }

  const rates = await getFxRates(db)
  const unitPrice =
    row.price_cur ?? (row.price_base === null ? 0 : convert(row.price_base, currency, rates))
  if (!(unitPrice > 0)) {
    throw new CartError("This edition is not available.")
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO cart_item (id, cart_id, variant_id, quantity, unit_price_minor, title, subtitle, thumbnail)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = MIN(quantity + excluded.quantity, ?9)`
      )
      .bind(
        newId("li"),
        cartId,
        variantId,
        clampQuantity(quantity),
        unitPrice,
        row.title,
        row.subtitle,
        row.thumbnail,
        MAX_LINE_QUANTITY
      ),
    touch(db, cartId),
  ])
}

export async function updateLine(db: D1, cartId: string, lineId: string, quantity: number): Promise<void> {
  const n = Math.round(Number(quantity))
  if (!Number.isFinite(n)) {
    return
  }
  if (n <= 0) {
    await removeLine(db, cartId, lineId)
    return
  }
  await db.batch([
    db
      .prepare(`UPDATE cart_item SET quantity = ?3 WHERE id = ?2 AND cart_id = ?1`)
      .bind(cartId, lineId, clampQuantity(n)),
    touch(db, cartId),
  ])
}

export async function removeLine(db: D1, cartId: string, lineId: string): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM cart_item WHERE id = ?2 AND cart_id = ?1`).bind(cartId, lineId),
    touch(db, cartId),
  ])
}

export async function setCartFields(
  db: D1,
  cartId: string,
  fields: {
    email?: string | null
    customerId?: string | null
    shippingAddress?: Record<string, unknown> | null
    billingAddress?: Record<string, unknown> | null
    shippingOptionId?: string | null
    shippingTotalMinor?: number | null
    promotionCode?: string | null
    giftNote?: string | null
    currency?: string
    countryCode?: string | null
  }
): Promise<void> {
  const columns: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (value !== undefined) {
      columns[column] = value
    }
  }
  set("email", fields.email)
  set("customer_id", fields.customerId)
  set("shipping_address", fields.shippingAddress === undefined ? undefined : fields.shippingAddress ? JSON.stringify(fields.shippingAddress) : null)
  set("billing_address", fields.billingAddress === undefined ? undefined : fields.billingAddress ? JSON.stringify(fields.billingAddress) : null)
  set("shipping_option_id", fields.shippingOptionId)
  set("shipping_total", fields.shippingTotalMinor)
  set("promotion_code", fields.promotionCode)
  set("gift_note", fields.giftNote)
  set("currency_code", fields.currency?.toLowerCase())
  set("country_code", fields.countryCode)

  const names = Object.keys(columns)
  if (!names.length) {
    return
  }
  const assignments = names.map((name, i) => `${name} = ?${i + 2}`).join(", ")
  await db
    .prepare(
      `UPDATE cart SET ${assignments}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1`
    )
    .bind(cartId, ...names.map((name) => columns[name]))
    .run()
}

/** Checks a code is usable and stores it on the cart. */
export async function applyPromotion(db: D1, cartId: string, code: string): Promise<boolean> {
  const cart = await getCart(db, cartId)
  if (!cart) {
    return false
  }
  const trimmed = code.trim().toUpperCase().slice(0, 40)
  if (!trimmed) {
    return false
  }
  const discount = await discountFor(db, trimmed, cart.totals.itemSubtotalMinor, cart.currency)
  if (!discount.minor && !discount.freeShipping) {
    return false
  }
  await setCartFields(db, cartId, { promotionCode: trimmed })
  return true
}

/**
 * Re-prices every line in the shopper's new currency. Called when the cart
 * moves region: the snapshot that protects a cart from price changes would
 * otherwise leave it quoting the old currency's figures.
 */
export async function repriceCart(db: D1, cartId: string, currency: string): Promise<void> {
  const code = currency.toLowerCase()
  const { results: lines } = await db
    .prepare(
      `SELECT ci.id, ci.variant_id,
              (SELECT amount_minor FROM variant_price WHERE variant_id = ci.variant_id AND kind = 'base' AND currency_code = ?2) AS price_cur,
              (SELECT amount_minor FROM variant_price WHERE variant_id = ci.variant_id AND kind = 'base' AND currency_code = ?3) AS price_base
         FROM cart_item ci WHERE ci.cart_id = ?1`
    )
    .bind(cartId, code, BASE_CURRENCY)
    .all<{ id: string; price_cur: number | null; price_base: number | null }>()
  if (!lines.length) {
    await setCartFields(db, cartId, { currency: code })
    return
  }
  const rates = await getFxRates(db)
  await db.batch([
    ...lines.map((line) =>
      db
        .prepare(`UPDATE cart_item SET unit_price_minor = ?2 WHERE id = ?1`)
        .bind(line.id, line.price_cur ?? (line.price_base === null ? 0 : convert(line.price_base, code, rates)))
    ),
    db.prepare(`UPDATE cart SET currency_code = ?2 WHERE id = ?1`).bind(cartId, code),
  ])
}

/** Shipping options a cart's destination can use, priced in its currency. */
export async function listShippingOptions(
  db: D1,
  input: { countryCode: string | null; currency: string; subtotalMinor: number }
): Promise<{ id: string; name: string; provider: string; amountMinor: number; free: boolean }[]> {
  const { results } = await db
    .prepare(`SELECT * FROM shipping_option WHERE is_active = 1 ORDER BY rank, name`)
    .all<Record<string, any>>()
  const country = (input.countryCode || "").toLowerCase()
  const rates = await getFxRates(db)

  return results
    .filter((option) => {
      const countries = JSON.parse(option.countries || "[]") as string[]
      return !countries.length || countries.includes(country)
    })
    .map((option) => {
      const base = Number(option.amount_minor || 0)
      const amount =
        (option.currency_code || BASE_CURRENCY) === input.currency
          ? base
          : convert(base, input.currency, rates)
      const threshold = option.free_above_minor
        ? (option.currency_code || BASE_CURRENCY) === input.currency
          ? Number(option.free_above_minor)
          : convert(Number(option.free_above_minor), input.currency, rates)
        : null
      const free = threshold !== null && input.subtotalMinor >= threshold
      return {
        id: option.id,
        name: option.name,
        provider: option.provider,
        amountMinor: free ? 0 : amount,
        free,
      }
    })
}
