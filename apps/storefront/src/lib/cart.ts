import { cookies } from "next/headers"
import {
  addLine as dbAddLine,
  applyPromotion as dbApplyPromotion,
  CartError,
  convert,
  createCart,
  finalizePaidCart,
  getCart as dbGetCart,
  getFxRates,
  getSettings,
  listShippingOptions as dbListShippingOptions,
  findPendingPayment,
  orderKeyForCart,
  placeOrder,
  recordPendingPayment,
  removeLine as dbRemoveLine,
  repriceCart,
  setCartFields,
  shippingMethodFor,
  STANDARD_SHIPPING_ID,
  toMajor,
  toMinor,
  updateLine as dbUpdateLine,
  type CartRow,
  type D1,
  type FinalizeResult,
} from "@maktabah/db"
import { resolveRegion } from "@maktabah/shared"
import { getAuthToken } from "./auth"
import { AFFILIATE_COOKIE, CART_COOKIE, LAST_ORDER_COOKIE, mediaUrl, stripePublishableKey } from "./config"
import { db } from "./db"
import { convertFromBase } from "./pricing"
import { mpesa, mpesaConfig, shippo, shippoConfig, stripe, stripeConfig } from "./payments"
import { currentRegion } from "./region-context"

/**
 * The shopping cart, stored in D1.
 *
 * Money crosses this boundary in major units, as the cart page, drawer and
 * checkout forms expect, while the database keeps integer minor units.
 */

export type CartLine = {
  id: string
  title?: string
  product_id?: string | null
  product_title?: string | null
  product_handle?: string | null
  product_subtitle?: string | null
  variant_title?: string | null
  variant_id?: string | null
  thumbnail?: string | null
  quantity: number
  unit_price?: number
  compare_at_unit_price?: number | null
  subtotal?: number
  variant?: {
    inventory_quantity?: number | null
    manage_inventory?: boolean | null
    allow_backorder?: boolean | null
  } | null
}

export type Address = {
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
  province?: string | null
}

export type PaymentSession = {
  id: string
  provider_id: string
  status: string
  data?: Record<string, unknown>
}

export type Cart = {
  id: string
  email?: string | null
  customer_id?: string | null
  currency_code?: string
  region_id?: string
  metadata?: Record<string, unknown> | null
  items?: CartLine[]
  promotions?: { id: string; code?: string | null }[]
  shipping_address?: Address | null
  shipping_methods?: { name?: string; amount?: number; shipping_option_id?: string }[]
  payment_collection?: { id: string; payment_sessions?: PaymentSession[] } | null
  total?: number
  subtotal?: number
  item_subtotal?: number
  shipping_total?: number
  tax_total?: number
  discount_total?: number
}

/** Serializable cart snapshot for client components (drawer, badge). */
export type CartSummary = {
  id: string
  count: number
  currency: string
  subtotal: number
  items: {
    id: string
    title: string
    handle: string | null
    variantTitle: string | null
    thumbnail: string | null
    quantity: number
    unitPrice: number
    compareAt: number | null
  }[]
}

export function summarizeCart(cart: Cart | null): CartSummary | null {
  if (!cart) {
    return null
  }
  const items = (cart.items || []).map((item) => ({
    id: item.id,
    title: item.product_title || item.title || "Book",
    handle: item.product_handle || null,
    variantTitle: item.variant_title || null,
    thumbnail: mediaUrl(item.thumbnail),
    quantity: item.quantity,
    unitPrice: item.unit_price || 0,
    compareAt:
      item.compare_at_unit_price && item.compare_at_unit_price > (item.unit_price || 0)
        ? item.compare_at_unit_price
        : null,
  }))
  return {
    id: cart.id,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    currency: cart.currency_code || "usd",
    subtotal:
      typeof cart.item_subtotal === "number"
        ? cart.item_subtotal
        : items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    items,
  }
}


/** Gift details ride along on the cart and are copied onto the order. */
type GiftMetadata = { is_gift?: boolean; gift_message?: string; gift_wrap?: boolean; affiliate_code?: string }

function parseGift(note: string | null): GiftMetadata {
  if (!note) {
    return {}
  }
  try {
    return JSON.parse(note) as GiftMetadata
  } catch {
    return {}
  }
}

