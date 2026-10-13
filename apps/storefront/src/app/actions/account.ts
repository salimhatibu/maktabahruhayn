"use server"

import { isValidPhoneNumber } from "libphonenumber-js"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { clearAuthToken, getAuthToken, getCustomer, login, register } from "@/lib/auth"
import { attachCartToCustomer } from "@/lib/cart"
import { medusaFetch, MedusaRequestError } from "@/lib/medusa"

export type AccountFormState = { error: string | null; message?: string | null }

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value || "/account")
  // Only same-site relative paths.
  return next.startsWith("/") && !next.startsWith("//") ? next : "/account"
}

export async function loginAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const email = String(formData.get("email") || "").trim().toLowerCase()
  const password = String(formData.get("password") || "")
  if (!email || !password) {
    return { error: "Enter your email and password." }
  }
  try {
    await login(email, password)
    await attachCartToCustomer()
  } catch {
    return { error: "That email and password don't match an account." }
  }
  revalidatePath("/", "layout")
  redirect(safeNext(formData.get("next")))
}

/** "+254712345678" when valid, "" when empty, null when invalid. */
function phoneField(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) || "").trim()
  if (!value) {
    return ""
  }
  return isValidPhoneNumber(value) ? value : null
}

type AddressInput = {
  first_name: string
  last_name: string
  address_1: string
  address_2: string
  city: string
  province: string
  postal_code: string
  country_code: string
  phone: string
}

/** Reads an address from fields named `${prefix}city` etc. Returns an error message when incomplete. */
function addressFrom(
  formData: FormData,
  prefix = "",
  fallbackName?: { first_name: string; last_name: string }
): AddressInput | string {
  const f = (n: string) => String(formData.get(`${prefix}${n}`) || "").trim()
  const phone = phoneField(formData, `${prefix}phone`)
  if (phone === null) {
    return "Check the phone number and its country code."
  }
  const address = {
    first_name: f("first_name") || fallbackName?.first_name || "",
    last_name: f("last_name") || fallbackName?.last_name || "",
    address_1: f("address_1"),
    address_2: f("address_2"),
    city: f("city"),
    province: f("province"),
    postal_code: f("postal_code"),
    country_code: f("country_code").toLowerCase(),
    phone,
  }
  const missing = (["first_name", "last_name", "address_1", "city", "country_code"] as const).filter((k) => !address[k])
  if (missing.length) {
    return `Please fill in: ${missing.map((k) => k.replace("_1", "").replace(/_/g, " ").replace("country code", "country")).join(", ")}.`
  }
  return address
}

function paymentFrom(formData: FormData): { metadata: Record<string, unknown> } | string {
  const method = String(formData.get("preferred_payment") || "none")
  const mpesa = phoneField(formData, "mpesa_phone")
  if (mpesa === null || (mpesa && !/^\+2547\d{8}$|^\+2541\d{8}$/.test(mpesa))) {
    return "Enter a Safaricom number for M-Pesa, e.g. 0712 345 678."
  }
  return {
    metadata: {
      preferred_payment: ["mpesa", "card"].includes(method) ? method : null,
      mpesa_phone: mpesa || null,
    },
  }
}

export async function registerAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const field = (n: string) => String(formData.get(n) || "").trim()
  const email = field("email").toLowerCase()
  const password = String(formData.get("password") || "")
  if (!field("first_name") || !field("last_name") || !email) {
    return { error: "Please fill in your name and email." }
  }
  if (password.length < 8) {
    return { error: "Use a password of at least 8 characters." }
  }
  const phone = phoneField(formData, "phone")
  if (phone === null) {
    return { error: "Check your phone number and its country code." }
  }

  // Optional extras: a shipping address and payment preferences.
  const wantsAddress = formData.get("add_address") === "on"
  const address = wantsAddress
    ? addressFrom(formData, "ship_", { first_name: field("first_name"), last_name: field("last_name") })
    : null
  if (typeof address === "string") {
    return { error: `Shipping address: ${address}` }
  }
  const wantsPayment = formData.get("add_payment") === "on"
  const payment = wantsPayment ? paymentFrom(formData) : null
  if (typeof payment === "string") {
    return { error: payment }
  }

  let token: string
  try {
    token = await register({
      email,
      password,
      first_name: field("first_name"),
      last_name: field("last_name"),
      phone: phone || undefined,
      metadata: payment?.metadata,
    })
    await attachCartToCustomer()
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    return {
      error: /exist/i.test(message)
        ? "An account with this email already exists. Sign in instead."
        : "We could not create your account. Please try again.",
    }
  }

  if (address) {
    await medusaFetch("/store/customers/me/addresses", {
      method: "POST",
      token,
      body: JSON.stringify({ ...address, is_default_shipping: true, is_default_billing: true }),
    }).catch((error) => console.error(error))
  }
  if (formData.get("newsletter") === "on") {
    await subscribe({ email, name: `${field("first_name")} ${field("last_name")}`, phone: phone || undefined, source: "register" }).catch(
      () => undefined
    )
  }
  revalidatePath("/", "layout")
  redirect(safeNext(formData.get("next")))
}

export async function logoutAction() {
  const token = await getAuthToken()
  if (token) {
    await fetch(`${process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"}/auth/session`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined)
  }
  await clearAuthToken()
  revalidatePath("/", "layout")
  redirect("/")
}

