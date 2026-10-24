"use server"

import { isValidPhoneNumber } from "libphonenumber-js"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  addLine,
  applyPromotion,
  completeCart,
  listPaymentChoices,
  moveCartToRegion,
  removeLine,
  removePromotion,
  selectShipping,
  setGiftOptions,
  startPaymentSession,
  summarizeCart,
  updateCartAddress,
  updateLine,
  validateAddress,
  type CartSummary,
} from "@/lib/cart"
import { saveCustomerAddress } from "@/lib/auth"
import { REGION_COOKIE } from "@/lib/config"
import { LIMITS, throttle } from "@/lib/rate-limit"
import { currentRegion } from "@/lib/region-context"
import { CartError, clampQuantity } from "@maktabah/db"
import { resolveRegion } from "@maktabah/shared"
import { manualRegion } from "@/lib/region"

const EMAIL = /^[^@\s<>"]{1,64}@[^@\s<>"]{1,190}\.[^@\s<>".]{2,}$/

/** A region the shopper picked stays picked; see middleware.ts. */
async function rememberRegion(country: string) {
  const jar = await cookies()
  jar.set(REGION_COOKIE, JSON.stringify(manualRegion(country)), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })
}

export type CartActionResult =
  | { ok: true; cart: CartSummary }
  | { ok: false; error: string }

/** Shows the shopper a message we wrote for them, never an internal one. */
function publicError(error: unknown, fallback: string) {
  return error instanceof CartError && error.message ? error.message : fallback
}

export async function addToCartAction(variantId: string, quantity = 1): Promise<CartActionResult> {
  // Server action arguments arrive from the network as-is: check their types.
  if (typeof variantId !== "string" || !variantId || variantId.length > 100) {
    return { ok: false, error: "This edition is not available." }
  }
  try {
    const cart = await addLine(variantId, clampQuantity(quantity))
    revalidatePath("/cart")
    return { ok: true, cart: summarizeCart(cart)! }
  } catch (error) {
    console.error(error)
    return { ok: false, error: publicError(error, "We could not add this book to your cart.") }
  }
}

export async function updateQuantityAction(formData: FormData) {
  const lineId = String(formData.get("line_id") || "")
  const quantity = Number(formData.get("quantity"))
  if (lineId && Number.isFinite(quantity)) {
    try {
      await updateLine(lineId, Math.max(0, Math.min(Math.round(quantity), 99)))
    } catch (error) {
      console.error(error)
    }
  }
  revalidatePath("/", "layout")
}

export async function removeLineAction(formData: FormData) {
  const lineId = String(formData.get("line_id") || "")
  if (lineId) {
    await removeLine(lineId)
  }
  revalidatePath("/", "layout")
}

/** Used by the drawer, which needs the updated summary back. */
export async function removeLineFromDrawerAction(lineId: string): Promise<CartActionResult> {
  try {
    const cart = await removeLine(lineId)
    revalidatePath("/", "layout")
    return {
      ok: true,
      cart: summarizeCart(cart) || { id: "", count: 0, currency: "usd", subtotal: 0, items: [] },
    }
  } catch (error) {
    return { ok: false, error: publicError(error, "Could not remove the item.") }
  }
}

export async function setRegionAction(formData: FormData) {
  const country = String(formData.get("country") || "").toUpperCase()
  const region = resolveRegion(country)
  if (!region.served) {
    return
  }

  await rememberRegion(country)

  try {
    await moveCartToRegion(region.currency)
  } catch (error) {
    console.error(error)
  }

  revalidatePath("/", "layout")
}

export type FormState = { error: string | null; message?: string | null }

export async function applyPromoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") || "").trim().slice(0, 40)
  if (!code) {
    return { error: "Enter a promo code." }
  }
  // Codes are short; without a limit they could be guessed by brute force.
  const limited = await throttle("promo", LIMITS.promo.ip)
  if (limited) {
    return { error: limited }
  }
  try {
    const { applied } = await applyPromotion(code)
    revalidatePath("/", "layout")
    return applied
      ? { error: null, message: `Code ${code.toUpperCase()} applied.` }
      : { error: `${code.toUpperCase()} is not valid for this cart.` }
  } catch (error) {
    return { error: publicError(error, "That code could not be applied.") }
  }
}

export async function removePromoAction(formData: FormData) {
  const code = String(formData.get("code") || "")
  if (code) {
    await removePromotion(code)
  }
  revalidatePath("/", "layout")
}

export async function saveGiftOptionsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const isGift = formData.get("is_gift") === "on"
  try {
    await setGiftOptions({
      is_gift: isGift,
      gift_message: String(formData.get("gift_message") || ""),
      gift_wrap: formData.get("gift_wrap") === "on",
    })
    revalidatePath("/cart")
    return { error: null, message: isGift ? "Gift options saved." : "Gift options removed." }
  } catch (error) {
    return { error: publicError(error, "Could not save gift options.") }
  }
}