function toCart(row: CartRow): Cart {
  const metadata = parseGift(row.giftNote)
  return {
    id: row.id,
    email: row.email,
    customer_id: row.customerId,
    currency_code: row.currency,
    region_id: row.currency,
    metadata,
    items: row.lines.map((line) => ({
      id: line.id,
      title: line.productTitle,
      product_id: line.productId,
      product_title: line.productTitle,
      product_handle: line.productHandle,
      product_subtitle: line.productSubtitle,
      variant_title: line.variantTitle,
      variant_id: line.variantId,
      thumbnail: line.thumbnail,
      quantity: line.quantity,
      unit_price: toMajor(line.unitPriceMinor),
      subtotal: toMajor(line.subtotalMinor),
      variant: {
        inventory_quantity: line.available,
        manage_inventory: line.manageInventory,
        allow_backorder: line.allowBackorder,
      },
    })),
    promotions: row.promotionCode ? [{ id: row.promotionCode, code: row.promotionCode }] : [],
    shipping_address: (row.shippingAddress as Address) || null,
    shipping_methods: row.shippingOptionId
      ? [{ shipping_option_id: row.shippingOptionId, amount: toMajor(row.totals.shippingMinor) }]
      : [],
    payment_collection: null,
    item_subtotal: toMajor(row.totals.itemSubtotalMinor),
    subtotal: toMajor(row.totals.itemSubtotalMinor),
    discount_total: toMajor(row.totals.discountMinor),
    shipping_total: toMajor(row.totals.shippingMinor),
    tax_total: toMajor(row.totals.taxMinor),
    total: toMajor(row.totals.totalMinor),
  }
}

async function cartId(): Promise<string | null> {
  return (await cookies()).get(CART_COOKIE)?.value || null
}

export async function getCart(): Promise<Cart | null> {
  const id = await cartId()
  if (!id) {
    return null
  }
  const row = await dbGetCart(await db(), id)
  // A completed cart is history; the shopper starts a new one.
  if (!row || row.completedOrderId) {
    return null
  }
  return toCart(row)
}

async function setCartCookie(id: string) {
  const jar = await cookies()
  jar.set(CART_COOKIE, id, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
  })
}

/** Creates a cart when needed. Only callable from server actions. */
export async function ensureCart(): Promise<Cart> {
  const existing = await getCart()
  if (existing) {
    return existing
  }
  const [database, region, jar] = await Promise.all([db(), currentRegion(), cookies()])
  const affiliate = jar.get(AFFILIATE_COOKIE)?.value
  // A cart started while signed in belongs to that account from the start.
  const { getCustomer } = await import("./auth")
  const customer = await getCustomer().catch(() => null)
  const id = await createCart(database, {
    currency: region.currency,
    countryCode: region.country,
    customerId: customer?.id ?? null,
    email: customer?.email ?? null,
  })
  if (affiliate) {
    // Carried onto the order, where the admin credits the affiliate.
    await setCartFields(database, id, { giftNote: JSON.stringify({ affiliate_code: affiliate }) })
  }
  await setCartCookie(id)
  const row = await dbGetCart(database, id)
  return toCart(row as CartRow)
}

export async function addLine(variantId: string, quantity = 1) {
  const cart = await ensureCart()
  await dbAddLine(await db(), cart.id, variantId, quantity, cart.currency_code || "usd")
  return getCart()
}

export async function updateLine(lineId: string, quantity: number) {
  const cart = await ensureCart()
  await dbUpdateLine(await db(), cart.id, lineId, quantity)
  return getCart()
}

export async function removeLine(lineId: string) {
  const cart = await ensureCart()
  await dbRemoveLine(await db(), cart.id, lineId)
  return getCart()
}

/** Moves the cart to another currency, re-pricing what is already in it. */
export async function moveCartToRegion(regionId: string) {
  const cart = await getCart()
  if (!cart || cart.currency_code === regionId) {
    return cart
  }
  await repriceCart(await db(), cart.id, regionId)
  return getCart()
}

/**
 * Links the current cart to the signed-in customer, so the order lands in
 * their account and their reviews count as verified purchases.
 */
export async function attachCartToCustomer() {
  const [cart, token] = await Promise.all([getCart(), getAuthToken()])
  if (!cart || !token) {
    return
  }
  const { getCustomer } = await import("./auth")
  const customer = await getCustomer().catch(() => null)
  if (customer && cart.customer_id !== customer.id) {
    await setCartFields(await db(), cart.id, { customerId: customer.id, email: cart.email || customer.email })
  }
}

