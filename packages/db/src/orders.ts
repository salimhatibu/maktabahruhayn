import { getCart, type CartRow } from "./cart"
import type { D1, D1Statement } from "./client"
import { newId } from "./writes"

export type PlaceOrderInput = {
  cartId: string
  /**
   * Stable per checkout attempt. A retried submit or a replayed payment
   * webhook reuses it and gets the first outcome back instead of a second
   * order.
   */
  idempotencyKey: string
  email: string
  payment: { provider: "stripe" | "mpesa" | "manual"; reference?: string | null; status?: "authorized" | "captured" }
  shippingMethod?: { name: string; provider: string; amountMinor: number } | null
  /**
   * The money is already taken: place the order even if stock ran out in the
   * meantime, so a paid order is never lost. The shortfall shows in the
   * admin's stock instead.
   */
  oversell?: boolean
}

export type PlaceOrderResult =
  | { ok: true; orderId: string; displayId: number; replayed: boolean }
  | { ok: false; reason: "cart_empty" | "cart_not_found" | "out_of_stock" | "conflict"; detail?: string }

/** The one idempotency key a cart's order is placed under, whoever finishes it. */
export const orderKeyForCart = (cartId: string) => `order_for_cart_${cartId}`

/** How many times a stock claim retries before giving up on a busy row. */
const CLAIM_ATTEMPTS = 25

/** A short randomised pause, so claims that collided do not collide again in lockstep. */
const backoff = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.random() * Math.min(5 * 2 ** attempt, 200)))

/**
 * Reserves stock for one line with a compare-and-set.
 *
 * D1 has no interactive transactions, so a read cannot be held against a
 * concurrent writer. Instead the update carries the version the decision was
 * made on: if another checkout moved the row first, zero rows change and the
 * claim is retried against fresh numbers.
 */
async function claimStock(
  db: D1,
  variantId: string,
  quantity: number,
  allowBackorder: boolean
): Promise<{ ok: true; locationId: string | null } | { ok: false; reason: "out_of_stock" | "conflict" }> {
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const level = await db
      .prepare(
        `SELECT location_id, stocked_quantity, reserved_quantity, version
           FROM inventory_level
          WHERE variant_id = ?1
          ORDER BY (stocked_quantity - reserved_quantity) DESC
          LIMIT 1`
      )
      .bind(variantId)
      .first<{ location_id: string; stocked_quantity: number; reserved_quantity: number; version: number }>()

    // Nothing tracks this variant's stock, so there is nothing to claim.
    if (!level) {
      return { ok: true, locationId: null }
    }

    const available = level.stocked_quantity - level.reserved_quantity
    if (available < quantity && !allowBackorder) {
      return { ok: false, reason: "out_of_stock" }
    }

    const result = await db
      .prepare(
        `UPDATE inventory_level
            SET reserved_quantity = reserved_quantity + ?3, version = version + 1
          WHERE variant_id = ?1 AND location_id = ?2 AND version = ?4`
      )
      .bind(variantId, level.location_id, quantity, level.version)
      .run()

    if (result.meta?.changes) {
      return { ok: true, locationId: level.location_id }
    }
    // Someone else wrote between the read and the update; look again.
    await backoff(attempt)
  }
  return { ok: false, reason: "conflict" }
}

/** Gives back stock claimed earlier in a checkout that then failed. */
async function releaseStock(db: D1, claims: { variantId: string; locationId: string; quantity: number }[]) {
  if (!claims.length) {
    return
  }
  await db.batch(
    claims.map((claim) =>
      db
        .prepare(
          `UPDATE inventory_level
              SET reserved_quantity = MAX(reserved_quantity - ?3, 0), version = version + 1
            WHERE variant_id = ?1 AND location_id = ?2`
        )
        .bind(claim.variantId, claim.locationId, claim.quantity)
    )
  )
}

/**
 * Turns a cart into an order.
 *
 * The sequence is deliberate: claim the idempotency key first so a double
 * submit cannot produce two orders, then claim stock line by line, then write
 * the order in one batch. If anything fails after stock was claimed, the
 * claims are released before returning.
 */
