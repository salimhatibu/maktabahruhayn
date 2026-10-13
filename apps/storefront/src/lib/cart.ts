import { cookies } from "next/headers"
import { getAuthToken } from "./auth"
import { AFFILIATE_COOKIE, CART_COOKIE, mediaUrl, stripePublishableKey } from "./config"
import { getRegionContext, medusaFetch, MedusaRequestError } from "./medusa"

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

const CART_FIELDS = [
  "id",
  "email",
  "customer_id",
  "currency_code",
  "region_id",
  "metadata",
  "total",
  "subtotal",
  "item_subtotal",
  "shipping_total",
  "tax_total",
  "discount_total",
  "*items",
  "*items.variant",
  "*promotions",
  "*shipping_address",
  "*shipping_methods",
  "*payment_collection",
  "*payment_collection.payment_sessions",
].join(",")

function cartPath(id: string, suffix = "") {
  return `/store/carts/${id}${suffix}?fields=${CART_FIELDS}`
}

/** Cart requests carry the customer token so carts attach to accounts. */
async function cartFetch<T>(path: string, init?: RequestInit) {
  return medusaFetch<T>(path, { ...init, revalidate: false, token: await getAuthToken() })
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

export async function getCart(): Promise<Cart | null> {
  const jar = await cookies()
  const id = jar.get(CART_COOKIE)?.value
  if (!id) {
    return null
  }

  try {
    const data = await cartFetch<{ cart: Cart }>(cartPath(id))
    return data.cart
  } catch {
    return null
  }
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

  const region = await getRegionContext()
  if (!region.regionId) {
    throw new Error("No Medusa region is configured")
  }

  const affiliate = (await cookies()).get(AFFILIATE_COOKIE)?.value
  const data = await cartFetch<{ cart: Cart }>(`/store/carts?fields=${CART_FIELDS}`, {
    method: "POST",
    body: JSON.stringify({
      region_id: region.regionId,
      // Carried onto the order, where the admin credits the affiliate.
      ...(affiliate ? { metadata: { affiliate_code: affiliate } } : {}),
    }),
  })
  await setCartCookie(data.cart.id)
  return data.cart
}

export async function addLine(variantId: string, quantity = 1) {
  let cart = await ensureCart()
  const affiliate = (await cookies()).get(AFFILIATE_COOKIE)?.value
  if (affiliate && !cart.metadata?.affiliate_code) {
    cart = (
      await cartFetch<{ cart: Cart }>(cartPath(cart.id), {
        method: "POST",
        body: JSON.stringify({ metadata: { ...(cart.metadata || {}), affiliate_code: affiliate } }),
      })
    ).cart
  }
  const data = await cartFetch<{ cart: Cart }>(cartPath(cart.id, "/line-items"), {
    method: "POST",
    body: JSON.stringify({ variant_id: variantId, quantity }),
  })
  return data.cart
}

export async function updateLine(lineId: string, quantity: number) {
  const cart = await getCart()
  if (!cart) {
    return null
  }
  if (quantity <= 0) {
    return removeLine(lineId)
  }
  const data = await cartFetch<{ cart: Cart }>(cartPath(cart.id, `/line-items/${lineId}`), {
    method: "POST",
    body: JSON.stringify({ quantity }),
  })
  return data.cart
}

export async function removeLine(lineId: string) {
  const cart = await getCart()
  if (!cart) {
    return null
  }
  await cartFetch(`/store/carts/${cart.id}/line-items/${lineId}`, { method: "DELETE" })
  return getCart()
}

/** Moves an existing cart to the visitor's newly chosen region. */
export async function moveCartToRegion(regionId: string) {
  const cart = await getCart()
  if (!cart || cart.region_id === regionId) {
    return cart
  }
  const data = await cartFetch<{ cart: Cart }>(cartPath(cart.id), {
    method: "POST",
    body: JSON.stringify({ region_id: regionId }),
  })
  return data.cart
}

/** Links the current cart to the signed-in customer. */
export async function attachCartToCustomer() {
  const cart = await getCart()
  const token = await getAuthToken()
  if (!cart || !token || cart.customer_id) {
    return
  }
  try {
    await medusaFetch(`/store/carts/${cart.id}/customer`, { method: "POST", token, revalidate: false })
  } catch (error) {
    console.error(error)
  }
}

export async function applyPromotion(code: string) {
  const cart = await ensureCart()
  const data = await cartFetch<{ cart: Cart }>(cartPath(cart.id, "/promotions"), {
    method: "POST",
    body: JSON.stringify({ promo_codes: [code] }),
  })
  const applied = (data.cart.promotions || []).some(
    (p) => p.code?.toLowerCase() === code.toLowerCase()
  )
  return { cart: data.cart, applied }
}

export async function removePromotion(code: string) {
  const cart = await getCart()
  if (!cart) {
    return null
  }
  const data = await cartFetch<{ cart: Cart }>(cartPath(cart.id, "/promotions"), {
    method: "DELETE",
    body: JSON.stringify({ promo_codes: [code] }),
  })
  return data.cart
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

/** Gift details travel with the order as cart metadata. */
export async function setGiftOptions(options: GiftOptions) {
  const cart = await ensureCart()
  const data = await cartFetch<{ cart: Cart }>(cartPath(cart.id), {
    method: "POST",
    body: JSON.stringify({
      metadata: {
        ...(cart.metadata || {}),
        is_gift: options.is_gift,
        gift_message: options.is_gift ? options.gift_message.slice(0, 300) : "",
        gift_wrap: options.is_gift && options.gift_wrap,
      },
    }),
  })
  return data.cart
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

  const data = await cartFetch<{ cart: Cart }>(cartPath(cart.id), {
    method: "POST",
    body: JSON.stringify({ email: input.email, shipping_address: address, billing_address: address }),
  })
  return data.cart
}

export type ShippingOption = {
  id: string
  name: string
  amount?: number
  price_type?: string
}

export async function listShippingOptions(cartId: string): Promise<ShippingOption[]> {
  const data = await cartFetch<{ shipping_options: ShippingOption[] }>(
    `/store/shipping-options?cart_id=${cartId}`
  )
  const options = data.shipping_options || []

  // Calculated (Shippo) options carry no amount until priced for this cart.
  const priced = await Promise.all(
    options.map(async (option) => {
      if (option.price_type !== "calculated") {
        return option
      }
      try {
        const priced = await cartFetch<{ shipping_option: ShippingOption }>(
          `/store/shipping-options/${option.id}/calculate`,
          { method: "POST", body: JSON.stringify({ cart_id: cartId }) }
        )
        return { ...option, amount: priced.shipping_option.amount }
      } catch {
        return option
      }
    })
  )
  // An option without a price in this currency cannot be selected.
  return priced.filter((option) => typeof option.amount === "number")
}

export async function selectShipping(optionId: string) {
  const cart = await ensureCart()
  if (cart.shipping_methods?.some((m) => m.shipping_option_id === optionId)) {
    return cart
  }
  const data = await cartFetch<{ cart: Cart }>(cartPath(cart.id, "/shipping-methods"), {
    method: "POST",
    body: JSON.stringify({ option_id: optionId }),
  })
  return data.cart
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

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

const PAYMENT_ORDER = ["pp_daraja_daraja", "pp_stripe_stripe", "pp_system_default"]

/** Payment methods enabled for the region that this storefront can complete. */
export async function listPaymentChoices(regionId: string): Promise<PaymentChoice[]> {
  try {
    const data = await medusaFetch<{ payment_providers: { id: string }[] }>(
      `/store/payment-providers?region_id=${regionId}`,
      { revalidate: false }
    )
    return (data.payment_providers || [])
      .filter((p) => p.id in PAYMENT_LABELS)
      // Card payments need the Stripe publishable key for Elements.
      .filter((p) => p.id !== "pp_stripe_stripe" || Boolean(stripePublishableKey))
      .map((p) => ({ id: p.id, ...PAYMENT_LABELS[p.id] }))
      .sort((a, b) => PAYMENT_ORDER.indexOf(a.id) - PAYMENT_ORDER.indexOf(b.id))
  } catch {
    return []
  }
}

/**
 * Starts (or resumes) a payment session for the provider. An existing
 * session for the same provider is reused unless `restart` is set, so a page
 * refresh never sends a second M-Pesa prompt or Stripe intent.
 */
export async function startPaymentSession(input: {
  providerId: string
  data?: Record<string, unknown>
  restart?: boolean
}): Promise<PaymentSession> {
  let cart = await ensureCart()
  let collectionId = cart.payment_collection?.id

  if (!collectionId) {
    const created = await cartFetch<{ payment_collection: { id: string } }>(
      "/store/payment-collections",
      { method: "POST", body: JSON.stringify({ cart_id: cart.id }) }
    )
    collectionId = created.payment_collection.id
    cart = (await getCart()) || cart
  }

  const existing = cart.payment_collection?.payment_sessions?.find(
    (s) => s.provider_id === input.providerId
  )
  if (existing && !input.restart) {
    return existing
  }

  const data = await cartFetch<{
    payment_collection: { payment_sessions?: PaymentSession[] }
  }>(`/store/payment-collections/${collectionId}/payment-sessions`, {
    method: "POST",
    body: JSON.stringify({ provider_id: input.providerId, data: input.data || {} }),
  })
  const session = data.payment_collection.payment_sessions?.find(
    (s) => s.provider_id === input.providerId
  )
  if (!session) {
    throw new Error("Payment session was not created")
  }
  return session
}

export type CompleteResult =
  | { type: "order"; orderId: string }
  | { type: "pending"; message: string }
  | { type: "error"; message: string }

/** Completes the cart; an unauthorized payment comes back as pending. */
export async function completeCart(): Promise<CompleteResult> {
  const cart = await ensureCart()
  try {
    const completed = await cartFetch<{
      type: string
      order?: { id: string }
      error?: { message?: string }
    }>(`/store/carts/${cart.id}/complete`, { method: "POST" })

    if (completed.type === "order" && completed.order) {
      const jar = await cookies()
      jar.delete(CART_COOKIE)
      return { type: "order", orderId: completed.order.id }
    }
    return { type: "pending", message: completed.error?.message || "Payment is not authorized yet." }
  } catch (error) {
    const message =
      error instanceof MedusaRequestError ? error.publicMessage || error.message : String(error)
    return /authoriz/i.test(message)
      ? { type: "pending", message }
      : { type: "error", message }
  }
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
  return medusaFetch<{ is_valid: boolean; messages: string[] }>(
    "/store/shipping/validate-address",
    { method: "POST", body: JSON.stringify(address), revalidate: false }
  )
}