export async function applyPromotion(code: string): Promise<{ applied: boolean; cart: Cart | null }> {
  const cart = await ensureCart()
  const applied = await dbApplyPromotion(await db(), cart.id, code)
  return { applied, cart: await getCart() }
}

export async function removePromotion(code: string) {
  const cart = await ensureCart()
  // Only clear the code the shopper actually asked to remove.
  if (cart.promotions?.some((promotion) => promotion.code === code)) {
    await setCartFields(await db(), cart.id, { promotionCode: null })
  }
  return getCart()
}

export type GiftOptions = { is_gift: boolean; gift_message: string; gift_wrap: boolean }

export function readGiftOptions(cart: Cart | null): GiftOptions {
  const meta = cart?.metadata || {}
  return {
    is_gift: meta.is_gift === true,
    gift_message: typeof meta.gift_message === "string" ? meta.gift_message : "",
    gift_wrap: meta.gift_wrap === true,
  }
}

/** Gift details travel with the order on the cart. */
export async function setGiftOptions(options: GiftOptions) {
  const cart = await ensureCart()
  const metadata: GiftMetadata = {
    ...(cart.metadata as GiftMetadata),
    is_gift: options.is_gift,
    gift_message: options.is_gift ? options.gift_message.slice(0, 300) : "",
    gift_wrap: options.is_gift && options.gift_wrap,
  }
  await setCartFields(await db(), cart.id, { giftNote: JSON.stringify(metadata) })
  return getCart()
}

export async function updateCartAddress(input: {
  email: string
  first_name: string
  last_name: string
  address_1: string
  address_2?: string
  city: string
  postal_code: string
  country_code: string
  phone: string
  province?: string
}) {
  const cart = await ensureCart()
  const address = {
    first_name: input.first_name,
    last_name: input.last_name,
    address_1: input.address_1,
    address_2: input.address_2 || "",
    city: input.city,
    postal_code: input.postal_code,
    country_code: input.country_code.toLowerCase(),
    phone: input.phone,
    province: input.province || input.city,
  }
  const database = await db()
  await setCartFields(database, cart.id, {
    email: input.email,
    shippingAddress: address,
    billingAddress: address,
    countryCode: address.country_code,
  })
  // A delivery address in another currency region re-prices the cart.
  const region = resolveRegion(address.country_code)
  if (region.currency !== cart.currency_code) {
    await repriceCart(database, cart.id, region.currency)
  }
  return getCart()
}

export type ShippingOption = {
  id: string
  name: string
  amount?: number
  price_type?: string
}

export async function listShippingOptions(id: string): Promise<ShippingOption[]> {
  const database = await db()
  const row = await dbGetCart(database, id)
  if (!row) {
    return []
  }
  const options = await dbListShippingOptions(database, {
    countryCode: row.countryCode,
    currency: row.currency,
    subtotalMinor: row.totals.itemSubtotalMinor,
  })

  const flat: ShippingOption[] = options
    .filter((option) => option.provider !== "shippo")
    .map((option) => ({
      id: option.id,
      name: option.free ? `${option.name} (free)` : option.name,
      amount: toMajor(option.amountMinor),
      price_type: "flat",
    }))
  // Nothing set up for this destination: offer standard delivery at the
  // admin's fallback rate, so a shopper is never left with no way to check out.
  if (!flat.length) {
    flat.push(await standardDelivery(database, row))
  }

  // Live courier rates, when Shippo is configured and we have somewhere to
  // ship to. If it is unavailable the flat rates above still carry the order.
  const config = shippoConfig()
  const address = row.shippingAddress as Record<string, string> | null
  if (!config || !options.some((option) => option.provider === "shippo") || !address?.address_1) {
    return flat
  }

  const rates = await shippo.getRates(config, {
    to: {
      name: [address.first_name, address.last_name].filter(Boolean).join(" ") || "Customer",
      street1: address.address_1,
      street2: address.address_2 || undefined,
      city: address.city || "",
      state: address.province || undefined,
      zip: address.postal_code || undefined,
      country: (address.country_code || "").toUpperCase(),
      phone: address.phone || undefined,
    },
    parcel: shippo.parcelFor(
      row.lines.map((line) => ({ ...line.dimensions, quantity: line.quantity }))
    ),
  })

  const live = await Promise.all(
    rates.slice(0, 4).map(async (rate) => ({
      id: `shippo:${rate.objectId}`,
      name: `${rate.provider} ${rate.service}${rate.estimatedDays ? ` (${rate.estimatedDays} days)` : ""}`,
      // Shippo quotes in its own currency; the cart charges in the shopper's.
      amount:
        rate.currency.toLowerCase() === row.currency
          ? rate.amount
          : await convertFromBase(rate.amount, row.currency),
      price_type: "calculated",
    }))
  )
  return [...flat, ...live]
}

