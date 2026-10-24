import { cookies } from "next/headers"
import {
  createCustomer,
  createSession,
  customerForSession,
  deleteAddress as dbDeleteAddress,
  endSession,
  findCustomerByEmail,
  getOrder as dbGetOrder,
  listOrdersForCustomer,
  pruneSessions,
  saveAddress as dbSaveAddress,
  setDefaultAddress as dbSetDefaultAddress,
  toMajor,
  updateCustomer,
  verifyPassword,
  type AddressInput,
  type CustomerRow,
  type OrderSummary as DbOrderSummary,
} from "@maktabah/db"
import { AUTH_COOKIE, LAST_ORDER_COOKIE } from "./config"
import { db } from "./db"

/**
 * Customer accounts, stored in D1.
 *
 * A session is an opaque random token in a cookie; only its hash is kept, so
 * the table cannot be replayed as a login and signing out truly ends it.
 * Passwords are PBKDF2-HMAC-SHA256 through Web Crypto, which is what a Worker
 * has available.

 */

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
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearAuthToken() {
  const token = await getAuthToken()
  const jar = await cookies()
  jar.delete(AUTH_COOKIE)
  await endSession(await db(), token)
}

/** The old shape kept metadata; these two fields are columns now. */
function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    email: row.email,
    first_name: row.firstName,
    last_name: row.lastName,
    phone: row.phone,
    metadata: { preferred_payment: row.paymentPref, mpesa_phone: row.mpesaPhone },
    addresses: row.addresses.map((address) => ({
      id: address.id,
      first_name: address.firstName,
      last_name: address.lastName,
      address_1: address.address1,
      address_2: address.address2,
      city: address.city,
      province: address.province,
      postal_code: address.postalCode,
      country_code: address.countryCode,
      phone: address.phone,
      is_default_shipping: address.isDefault,
    })),
  }
}

export class AuthError extends Error {}

export async function login(email: string, password: string) {
  const database = await db()
  const existing = await findCustomerByEmail(database, email)
  // The same message and the same work either way (a missing account still
  // runs a hash), so neither the answer nor its timing reveals which
  // addresses have accounts.
  const valid = await verifyPassword(password, existing?.password_hash ?? null)
  if (!existing || !valid) {
    throw new AuthError("Those details do not match an account.")
  }
  await pruneSessions(database)
  await setAuthToken(await createSession(database, existing.id))
  return existing.id
}

export async function register(input: {
  email: string
  password: string
  first_name: string
  last_name: string
  phone?: string
  metadata?: Record<string, unknown>
}) {
  const metadata = input.metadata || {}
  const created = await createCustomer(await db(), {
    email: input.email,
    password: input.password,
    firstName: input.first_name,
    lastName: input.last_name,
    phone: input.phone,
    paymentPref: typeof metadata.preferred_payment === "string" ? metadata.preferred_payment : null,
    mpesaPhone: typeof metadata.mpesa_phone === "string" ? metadata.mpesa_phone : null,
  })
  if (!created.ok) {
    throw new AuthError("An account already exists for that email address.")
  }
  return login(input.email, input.password)
}

export async function getCustomer(): Promise<Customer | null> {
  const row = await customerForSession(await db(), await getAuthToken())
  return row ? toCustomer(row) : null
}

/** Updates the signed-in customer's details. */
export async function saveProfile(fields: {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  preferred_payment?: string | null
  mpesa_phone?: string | null
}) {
  const customer = await getCustomer()
  if (!customer) {
    throw new AuthError("Please sign in again.")
  }
  await updateCustomer(await db(), customer.id, {
    firstName: fields.first_name,
    lastName: fields.last_name,
    phone: fields.phone,
    paymentPref: fields.preferred_payment,
    mpesaPhone: fields.mpesa_phone,
  })
}

export async function saveCustomerAddress(input: AddressInput & { id?: string | null }) {
  const customer = await getCustomer()
  if (!customer) {
    throw new AuthError("Please sign in again.")
  }
  return dbSaveAddress(await db(), customer.id, input)
}

export async function removeCustomerAddress(addressId: string) {
  const customer = await getCustomer()
  if (customer) {
    await dbDeleteAddress(await db(), customer.id, addressId)
  }
}

export async function makeDefaultAddress(addressId: string) {
  const customer = await getCustomer()
  if (customer) {
    await dbSetDefaultAddress(await db(), customer.id, addressId)
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


function toOrderSummary(order: DbOrderSummary): OrderSummary {
  return {
    id: order.id,
    display_id: order.displayId,
    created_at: order.createdAt,
    status: order.status,
    fulfillment_status: order.fulfillmentStatus,
    payment_status: order.paymentStatus,
    currency_code: order.currency,
    total: toMajor(order.totalMinor),
    item_subtotal: toMajor(order.subtotalMinor),
    discount_total: toMajor(order.discountMinor),
    shipping_total: toMajor(order.shippingMinor),
    tax_total: toMajor(order.taxMinor),
    shipping_address: order.shippingAddress,
    shipping_methods: order.shippingMethod
      ? [{ name: order.shippingMethod.name, amount: toMajor(order.shippingMinor) }]
      : [],
    fulfillments: order.shipments.map((shipment, index) => ({
      id: `${order.id}_shipment_${index}`,
      shipped_at: shipment.createdAt,
      delivered_at: order.fulfillmentStatus === "delivered" ? shipment.createdAt : null,
      labels: shipment.trackingNumber
        ? [{ tracking_number: shipment.trackingNumber, tracking_url: shipment.trackingUrl || "" }]
        : [],
    })),
    email: order.email,
    items: order.items.map((item, index) => ({
      id: `${order.id}_${index}`,
      product_title: item.title,
      title: item.title,
      variant_title: item.variantTitle,
      thumbnail: item.thumbnail,
      quantity: item.quantity,
      unit_price: toMajor(item.unitPriceMinor),
      total: toMajor(item.unitPriceMinor * item.quantity),
    })),
  }
}

export async function listOrders(): Promise<OrderSummary[]> {
  const customer = await getCustomer()
  if (!customer) {
    return []
  }
  const orders = await listOrdersForCustomer(await db(), customer.id)
  return orders.map(toOrderSummary)
}

/**
 * An order, for whoever is entitled to see it:
 *   - the signed-in customer it belongs to (by account, or by their email),
 *   - a guest who supplies the email it was placed with, or
 *   - the browser that just placed it (its confirmation page).
 * Anyone else gets nothing, even with the order id in hand.
 */
export async function getOrder(id: string, proof: { email?: string | null } = {}): Promise<OrderSummary | null> {
  if (!id || id.length > 64) {
    return null
  }
  const order = await dbGetOrder(await db(), id)
  if (!order) {
    return null
  }
  const email = order.email.trim().toLowerCase()
  const customer = await getCustomer().catch(() => null)
  const ownsIt = customer
    ? order.customerId === customer.id || email === customer.email.toLowerCase()
    : false
  const knowsEmail = Boolean(proof.email) && proof.email!.trim().toLowerCase() === email
  const justPlaced = (await cookies()).get(LAST_ORDER_COOKIE)?.value === order.id
  return ownsIt || knowsEmail || justPlaced ? toOrderSummary(order) : null
}
