import type { D1 } from "./client"

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"

/**
 * Sortable, URL-safe id: a millisecond timestamp in base36 followed by 16
 * characters (~82 bits) from the CSPRNG. Cart ids live in a cookie and order
 * ids appear in links, so they must not be predictable.
 */
export function newId(prefix: string): string {
  const time = Date.now().toString(36)
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let random = ""
  for (const byte of bytes) {
    random += ALPHABET[byte % 36]
  }
  return `${prefix}_${time}${random}`
}

/**
 * Counts one attempt against `key` in the current fixed window and says
 * whether it is still within `limit`. The upsert is a single statement, so
 * concurrent requests cannot both read a stale count.
 */
export async function hitRateLimit(
  db: D1,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % windowSeconds)
  const row = await db
    .prepare(
      `INSERT INTO rate_limit (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(key.slice(0, 200), windowStart)
    .first<{ count: number }>()
  // Expired windows are cleared now and then rather than on every hit.
  if (Math.random() < 0.02) {
    await db.prepare(`DELETE FROM rate_limit WHERE window_start < ?1`).bind(now - 86_400).run()
  }
  return {
    allowed: Number(row?.count ?? 1) <= limit,
    retryAfterSeconds: windowStart + windowSeconds - now,
  }
}

export type NewReview = {
  productId: string
  /** Null while customer accounts still live outside D1. */
  customerId?: string | null
  authorName?: string | null
  rating: number
  title?: string | null
  body: string
}

/** Posts a review for moderation. Returns its id. */
export async function createReview(db: D1, input: NewReview): Promise<string> {
  const id = newId("rev")
  await db
    .prepare(
      `INSERT INTO review (id, product_id, customer_id, author_name, rating, title, body, status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending')`
    )
    .bind(
      id,
      input.productId,
      input.customerId ?? null,
      input.authorName?.slice(0, 80) ?? null,
      Math.min(Math.max(Math.round(input.rating), 1), 5),
      input.title?.trim().slice(0, 120) || null,
      input.body.trim().slice(0, 4000)
    )
    .run()
  return id
}

export type NewSubscriber = {
  email: string
  name?: string | null
  phone?: string | null
  countryCode?: string | null
  source?: string | null
}

/**
 * Adds a newsletter subscriber. Signing up again updates the details rather
 * than failing on the unique email, which is what a resubmitted form means.
 */
export async function subscribeNewsletter(db: D1, input: NewSubscriber): Promise<void> {
  await db
    .prepare(
      `INSERT INTO newsletter_subscriber (id, email, name, phone, country_code, source)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (email) DO UPDATE SET
         name = COALESCE(excluded.name, name),
         phone = COALESCE(excluded.phone, phone),
         country_code = COALESCE(excluded.country_code, country_code)`
    )
    .bind(
      newId("nls"),
      input.email.trim().toLowerCase().slice(0, 254),
      input.name?.trim().slice(0, 120) || null,
      input.phone?.trim().slice(0, 32) || null,
      input.countryCode?.toLowerCase().slice(0, 2) || null,
      input.source?.slice(0, 40) || null
    )
    .run()
}
