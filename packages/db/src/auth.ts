import type { D1 } from "./client"
import { newId } from "./writes"

/**
 * Customer accounts.
 *
 * Passwords are hashed with PBKDF2-HMAC-SHA256 through Web Crypto, which is
 * what a Worker has: bcrypt and argon2 need native or WASM builds. The
 * iteration count is stored with every hash, so it can be raised later
 * without invalidating existing passwords.
 */
const PBKDF2_ITERATIONS = 100_000
const SESSION_DAYS = 30

export type CustomerRow = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  paymentPref: string | null
  mpesaPhone: string | null
  addresses: CustomerAddressRow[]
}

export type CustomerAddressRow = {
  id: string
  firstName: string | null
  lastName: string | null
  address1: string | null
  address2: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  countryCode: string | null
  phone: string | null
  isDefault: boolean
}

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    256
  )
  return toHex(bits)
}

/** Stored as `pbkdf2$<iterations>$<salt>$<hash>`, carrying its own parameters. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt.buffer)}$${hash}`
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Constant-time comparison, so a wrong password cannot be timed character by character. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * A well-formed hash that matches no password. Checking against it when an
 * email has no account makes that answer take as long as a real one, so
 * sign-in timing does not reveal which addresses are registered.
 */
const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$${"0".repeat(32)}$${"0".repeat(64)}`

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    await pbkdf2(password, fromHex(DUMMY_HASH.split("$")[2]), PBKDF2_ITERATIONS)
    return false
  }
  const [scheme, iterations, salt, hash] = stored.split("$")
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) {
    return false
  }
  // Bounded so a tampered row cannot make one sign-in spin for minutes.
  const rounds = Number(iterations)
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 2_000_000) {
    return false
  }
  return equals(await pbkdf2(password, fromHex(salt), rounds), hash)
}

async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)))
}

/* ---------------------------------------------------------------- accounts */

export async function findCustomerByEmail(db: D1, email: string) {
  return db
    .prepare(`SELECT id, email, password_hash FROM customer WHERE email = ?1`)
    .bind(email.trim().toLowerCase())
    .first<{ id: string; email: string; password_hash: string | null }>()
}

export async function createCustomer(
  db: D1,
  input: {
    email: string
    password: string
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    paymentPref?: string | null
    mpesaPhone?: string | null
  }
): Promise<{ ok: true; customerId: string } | { ok: false; reason: "email_taken" }> {
  const email = input.email.trim().toLowerCase()
  const existing = await findCustomerByEmail(db, email)
  if (existing && existing.password_hash) {
    return { ok: false, reason: "email_taken" }
  }
  const hash = await hashPassword(input.password)
  if (existing) {
    await db
      .prepare(
        `UPDATE customer SET password_hash = ?1, first_name = COALESCE(?2, first_name),
         last_name = COALESCE(?3, last_name), phone = COALESCE(?4, phone),
         payment_pref = COALESCE(?5, payment_pref), mpesa_phone = COALESCE(?6, mpesa_phone)
         WHERE id = ?7`
      )
      .bind(hash, input.firstName || null, input.lastName || null, input.phone || null, input.paymentPref || null, input.mpesaPhone || null, existing.id)
      .run()
    return { ok: true, customerId: existing.id }
  }
  const id = newId("cus")
  try {
    await db
      .prepare(
        `INSERT INTO customer (id, email, password_hash, first_name, last_name, phone, payment_pref, mpesa_phone)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      )
      .bind(
        id,
        email,
        hash,
        input.firstName || null,
        input.lastName || null,
        input.phone || null,
        input.paymentPref || null,
        input.mpesaPhone || null
      )
      .run()
  } catch {
    return { ok: false, reason: "email_taken" }
  }
  return { ok: true, customerId: id }
}

export async function getCustomerById(db: D1, customerId: string): Promise<CustomerRow | null> {
  const row = await db
    .prepare(
      `SELECT id, email, first_name, last_name, phone, payment_pref, mpesa_phone
         FROM customer WHERE id = ?1`
    )
    .bind(customerId)
    .first<Record<string, any>>()
  if (!row) {
    return null
  }
  const { results } = await db
    .prepare(`SELECT * FROM customer_address WHERE customer_id = ?1 ORDER BY is_default DESC, rowid`)
    .bind(customerId)
    .all<Record<string, any>>()
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    paymentPref: row.payment_pref,
    mpesaPhone: row.mpesa_phone,
    addresses: results.map((address) => ({
      id: address.id,
      firstName: address.first_name,
      lastName: address.last_name,
      address1: address.address_1,
      address2: address.address_2,
      city: address.city,
      province: address.province,
      postalCode: address.postal_code,
      countryCode: address.country_code,
      phone: address.phone,
      isDefault: address.is_default === 1,
    })),
  }
}