export async function updateProfileAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const token = await getAuthToken()
  if (!token) {
    return { error: "Please sign in again." }
  }
  const first = String(formData.get("first_name") || "").trim()
  const last = String(formData.get("last_name") || "").trim()
  if (!first || !last) {
    return { error: "Enter your first and last name." }
  }
  const phone = phoneField(formData, "phone")
  if (phone === null) {
    return { error: "Check your phone number and its country code." }
  }
  try {
    await medusaFetch("/store/customers/me", {
      method: "POST",
      token,
      revalidate: false,
      body: JSON.stringify({ first_name: first, last_name: last, phone: phone || null }),
    })
  } catch {
    return { error: "We could not update your details." }
  }
  revalidatePath("/account")
  return { error: null, message: "Your details are saved." }
}

export async function updatePaymentPreferenceAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const token = await getAuthToken()
  const customer = await getCustomer().catch(() => null)
  if (!token || !customer) {
    return { error: "Please sign in again." }
  }
  const payment = paymentFrom(formData)
  if (typeof payment === "string") {
    return { error: payment }
  }
  try {
    await medusaFetch("/store/customers/me", {
      method: "POST",
      token,
      revalidate: false,
      body: JSON.stringify({ metadata: { ...(customer.metadata || {}), ...payment.metadata } }),
    })
  } catch {
    return { error: "We could not save your payment preference." }
  }
  revalidatePath("/account")
  return { error: null, message: "Payment preference saved." }
}

export async function saveAddressBookAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const token = await getAuthToken()
  if (!token) {
    return { error: "Please sign in again." }
  }
  const address = addressFrom(formData)
  if (typeof address === "string") {
    return { error: address }
  }
  const id = String(formData.get("address_id") || "")
  const isDefault = formData.get("is_default") === "on"
  try {
    await medusaFetch(id ? `/store/customers/me/addresses/${encodeURIComponent(id)}` : "/store/customers/me/addresses", {
      method: "POST",
      token,
      revalidate: false,
      body: JSON.stringify({ ...address, ...(isDefault ? { is_default_shipping: true, is_default_billing: true } : {}) }),
    })
  } catch {
    return { error: "We could not save this address." }
  }
  revalidatePath("/account")
  return { error: null, message: id ? "Address updated." : "Address added." }
}

export async function deleteAddressAction(formData: FormData) {
  const token = await getAuthToken()
  const id = String(formData.get("address_id") || "")
  if (token && id) {
    await medusaFetch(`/store/customers/me/addresses/${encodeURIComponent(id)}`, { method: "DELETE", token, revalidate: false }).catch(
      (error) => console.error(error)
    )
  }
  revalidatePath("/account")
}

export async function setDefaultAddressAction(formData: FormData) {
  const token = await getAuthToken()
  const id = String(formData.get("address_id") || "")
  if (token && id) {
    await medusaFetch(`/store/customers/me/addresses/${encodeURIComponent(id)}`, {
      method: "POST",
      token,
      revalidate: false,
      body: JSON.stringify({ is_default_shipping: true, is_default_billing: true }),
    }).catch((error) => console.error(error))
  }
  revalidatePath("/account")
}

/* Reviews --------------------------------------------------------- */

export type ReviewFormState = { error: string | null; done?: boolean }

export async function submitReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const token = await getAuthToken()
  if (!token) {
    return { error: "Please sign in to write a review." }
  }
  const productId = String(formData.get("product_id") || "")
  const handle = String(formData.get("handle") || "")
  const rating = Number(formData.get("rating"))
  const content = String(formData.get("content") || "").trim()
  if (!(rating >= 1 && rating <= 5)) {
    return { error: "Choose a star rating." }
  }
  if (content.length < 10) {
    return { error: "Please write at least a sentence (10 characters)." }
  }
  try {
    await medusaFetch(`/store/products/${productId}/reviews`, {
      method: "POST",
      token,
      body: JSON.stringify({
        rating,
        title: String(formData.get("title") || "").trim() || null,
        content,
      }),
    })
  } catch (error) {
    const message = error instanceof MedusaRequestError ? error.publicMessage : null
    return { error: message || "We could not post your review." }
  }
  revalidatePath(`/books/${handle}`)
  return { error: null, done: true }
}

/* Newsletter ------------------------------------------------------ */

async function subscribe(input: { email: string; name?: string; phone?: string; source: string }) {
  await medusaFetch("/store/newsletter", {
    method: "POST",
    revalidate: false,
    body: JSON.stringify(input),
  })
}

export type NewsletterState = { error: string | null; done?: boolean }

export async function newsletterAction(_prev: NewsletterState, formData: FormData): Promise<NewsletterState> {
  const email = String(formData.get("email") || "").trim()
  const name = String(formData.get("name") || "").trim()
  const phone = phoneField(formData, "phone")
  if (!name) {
    return { error: "Enter your name." }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter a valid email address." }
  }
  if (!phone) {
    return { error: phone === null ? "Check your phone number and its country code." : "Enter your phone number." }
  }
  try {
    await subscribe({ email, name, phone, source: String(formData.get("source") || "footer").slice(0, 40) })
    return { error: null, done: true }
  } catch {
    return { error: "We could not sign you up. Please try again." }
  }
}
