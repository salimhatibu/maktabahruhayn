import { cookies } from "next/headers"
import { AUTH_COOKIE, backendUrl } from "./config"
import { medusaFetch, MedusaRequestError } from "./medusa"

export type Customer = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  metadata?: Record<string, unknown> | null
  addresses?: {
    id: string
    first_name?: string | null
    last_name?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
    country_code?: string | null
    phone?: string | null
    is_default_shipping?: boolean
  }[]
}

export type PaymentPreference = { method: "mpesa" | "card" | "none"; mpesa_phone: string | null }

export function paymentPreference(customer: Customer | null): PaymentPreference {
  const meta = customer?.metadata || {}
  const method = meta.preferred_payment
  return {
    method: method === "mpesa" || method === "card" ? method : "none",
    mpesa_phone: typeof meta.mpesa_phone === "string" ? meta.mpesa_phone : null,
  }
}

export async function getAuthToken(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(AUTH_COOKIE)?.value || null
}

async function setAuthToken(token: string) {
  const jar = await cookies()
  jar.set(AUTH_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function clearAuthToken() {
  const jar = await cookies()
  jar.delete(AUTH_COOKIE)
}

/** POSTs to Medusa's auth routes (no publishable key needed). */
async function authRequest(path: string, body: unknown): Promise<string> {
  const response = await fetch(`${backendUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const data = (await response.json().catch(() => ({}))) as { token?: string; message?: string }
  if (!response.ok || !data.token) {
    throw new Error(data.message || "Authentication failed")
  }
  return data.token
}

export async function login(email: string, password: string) {
  const token = await authRequest("/auth/customer/emailpass", { email, password })
  await setAuthToken(token)
  return token
}

/**
 * Registers an email/password identity, creates the customer record, then
 * signs in so the token carries the new customer id.
 */
export async function register(input: {
  email: string
  password: string
  first_name: string
  last_name: string
  phone?: string
  metadata?: Record<string, unknown>
}) {
  const registrationToken = await authRequest("/auth/customer/emailpass/register", {
    email: input.email,
    password: input.password,
  })
  await medusaFetch("/store/customers", {
    method: "POST",
    token: registrationToken,
    body: JSON.stringify({
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone || undefined,
      metadata: input.metadata,
    }),
  })
  return login(input.email, input.password)
}

export async function getCustomer(): Promise<Customer | null> {
  const token = await getAuthToken()
  if (!token) {
    return null
  }
  try {
    const data = await medusaFetch<{ customer: Customer }>(
      "/store/customers/me?fields=id,email,first_name,last_name,phone,metadata,*addresses",
      { token }
    )
    return data.customer
  } catch (error) {
    if (error instanceof MedusaRequestError && error.status === 401) {
      return null
    }
    throw error
  }
}

export type OrderSummary = {
  id: string
  display_id: number
  created_at: string
  status: string
  fulfillment_status: string
  payment_status: string
  currency_code: string
  total: number
  email?: string
  items: {
    id: string
    product_title?: string | null
    title: string
    variant_title?: string | null
    product_handle?: string | null
    thumbnail?: string | null
    quantity: number
    unit_price: number
    total?: number
  }[]
  shipping_address?: Record<string, string | null> | null
  shipping_methods?: { name: string; amount: number }[]
  fulfillments?: {
    id: string
    shipped_at?: string | null
    delivered_at?: string | null
    labels?: { tracking_number: string; tracking_url: string }[]
    metadata?: Record<string, unknown> | null
  }[]
  item_subtotal?: number
  shipping_total?: number
  tax_total?: number
  discount_total?: number
}

const ORDER_FIELDS =
  "id,display_id,created_at,status,fulfillment_status,payment_status,currency_code,total,email,item_subtotal,shipping_total,tax_total,discount_total,*items,*shipping_address,*shipping_methods,*fulfillments,*fulfillments.labels"

export async function listOrders(): Promise<OrderSummary[]> {
  const token = await getAuthToken()
  if (!token) {
    return []
  }
  const data = await medusaFetch<{ orders: OrderSummary[] }>(
    `/store/orders?fields=${ORDER_FIELDS}&order=-created_at&limit=50`,
    { token }
  )
  return data.orders || []
}

/** Order by id; signed-in customers only see their own orders. */
export async function getOrder(id: string): Promise<OrderSummary | null> {
  const token = await getAuthToken()
  try {
    const data = await medusaFetch<{ order: OrderSummary }>(
      `/store/orders/${encodeURIComponent(id)}?fields=${ORDER_FIELDS}`,
      { token, revalidate: false }
    )
    return data.order
  } catch {
    return null
  }
}