/**
 * The fallback option: the admin's Shipping settings give a KES and a USD
 * rate and free-shipping thresholds; other currencies convert the USD ones.
 */
async function standardDelivery(database: D1, row: CartRow): Promise<ShippingOption> {
  const settings = await getSettings<{
    shipping?: { fallbackUsd?: number; fallbackKes?: number; freeThresholdUsd?: number; freeThresholdKes?: number }
  }>(database)
  const s = settings.shipping || {}
  const inCurrency = async (kes: number | undefined, usd: number | undefined) => {
    if (row.currency === "kes" && Number(kes) > 0) return toMinor(Number(kes))
    if (!(Number(usd) > 0)) return 0
    return row.currency === "usd" ? toMinor(Number(usd)) : convert(toMinor(Number(usd)), row.currency, await getFxRates(database))
  }
  const rate = await inCurrency(s.fallbackKes, s.fallbackUsd)
  const threshold = await inCurrency(s.freeThresholdKes, s.freeThresholdUsd)
  const free = threshold > 0 && row.totals.itemSubtotalMinor >= threshold
  return {
    id: STANDARD_SHIPPING_ID,
    name: free || !rate ? "Standard delivery (free)" : "Standard delivery",
    amount: free ? 0 : toMajor(rate),
    price_type: "flat",
  }
}

export async function selectShipping(optionId: string) {
  const cart = await ensureCart()
  const options = await listShippingOptions(cart.id)
  // Only an option we actually offer, at our price: an unknown id must not
  // become free delivery.
  const chosen = options.find((option) => option.id === optionId)
  if (!chosen) {
    throw new CartError("Choose a delivery option.")
  }
  await setCartFields(await db(), cart.id, {
    shippingOptionId: chosen.id,
    shippingTotalMinor: toMinor(chosen.amount || 0),
  })
  return getCart()
}

/** What still stands between this cart and taking payment, in the shopper's words. */
function notReadyForPayment(cart: Cart): string | null {
  if (!cart.items?.length) return "Your cart is empty."
  if (!cart.email || !cart.shipping_address?.address_1) return "Add your delivery address first."
  if (!cart.shipping_methods?.length) return "Choose a delivery option."
  if (!((cart.total || 0) > 0)) return "Your cart total is zero."
  // Checked before any money moves, so nobody pays for a book that is gone.
  const short = cart.items.find(
    (item) =>
      item.variant?.manage_inventory &&
      !item.variant.allow_backorder &&
      item.quantity > Number(item.variant.inventory_quantity ?? 0)
  )
  if (short) {
    const left = Math.max(0, Number(short.variant?.inventory_quantity ?? 0))
    return left
      ? `Only ${left} of "${short.product_title || short.title}" left. Please update your cart.`
      : `"${short.product_title || short.title}" just sold out. Please remove it from your cart.`
  }
  return null
}

export type PaymentChoice = { id: string; label: string; hint: string }

const PAYMENT_LABELS: Record<string, Omit<PaymentChoice, "id">> = {
  pp_daraja_daraja: {
    label: "M-Pesa",
    hint: "We send an STK push to your phone. Enter your M-Pesa PIN to approve.",
  },
  pp_stripe_stripe: {
    label: "Credit / Debit Card, Apple Pay, Google Pay",
    hint: "Secured by Stripe with 3D Secure.",
  },
  pp_system_default: {
    label: "Test payment",
    hint: "Development only. Places the order without charging anything.",
  },
}

/** Payment methods the shopper's region offers, from configuration. */
export async function listPaymentChoices(): Promise<PaymentChoice[]> {
  const region = await currentRegion()
  const ids = [
    ...(region.mpesa && mpesaConfig() ? ["pp_daraja_daraja"] : []),
    ...(stripePublishableKey && stripeConfig() ? ["pp_stripe_stripe"] : []),
    ...(process.env.NODE_ENV === "production" ? [] : ["pp_system_default"]),
  ]
  return ids.map((id) => ({ id, ...PAYMENT_LABELS[id] }))
}

export type PaymentSessionInput = {
  providerId: string
  data?: Record<string, unknown>
  restart?: boolean
}