export async function placeOrder(db: D1, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // The primary key makes this the atomic gate: the first caller inserts, a
  // replay collides and reads back what the first one decided.
  try {
    await db
      .prepare(`INSERT INTO idempotency_key (key, scope) VALUES (?1, 'place_order')`)
      .bind(input.idempotencyKey)
      .run()
  } catch {
    const existing = await db
      .prepare(`SELECT result FROM idempotency_key WHERE key = ?1`)
      .bind(input.idempotencyKey)
      .first<{ result: string | null }>()
    if (existing?.result) {
      return { ...(JSON.parse(existing.result) as PlaceOrderResult & { ok: true }), replayed: true }
    }
    // Claimed but unfinished: another request is mid-flight.
    return { ok: false, reason: "conflict", detail: "This checkout is already being processed." }
  }

  // A refusal must not leave the key claimed, or every retry of this cart
  // would be told it is "already being processed".
  const refuse = async (failure: PlaceOrderResult & { ok: false }) => {
    await db.prepare(`DELETE FROM idempotency_key WHERE key = ?1 AND result IS NULL`).bind(input.idempotencyKey).run()
    return failure
  }

  const cart = await getCart(db, input.cartId)
  if (!cart) {
    return refuse({ ok: false, reason: "cart_not_found" })
  }
  if (!cart.lines.length) {
    return refuse({ ok: false, reason: "cart_empty" })
  }

  const claimed: { variantId: string; locationId: string; quantity: number }[] = []
  for (const line of cart.lines) {
    if (!line.manageInventory) {
      continue
    }
    const claim = await claimStock(db, line.variantId, line.quantity, line.allowBackorder || Boolean(input.oversell))
    if (!claim.ok) {
      await releaseStock(db, claimed)
      return refuse({
        ok: false,
        reason: claim.reason,
        detail: claim.reason === "out_of_stock" ? line.productTitle : undefined,
      })
    }
    if (claim.locationId) {
      claimed.push({ variantId: line.variantId, locationId: claim.locationId, quantity: line.quantity })
    }
  }

  const orderId = newId("order")
  const statements: D1Statement[] = [
    // The display number is taken inside the insert. D1 runs a batch as one
    // transaction, so two orders placed at once cannot draw the same number.
    db
      .prepare(
        `INSERT INTO "order" (id, display_id, customer_id, email, currency_code,
            subtotal_minor, discount_minor, shipping_minor, tax_minor, total_minor,
            status, payment_status, shipping_address, billing_address, shipping_method,
            promotion_code, gift_note)
         VALUES (?1, (SELECT MAX(COALESCE(MAX(display_id), 999) + 1, 1000) FROM "order"),
                 ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?11, ?12, ?13, ?14, ?15)`
      )
      .bind(
        orderId,
        cart.customerId,
        input.email,
        cart.currency,
        cart.totals.itemSubtotalMinor,
        cart.totals.discountMinor,
        cart.totals.shippingMinor,
        cart.totals.taxMinor,
        cart.totals.totalMinor,
        input.payment.status === "captured" ? "captured" : "authorized",
        JSON.stringify(cart.shippingAddress || {}),
        cart.billingAddress ? JSON.stringify(cart.billingAddress) : null,
        input.shippingMethod ? JSON.stringify(input.shippingMethod) : null,
        cart.promotionCode,
        cart.giftNote
      ),
    ...cart.lines.map((line) =>
      db
        .prepare(
          `INSERT INTO order_item (id, order_id, variant_id, product_title, variant_title, thumbnail,
              quantity, unit_price_minor, total_minor)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
        )
        .bind(
          newId("oi"),
          orderId,
          line.variantId,
          line.productTitle,
          line.variantTitle,
          line.thumbnail,
          line.quantity,
          line.unitPriceMinor,
          line.subtotalMinor
        )
    ),
    // A card or M-Pesa payment already has its pending row (same provider and
    // reference), which this attaches to the order. A row that already belongs
    // to an order is never moved to another.
    db
      .prepare(
        `INSERT INTO payment (id, order_id, cart_id, provider, status, amount_minor, currency_code, reference)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT (provider, reference) WHERE reference IS NOT NULL DO UPDATE SET
           order_id = excluded.order_id,
           status = excluded.status,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE payment.order_id IS NULL`
      )
      .bind(
        newId("pay"),
        orderId,
        cart.id,
        input.payment.provider,
        input.payment.status || "authorized",
        cart.totals.totalMinor,
        cart.currency,
        input.payment.reference ?? null
      ),
    // Stock leaves the shelf and the reservation with it.
    ...claimed.map((claim) =>
      db
        .prepare(
          `UPDATE inventory_level
              SET stocked_quantity = MAX(stocked_quantity - ?3, 0),
                  reserved_quantity = MAX(reserved_quantity - ?3, 0),
                  version = version + 1
            WHERE variant_id = ?1 AND location_id = ?2`
        )
        .bind(claim.variantId, claim.locationId, claim.quantity)
    ),
    db.prepare(`UPDATE cart SET completed_order_id = ?2 WHERE id = ?1`).bind(cart.id, orderId),
  ]

  if (cart.promotionCode) {
    statements.push(
      db
        .prepare(`UPDATE promotion SET used_count = used_count + 1 WHERE code = ?1 COLLATE NOCASE`)
        .bind(cart.promotionCode)
    )
  }

  statements.push(
    db
      .prepare(
        `UPDATE idempotency_key
            SET result = json_object('ok', json('true'), 'orderId', ?2, 'replayed', json('false'),
                                     'displayId', (SELECT display_id FROM "order" WHERE id = ?2))
          WHERE key = ?1`
      )
      .bind(input.idempotencyKey, orderId)
  )

  try {
    await db.batch(statements)
  } catch (error) {
    await releaseStock(db, claimed)
    await db.prepare(`DELETE FROM idempotency_key WHERE key = ?1`).bind(input.idempotencyKey).run()
    throw error
  }
  const placed = await db
    .prepare(`SELECT display_id FROM "order" WHERE id = ?1`)
    .bind(orderId)
    .first<{ display_id: number }>()
  return { ok: true, orderId, displayId: Number(placed?.display_id), replayed: false }
}

export type FinalizeResult =
  | { ok: true; orderId: string; displayId: number; replayed: boolean }
  | {
      ok: false
      reason: "cart_not_found" | "cart_empty" | "out_of_stock" | "conflict" | "payment_not_for_cart" | "amount_mismatch"
      detail?: string
    }

/** A readable name for the delivery option the cart chose, for the order record. */
export async function shippingMethodFor(db: D1, cart: CartRow) {
  if (!cart.shippingOptionId) {
    return null
  }
  const option = cart.shippingOptionId.startsWith("shippo:")
    ? { name: "Courier", provider: "shippo" }
    : cart.shippingOptionId === STANDARD_SHIPPING_ID
      ? { name: "Standard delivery", provider: "manual" }
      : await db
          .prepare(`SELECT name, provider FROM shipping_option WHERE id = ?1`)
          .bind(cart.shippingOptionId)
          .first<{ name: string; provider: string }>()
  return {
    name: option?.name || "Delivery",
    provider: option?.provider || "manual",
    amountMinor: cart.totals.shippingMinor,
  }
}

/** The fallback delivery option, priced from the admin's shipping settings. */
export const STANDARD_SHIPPING_ID = "standard"

function manualCartSnapshot(cart: CartRow) {
  return {
    currency: cart.currency,
    totalMinor: cart.totals.totalMinor,
    lines: cart.lines.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      productTitle: line.productTitle,
      variantTitle: line.variantTitle,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      thumbnail: line.thumbnail,
    })),
    shippingAddress: cart.shippingAddress,
    shippingOptionId: cart.shippingOptionId,
    promotionCode: cart.promotionCode,
    giftNote: cart.giftNote,
  }
}

/**
 * Turns a cart whose payment has been confirmed into an order.
 *
 * Provider webhooks and the admin's manual M-Pesa review end here under one
 * idempotency key per cart. Before anything is written it checks that the
 * captured payment belongs to this cart and covers its current total. Manual
 * M-Pesa also requires the cart snapshot and rounded whole-shilling amount to
 * match submission.
 */
export async function finalizePaidCart(
  db: D1,
  input: {
    cartId: string
    provider: "stripe" | "mpesa" | "manual"
    reference: string
    /** What the provider says was paid, in our minor units. */
    paidMinor: number
    currency: string
  }
): Promise<FinalizeResult> {
  const cart = await getCart(db, input.cartId)
  if (!cart) {
    return { ok: false, reason: "cart_not_found" }
  }
  if (cart.completedOrderId) {
    const order = await db
      .prepare(`SELECT display_id FROM "order" WHERE id = ?1`)
      .bind(cart.completedOrderId)
      .first<{ display_id: number }>()
    return { ok: true, orderId: cart.completedOrderId, displayId: Number(order?.display_id), replayed: true }
  }

  const attempt = await db
    .prepare(`SELECT cart_id, order_id, status, raw FROM payment WHERE provider = ?1 AND reference = ?2`)
    .bind(input.provider, input.reference)
    .first<{ cart_id: string | null; order_id: string | null; status: string; raw: string | null }>()
  if (!attempt || attempt.cart_id !== cart.id || attempt.order_id || attempt.status !== "captured") {
    return { ok: false, reason: "payment_not_for_cart" }
  }
  if (input.provider === "manual") {
    let submittedSnapshot: unknown
    try {
      submittedSnapshot = (JSON.parse(attempt.raw || "{}") as { cartSnapshot?: unknown }).cartSnapshot
    } catch {
      return { ok: false, reason: "payment_not_for_cart" }
    }
    if (JSON.stringify(submittedSnapshot) !== JSON.stringify(manualCartSnapshot(cart))) {
      return { ok: false, reason: "amount_mismatch", detail: "The cart changed after the M-Pesa message was submitted." }
    }
  }
  const amountMatches =
    input.provider === "manual"
      ? input.paidMinor === Math.ceil(cart.totals.totalMinor / 100) * 100
      : input.paidMinor >= cart.totals.totalMinor
  if (input.currency.toLowerCase() !== cart.currency || !amountMatches) {
    return {
      ok: false,
      reason: "amount_mismatch",
      detail: `paid ${input.paidMinor} ${input.currency.toLowerCase()}, cart is ${cart.totals.totalMinor} ${cart.currency}`,
    }
  }

  return placeOrder(db, {
    cartId: cart.id,
    idempotencyKey: orderKeyForCart(cart.id),
    email: cart.email || "",
    payment: { provider: input.provider, reference: input.reference, status: "captured" },
    shippingMethod: await shippingMethodFor(db, cart),
    oversell: true,
  })
}

export type OrderSummary = {
  id: string
  displayId: number
  customerId: string | null
  email: string
  currency: string
  totalMinor: number
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  createdAt: string
  subtotalMinor: number
  discountMinor: number
  shippingMinor: number
  taxMinor: number
  shippingAddress: Record<string, string | null> | null
  shippingMethod: { name: string } | null
  shipments: { trackingNumber: string | null; trackingUrl: string | null; status: string | null; createdAt: string }[]
  items: { title: string; variantTitle: string; quantity: number; unitPriceMinor: number; thumbnail: string | null }[]
}

const parseJson = <T>(value: unknown): T | null => {
  if (typeof value !== "string" || !value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export async function getOrder(db: D1, orderId: string): Promise<OrderSummary | null> {
  const order = await db.prepare(`SELECT * FROM "order" WHERE id = ?1`).bind(orderId).first<Record<string, any>>()
  if (!order) {
    return null
  }
  const [{ results }, { results: shipments }] = await Promise.all([
    db
      .prepare(
        `SELECT product_title, variant_title, quantity, unit_price_minor, thumbnail
           FROM order_item WHERE order_id = ?1 ORDER BY rowid`
      )
      .bind(orderId)
      .all<Record<string, any>>(),
    db
      .prepare(
        `SELECT tracking_number, tracking_url, status, created_at FROM shipment WHERE order_id = ?1 ORDER BY created_at`
      )
      .bind(orderId)
      .all<Record<string, any>>(),
  ])
  return {
    id: order.id,
    displayId: order.display_id,
    customerId: order.customer_id ?? null,
    email: order.email,
    currency: order.currency_code,
    totalMinor: order.total_minor,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    createdAt: order.created_at,
    subtotalMinor: Number(order.subtotal_minor || 0),
    discountMinor: Number(order.discount_minor || 0),
    shippingMinor: Number(order.shipping_minor || 0),
    taxMinor: Number(order.tax_minor || 0),
    shippingAddress: parseJson<Record<string, string | null>>(order.shipping_address),
    shippingMethod: parseJson<{ name: string }>(order.shipping_method),
    shipments: shipments.map((s) => ({
      trackingNumber: s.tracking_number ?? null,
      trackingUrl: s.tracking_url ?? null,
      status: s.status ?? null,
      createdAt: s.created_at,
    })),
    items: results.map((item) => ({
      title: item.product_title,
      variantTitle: item.variant_title,
      quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor,
      thumbnail: item.thumbnail,
    })),
  }
}

export async function listOrdersForCustomer(db: D1, customerId: string): Promise<OrderSummary[]> {
  const { results } = await db
    .prepare(`SELECT id FROM "order" WHERE customer_id = ?1 ORDER BY created_at DESC LIMIT 50`)
    .bind(customerId)
    .all<{ id: string }>()
  const orders = await Promise.all(results.map((row) => getOrder(db, row.id)))
  return orders.filter((order): order is OrderSummary => Boolean(order))
}

/* ------------------------------------------------------- payment attempts */

export type PendingPayment = {
  id: string
  cartId: string
  provider: string
  reference: string | null
  status: string
  amountMinor: number
  currency: string
}

/**
 * Records a payment the shopper has started but not finished. It is kept
 * against the cart rather than an order, because the order is only created
 * once the money is confirmed - so an abandoned or failed payment never
 * leaves a half-made order behind.
 */
export async function recordPendingPayment(
  db: D1,
  input: { cartId: string; provider: "stripe" | "mpesa"; reference: string; amountMinor: number; currency: string }
): Promise<void> {
  // The conflict target repeats the partial index's WHERE, without which
  // SQLite refuses the upsert outright.
  await db
    .prepare(
      `INSERT INTO payment (id, cart_id, provider, status, amount_minor, currency_code, reference)
       VALUES (?1, ?2, ?3, 'pending', ?4, ?5, ?6)
       ON CONFLICT (provider, reference) WHERE reference IS NOT NULL DO UPDATE SET
         amount_minor = excluded.amount_minor,
         currency_code = excluded.currency_code,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE payment.order_id IS NULL AND payment.cart_id = excluded.cart_id`
    )
    .bind(newId("pay"), input.cartId, input.provider, input.amountMinor, input.currency.toLowerCase(), input.reference)
    .run()
}

export async function recordManualMpesaSubmission(
  db: D1,
  input: { cartId: string; message: string }
): Promise<{ reference: string; amountMinor: number; currency: string; alreadyPending: boolean }> {
  const message = input.message.trim()
  if (message.length < 10 || message.length > 1000) {
    throw new Error("Enter the M-Pesa confirmation message (10 to 1000 characters).")
  }

  const cart = await getCart(db, input.cartId)
  if (!cart || cart.completedOrderId || !cart.lines.length) {
    throw new Error("Your cart has expired. Please add your books again.")
  }
  if (
    cart.currency !== "kes" ||
    !cart.email ||
    !cart.shippingAddress ||
    !cart.shippingOptionId ||
    cart.totals.totalMinor <= 0
  ) {
    throw new Error("Complete your delivery details before submitting payment.")
  }

  const findPending = () =>
    db
      .prepare(
        `SELECT reference, amount_minor, currency_code
           FROM payment
          WHERE cart_id = ?1 AND provider = 'manual' AND status = 'pending' AND order_id IS NULL
          LIMIT 1`
      )
      .bind(cart.id)
      .first<{ reference: string; amount_minor: number; currency_code: string }>()

  const existing = await findPending()
  const amountMinor = Math.ceil(cart.totals.totalMinor / 100) * 100
  if (existing) {
    return {
      reference: existing.reference,
      amountMinor: Number(existing.amount_minor),
      currency: existing.currency_code,
      alreadyPending: true,
    }
  }

  const reference = newId("manual")
  try {
    await db
      .prepare(
        `INSERT INTO payment (id, cart_id, provider, status, amount_minor, currency_code, reference, raw)
         VALUES (?1, ?2, 'manual', 'pending', ?3, 'kes', ?4, ?5)`
      )
      .bind(
        newId("pay"),
        cart.id,
        amountMinor,
        reference,
        JSON.stringify({ message, cartSnapshot: manualCartSnapshot(cart) })
      )
      .run()
  } catch (error) {
    const pending = await findPending()
    if (!pending) {
      throw error
    }
    return {
      reference: pending.reference,
      amountMinor: Number(pending.amount_minor),
      currency: pending.currency_code,
      alreadyPending: true,
    }
  }

  return {
    reference,
    amountMinor,
    currency: cart.currency,
    alreadyPending: false,
  }
}

export async function hasUnresolvedManualMpesaPayment(db: D1, cartId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS pending
         FROM payment
        WHERE cart_id = ?1 AND provider = 'manual' AND status IN ('pending', 'captured') AND order_id IS NULL
        LIMIT 1`
    )
    .bind(cartId)
    .first<{ pending: number }>()
  return Boolean(row)
}

export async function findLatestManualMpesaPayment(
  db: D1,
  cartId: string
): Promise<{ reference: string; status: string } | null> {
  return db
    .prepare(
      `SELECT reference, status
         FROM payment
        WHERE cart_id = ?1 AND provider = 'manual' AND order_id IS NULL
        ORDER BY created_at DESC LIMIT 1`
    )
    .bind(cartId)
    .first<{ reference: string; status: string }>()
}

export async function findPendingPayment(
  db: D1,
  cartId: string,
  provider: "stripe" | "mpesa"
): Promise<PendingPayment | null> {
  const row = await db
    .prepare(
      `SELECT id, cart_id, provider, reference, status, amount_minor, currency_code
         FROM payment
        WHERE cart_id = ?1 AND provider = ?2 AND order_id IS NULL
        ORDER BY created_at DESC LIMIT 1`
    )
    .bind(cartId, provider)
    .first<Record<string, any>>()
  return row
    ? {
        id: row.id,
        cartId: row.cart_id,
        provider: row.provider,
        reference: row.reference,
        status: row.status,
        amountMinor: row.amount_minor,
        currency: row.currency_code,
      }
    : null
}

/**
 * Marks an attempt captured or failed when the provider calls back. The
 * reference is the provider's own id, so a replayed callback updates the same
 * row instead of creating another.
 */
export async function settlePayment(
  db: D1,
  input: {
    provider: "stripe" | "mpesa"
    reference: string
    status: "captured" | "failed"
    /** Kept with the row; an M-Pesa receipt number travels in here. */
    raw?: unknown
  }
): Promise<{ cartId: string | null; amountMinor: number; currency: string; status: string } | null> {
  // The reference stays the provider's request id, so a replayed callback
  // finds the same row. A late "failed" never undoes a capture.
  await db
    .prepare(
      `UPDATE payment
          SET status = ?3,
              raw = ?4,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE provider = ?1 AND reference = ?2
          AND (?3 = 'captured' OR status != 'captured')`
    )
    .bind(input.provider, input.reference, input.status, input.raw ? JSON.stringify(input.raw) : null)
    .run()

  const row = await db
    .prepare(`SELECT cart_id, amount_minor, currency_code, status FROM payment WHERE provider = ?1 AND reference = ?2`)
    .bind(input.provider, input.reference)
    .first<{ cart_id: string | null; amount_minor: number; currency_code: string; status: string }>()
  return row
    ? { cartId: row.cart_id, amountMinor: Number(row.amount_minor), currency: row.currency_code, status: row.status }
    : null
}