export async function updateCustomer(
  db: D1,
  customerId: string,
  fields: { firstName?: string | null; lastName?: string | null; phone?: string | null; paymentPref?: string | null; mpesaPhone?: string | null }
): Promise<void> {
  const columns: Record<string, unknown> = {}
  if (fields.firstName !== undefined) columns.first_name = fields.firstName
  if (fields.lastName !== undefined) columns.last_name = fields.lastName
  if (fields.phone !== undefined) columns.phone = fields.phone
  if (fields.paymentPref !== undefined) columns.payment_pref = fields.paymentPref
  if (fields.mpesaPhone !== undefined) columns.mpesa_phone = fields.mpesaPhone
  const names = Object.keys(columns)
  if (!names.length) {
    return
  }
  await db
    .prepare(
      `UPDATE customer SET ${names.map((n, i) => `${n} = ?${i + 2}`).join(", ")},
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?1`
    )
    .bind(customerId, ...names.map((n) => columns[n]))
    .run()
}

/* --------------------------------------------------------------- addresses */

export type AddressInput = {
  firstName?: string | null
  lastName?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
}

export async function saveAddress(
  db: D1,
  customerId: string,
  input: AddressInput & { id?: string | null }
): Promise<string> {
  const text = (value: string | null | undefined, max = 200) => value?.trim().slice(0, max) || null
  const id = input.id || newId("addr")
  // The id comes from the browser. The update only applies to a row this
  // customer owns, so another customer's address can never be overwritten.
  const result = await db
    .prepare(
      `INSERT INTO customer_address (id, customer_id, first_name, last_name, address_1, address_2,
          city, province, postal_code, country_code, phone)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT (id) DO UPDATE SET
         first_name = excluded.first_name, last_name = excluded.last_name,
         address_1 = excluded.address_1, address_2 = excluded.address_2,
         city = excluded.city, province = excluded.province,
         postal_code = excluded.postal_code, country_code = excluded.country_code,
         phone = excluded.phone
       WHERE customer_address.customer_id = excluded.customer_id`
    )
    .bind(
      id,
      customerId,
      text(input.firstName, 80),
      text(input.lastName, 80),
      text(input.address1),
      text(input.address2),
      text(input.city, 100),
      text(input.province, 100),
      text(input.postalCode, 20),
      input.countryCode?.trim().toLowerCase().slice(0, 2) || null,
      text(input.phone, 32)
    )
    .run()
  if (!result.meta?.changes) {
    throw new Error("Address not found.")
  }
  return id
}

export async function deleteAddress(db: D1, customerId: string, addressId: string): Promise<void> {
  await db
    .prepare(`DELETE FROM customer_address WHERE id = ?2 AND customer_id = ?1`)
    .bind(customerId, addressId)
    .run()
}

/** Exactly one address per customer is the default. */
export async function setDefaultAddress(db: D1, customerId: string, addressId: string): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE customer_address SET is_default = 0 WHERE customer_id = ?1`).bind(customerId),
    db
      .prepare(`UPDATE customer_address SET is_default = 1 WHERE id = ?2 AND customer_id = ?1`)
      .bind(customerId, addressId),
  ])
}

/* ---------------------------------------------------------------- sessions */

/** Returns the raw token for the cookie; only its hash is stored. */
export async function createSession(db: D1, customerId: string): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)).buffer)
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await db
    .prepare(`INSERT INTO customer_session (token_hash, customer_id, expires_at) VALUES (?1, ?2, ?3)`)
    .bind(await sha256(token), customerId, expires)
    .run()
  return token
}

export async function customerForSession(db: D1, token: string | null): Promise<CustomerRow | null> {
  if (!token) {
    return null
  }
  const session = await db
    .prepare(
      `SELECT customer_id FROM customer_session
        WHERE token_hash = ?1 AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    )
    .bind(await sha256(token))
    .first<{ customer_id: string }>()
  return session ? getCustomerById(db, session.customer_id) : null
}

export async function endSession(db: D1, token: string | null): Promise<void> {
  if (!token) {
    return
  }
  await db.prepare(`DELETE FROM customer_session WHERE token_hash = ?1`).bind(await sha256(token)).run()
}

/** Clears expired rows; cheap enough to run on sign-in. */
export async function pruneSessions(db: D1): Promise<void> {
  await db
    .prepare(`DELETE FROM customer_session WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .run()
}