/**
 * Starts a payment with the chosen provider.
 *
 * M-Pesa pushes an STK prompt to the shopper's phone and returns while they
 * approve it; Stripe returns a client secret for the card form to confirm.
 * Neither creates the order - that happens once the money is confirmed, so a
 * failed payment never leaves an order behind.
 */
export async function startPaymentSession(input: PaymentSessionInput): Promise<PaymentSession> {
  const cart = await ensureCart()
  const database = await db()
  const problem = notReadyForPayment(cart)
  if (problem) {
    throw new CartError(problem)
  }
  const totalMinor = toMinor(cart.total || 0)
  const currency = cart.currency_code || "usd"

  if (input.providerId === "pp_system_default") {
    return { id: "test", provider_id: input.providerId, status: "pending", data: {} }
  }

  if (input.providerId === "pp_daraja_daraja") {
    const config = mpesaConfig()
    if (!config) {
      throw new CartError("M-Pesa is not available right now.")
    }
    if (currency !== "kes") {
      throw new CartError("M-Pesa is only available for orders in Kenyan shillings.")
    }
    const phone = String(input.data?.phone || "")
    if (!mpesa.isKenyanMobile(phone)) {
      throw new CartError("Enter your M-Pesa number as 2547XXXXXXXX or 2541XXXXXXXX.")
    }
    // Daraja deals in whole shillings; the attempt records exactly what was asked for.
    const shillings = Math.ceil(totalMinor / 100)
    const push = await mpesa
      .stkPush(config, {
        phone,
        amount: shillings,
        accountReference: cart.id.slice(-12),
        description: "Maktabah Ruhayn order",
        callbackUrl: config.callbackUrl,
      })
      .catch((error) => {
        console.error("STK push failed", error)
        throw new CartError("We couldn't send the M-Pesa prompt. Check the number and try again.")
      })
    await recordPendingPayment(database, {
      cartId: cart.id,
      provider: "mpesa",
      reference: push.checkoutRequestId,
      amountMinor: shillings * 100,
      currency,
    })
    return {
      id: push.checkoutRequestId,
      provider_id: input.providerId,
      status: "pending",
      data: { checkout_request_id: push.checkoutRequestId, message: push.customerMessage },
    }
  }

  if (input.providerId === "pp_stripe_stripe") {
    const config = stripeConfig()
    if (!config) {
      throw new CartError("Card payments are unavailable right now.")
    }
    const intent = await stripe.createPaymentIntent(config, {
      amountMinor: totalMinor,
      currency,
      email: cart.email,
      orderReference: cart.id,
      // One intent per cart and amount: returning to checkout reuses it, and a
      // cart that changed gets a new intent for the new total. Stripe refuses
      // to replay one key with different parameters.
      idempotencyKey: `cart_intent_${cart.id}_${totalMinor}_${currency}`,
    })
    await recordPendingPayment(database, {
      cartId: cart.id,
      provider: "stripe",
      reference: intent.id,
      amountMinor: totalMinor,
      currency,
    })
    return {
      id: intent.id,
      provider_id: input.providerId,
      status: intent.status,
      data: { client_secret: intent.clientSecret },
    }
  }

  throw new CartError("That payment method is not available.")
}

/** Which provider this cart already started paying with, if any. */
async function startedProvider(database: Awaited<ReturnType<typeof db>>, id: string): Promise<string> {
  const [stripeAttempt, mpesaAttempt] = await Promise.all([
    findPendingPayment(database, id, "stripe"),
    findPendingPayment(database, id, "mpesa"),
  ])
  if (stripeAttempt) {
    return "pp_stripe_stripe"
  }
  if (mpesaAttempt) {
    return "pp_daraja_daraja"
  }
  return "pp_system_default"
}

export type CompleteResult =
  | { type: "order"; orderId: string }
  | { type: "pending"; message: string }
  | { type: "error"; message: string }

/** Hands the browser its order: the cart is spent, and the confirmation page may show this one. */
async function orderPlaced(orderId: string): Promise<CompleteResult> {
  const jar = await cookies()
  jar.delete(CART_COOKIE)
  jar.set(LAST_ORDER_COOKIE, orderId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24,
  })
  return { type: "order", orderId }
}