export async function saveAddressAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const LIMITS: Record<string, number> = { email: 254, first_name: 80, last_name: 80, city: 100, province: 100, postal_code: 20, phone: 32, country_code: 2 }
  const field = (name: string) => String(formData.get(name) || "").trim().slice(0, LIMITS[name] ?? 200)
  const phone = field("phone")
  const address = {
    email: field("email"),
    first_name: field("first_name"),
    last_name: field("last_name"),
    address_1: field("address_1"),
    address_2: field("address_2"),
    city: field("city"),
    province: field("province"),
    postal_code: field("postal_code"),
    country_code: field("country_code").toLowerCase(),
    phone,
  }

  const required = ["email", "first_name", "last_name", "address_1", "city", "country_code", "phone"] as const
  const missing = required.filter((key) => !address[key]).map((key) => key.replace("_1", "").replace(/_/g, " ").replace("country code", "country"))
  if (missing.length) {
    return { error: `Please fill in: ${missing.join(", ")}.` }
  }
  if (!EMAIL.test(address.email)) {
    return { error: "Enter a valid email address." }
  }
  if (!isValidPhoneNumber(phone)) {
    return { error: "Check the phone number and its country code." }
  }

  // Shipping to a country in another currency region moves the cart (and the
  // shopper's region) there, so prices and payment methods follow.
  const current = await currentRegion()
  const target = resolveRegion(address.country_code)
  if (!target.canShip) {
    return { error: "We don't ship to that country yet. Contact us and we'll try to help." }
  }

  try {
    if (target.currency !== current.currency) {
      await moveCartToRegion(target.currency)
    }
    const validation = await validateAddress({
      name: `${address.first_name} ${address.last_name}`,
      street1: address.address_1,
      street2: address.address_2 || undefined,
      city: address.city,
      state: address.province || undefined,
      zip: address.postal_code || undefined,
      country: address.country_code.toUpperCase(),
      phone: address.phone,
    })
    if (!validation.is_valid) {
      return { error: validation.messages.join(" ") || "We could not verify this address." }
    }
    await updateCartAddress(address)
  } catch (error) {
    console.error(error)
    return { error: publicError(error, "We could not save your address. Please try again.") }
  }

  if (target.currency !== current.currency) {
    await rememberRegion(address.country_code)
  }

  if (formData.get("save_address") === "on") {
    await saveCustomerAddress({
      firstName: address.first_name,
      lastName: address.last_name,
      address1: address.address_1,
      address2: address.address_2,
      city: address.city,
      province: address.province,
      postalCode: address.postal_code,
      countryCode: address.country_code,
      phone: address.phone,
    }).catch((error) => console.error(error))
  }

  revalidatePath("/", "layout")
  redirect("/checkout?step=delivery")
}

/* ------------------------------------------------------------------ */
/* Payment                                                             */
/* ------------------------------------------------------------------ */

export type PaymentStart =
  | { kind: "error"; error: string }
  | { kind: "done"; orderId: string }
  | { kind: "mpesa"; message: string }
  | { kind: "stripe"; clientSecret: string }

async function prepare(optionId: string, providerId: string) {
  if (!optionId) {
    return "Choose a delivery option."
  }
  const choices = await listPaymentChoices()
  if (!choices.some((c) => c.id === providerId)) {
    return "Choose a payment method."
  }
  await selectShipping(optionId)
  return null
}

/**
 * Starts payment for the chosen method. Test payments complete at once,
 * M-Pesa sends an STK push and returns for polling, Stripe returns the
 * PaymentIntent client secret for the card form.
 */
export async function startPaymentAction(input: {
  optionId: string
  providerId: string
  phone?: string
  restart?: boolean
}): Promise<PaymentStart> {
  try {
    const problem = await prepare(input.optionId, input.providerId)
    if (problem) {
      return { kind: "error", error: problem }
    }

    if (input.providerId === "pp_daraja_daraja") {
      const phone = String(input.phone || "").replace(/\D/g, "")
      if (!/^254[17]\d{8}$/.test(phone)) {
        return { kind: "error", error: "Enter your M-Pesa number as 2547XXXXXXXX or 2541XXXXXXXX." }
      }
      // Each attempt rings a real phone, so neither a visitor nor a number
      // can be used to send a stream of payment prompts.
      const limited = await throttle("stk", LIMITS.stk.ip, { ...LIMITS.stk.key, key: phone })
      if (limited) {
        return { kind: "error", error: limited }
      }
      await startPaymentSession({ providerId: input.providerId, data: { phone }, restart: input.restart })
      const result = await completeCart(input.providerId)
      if (result.type === "order") {
        return { kind: "done", orderId: result.orderId }
      }
      return { kind: "mpesa", message: "Check your phone and enter your M-Pesa PIN to pay." }
    }

    if (input.providerId === "pp_stripe_stripe") {
      const session = await startPaymentSession({ providerId: input.providerId, restart: input.restart })
      const secret = session.data?.client_secret
      if (typeof secret !== "string") {
        return { kind: "error", error: "Card payments are unavailable right now." }
      }
      return { kind: "stripe", clientSecret: secret }
    }

    await startPaymentSession({ providerId: input.providerId })
    const result = await completeCart(input.providerId)
    if (result.type === "order") {
      return { kind: "done", orderId: result.orderId }
    }
    return { kind: "error", error: result.message }
  } catch (error) {
    console.error(error)
    return { kind: "error", error: publicError(error, "We could not start your payment.") }
  }
}

/** Retries cart completion (M-Pesa polling, after Stripe confirmation). */
export async function completeOrderAction(): Promise<
  { kind: "done"; orderId: string } | { kind: "pending" } | { kind: "error"; error: string }
> {
  const result = await completeCart()
  if (result.type === "order") {
    revalidatePath("/", "layout")
    return { kind: "done", orderId: result.orderId }
  }
  if (result.type === "pending") {
    return { kind: "pending" }
  }
  return { kind: "error", error: result.message }
}