function failure(result: FinalizeResult & { ok: false }): CompleteResult {
  if (result.reason === "out_of_stock") {
    return { type: "error", message: `${result.detail || "An item"} just sold out.` }
  }
  if (result.reason === "amount_mismatch") {
    // The cart changed after the payment was started; the shopper pays again
    // for what is in it now, and the earlier payment is refunded.
    console.error("Payment does not cover the cart", result.detail)
    return { type: "error", message: "Your cart changed after you started paying. Please pay again for the updated total." }
  }
  if (result.reason === "conflict") {
    return { type: "pending", message: "Your order is being placed." }
  }
  return { type: "error", message: "We could not place this order. Please try again." }
}

/**
 * Turns the cart into an order once its payment is confirmed.
 *
 * The provider's webhook or callback usually gets there first and places the
 * order on its own; then this just finds it. Otherwise it asks the provider
 * (never the browser) whether the money arrived, and finishes the order
 * through the same checks.
 */
export async function completeCart(provider?: string): Promise<CompleteResult> {
  const database = await db()
  const id = await cartId()
  const row = id ? await dbGetCart(database, id) : null
  if (!row) {
    return { type: "error", message: "Your cart has expired. Please add your books again." }
  }
  if (row.completedOrderId) {
    return orderPlaced(row.completedOrderId)
  }
  // Signed in after the cart was started? The order still goes to the account.
  if (!row.customerId) {
    await attachCartToCustomer()
  }
  const cart = toCart((await dbGetCart(database, row.id)) || row)

  // When the caller does not say, the payment already started on this cart
  // decides. Defaulting to the test payment here would place an unpaid order
  // for a card or M-Pesa checkout.
  const chosen = provider || (await startedProvider(database, cart.id))

  if (chosen === "pp_system_default") {
    // The test payment takes no money, so it must never run in production.
    if (process.env.NODE_ENV === "production") {
      return { type: "error", message: "Choose a payment method." }
    }
    const problem = notReadyForPayment(cart)
    if (problem) {
      return { type: "error", message: problem }
    }
    const result = await placeOrder(database, {
      cartId: cart.id,
      idempotencyKey: orderKeyForCart(cart.id),
      email: cart.email || "",
      payment: { provider: "manual", status: "captured" },
      shippingMethod: await shippingMethodFor(database, row),
    })
    return result.ok ? orderPlaced(result.orderId) : failure(result)
  }

  if (chosen === "pp_daraja_daraja") {
    const attempt = await findPendingPayment(database, cart.id, "mpesa")
    if (!attempt?.reference) {
      return { type: "error", message: "Start the M-Pesa payment first." }
    }
    if (attempt.status === "failed") {
      return { type: "error", message: "The M-Pesa payment was not completed. Please try again." }
    }
    if (attempt.status !== "captured") {
      // Safaricom has not called back yet; the checkout page keeps polling.
      return { type: "pending", message: "Waiting for your M-Pesa confirmation." }
    }
    const result = await finalizePaidCart(database, {
      cartId: cart.id,
      provider: "mpesa",
      reference: attempt.reference,
      paidMinor: attempt.amountMinor,
      currency: attempt.currency,
    })
    return result.ok ? orderPlaced(result.orderId) : failure(result)
  }

  if (chosen === "pp_stripe_stripe") {
    const config = stripeConfig()
    const attempt = await findPendingPayment(database, cart.id, "stripe")
    if (!config || !attempt?.reference) {
      return { type: "error", message: "Start the card payment first." }
    }
    // Ask Stripe directly rather than trusting the browser's word for it.
    const intent = await stripe.retrievePaymentIntent(config, attempt.reference)
    if (!stripe.intentIsPaid(intent.status)) {
      return { type: "pending", message: "Your card payment is still being confirmed." }
    }
    const result = await finalizePaidCart(database, {
      cartId: cart.id,
      provider: "stripe",
      reference: intent.id,
      paidMinor: intent.amount,
      currency: intent.currency,
    })
    return result.ok ? orderPlaced(result.orderId) : failure(result)
  }

  return { type: "error", message: "That payment method is not available." }
}

export async function validateAddress(address: {
  name: string
  street1: string
  street2?: string
  city: string
  state?: string
  zip?: string
  country: string
  phone?: string
}) {
  const config = shippoConfig()
  if (!config) {
    return { is_valid: true, messages: [] as string[] }
  }
  const result = await shippo.validateAddress(config, {
    name: address.name,
    street1: address.street1,
    street2: address.street2,
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country.toUpperCase(),
    phone: address.phone,
  })
  return { is_valid: result.isValid, messages: result.messages }
}
