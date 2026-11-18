import { greetCustomerEmail, htmlToText, isHtml, renderEmailHtml, sanitizeHtml } from "@maktabah/shared"
import type { D1 } from "./client"
import { getSettings } from "./catalogue"
import { DEFAULT_SETTINGS, type BusinessSettings, type EmailSettings } from "./settings-defaults"
import { newId } from "./writes"

type ReminderConfig = { endpoint?: string; token?: string; from?: string; storeUrl?: string }
type DueCart = { id: string; email: string; updated_at: string; first_name: string | null; last_name: string | null }

const eligible = `
  c.completed_order_id IS NULL
  AND c.email IS NOT NULL AND trim(c.email) != ''
  AND EXISTS (SELECT 1 FROM cart_item ci WHERE ci.cart_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM mpesa_checkout m WHERE m.cart_id = c.id AND m.status IN ('starting', 'pending', 'confirmed', 'review'))
  AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.cart_id = c.id AND p.status IN ('pending', 'authorized', 'captured'))
`

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Send at most one reminder per cart. Only recently active, contactable carts are eligible. */
export async function sendDueCartReminders(db: D1, config: ReminderConfig, limit = 25): Promise<{ sent: number; failed: number }> {
  const settings = await getSettings<{ email?: Partial<EmailSettings>; business?: Partial<BusinessSettings> }>(db)
  const email = settings.email
  const template = email?.templates?.abandoned_cart ?? DEFAULT_SETTINGS.email.templates.abandoned_cart
  if (!email?.abandonedCartAuto || !template.enabled) return { sent: 0, failed: 0 }

  const hours = Number(email.abandonedCartAfterHours)
  if (!Number.isFinite(hours) || hours < 1) throw new Error("Invalid abandoned-cart reminder delay.")
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString()
  // The storefront cart cookie expires after 14 days; older links cannot recover a guest's cart.
  const earliest = new Date(Date.now() - 14 * 86400000).toISOString()
  const { results: carts } = await db.prepare(
    `SELECT c.id, c.email, c.updated_at,
       COALESCE(NULLIF(CASE WHEN json_valid(c.shipping_address) THEN json_extract(c.shipping_address, '$.first_name') END, ''), customer.first_name) AS first_name,
       COALESCE(NULLIF(CASE WHEN json_valid(c.shipping_address) THEN json_extract(c.shipping_address, '$.last_name') END, ''), customer.last_name) AS last_name
     FROM cart c LEFT JOIN customer ON customer.id = c.customer_id
     LEFT JOIN cart_reminder r ON r.cart_id = c.id
     WHERE ${eligible} AND c.updated_at <= ?1 AND c.created_at >= ?2
       AND (r.cart_id IS NULL OR r.status = 'failed' OR
         (r.status = 'sending' AND r.updated_at < strftime('%Y-%m-%dT%H:%M:%fZ','now', '-5 minutes')))
     ORDER BY CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END,
       COALESCE(r.updated_at, c.updated_at) ASC LIMIT ?3`
  ).bind(cutoff, earliest, Math.min(Math.max(limit, 1), 100)).all<DueCart>()
  let sent = 0
  let failed = 0

  for (const cart of carts) {
    const claim = await db.prepare(
      `INSERT INTO cart_reminder (cart_id, status)
       SELECT c.id, 'sending' FROM cart c WHERE c.id = ?1 AND c.updated_at = ?2 AND ${eligible}
       ON CONFLICT(cart_id) DO UPDATE SET status = 'sending', error = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE cart_reminder.status = 'failed' OR (cart_reminder.status = 'sending' AND cart_reminder.updated_at < strftime('%Y-%m-%dT%H:%M:%fZ','now', '-5 minutes'))`
    ).bind(cart.id, cart.updated_at).run()
    if (!claim.meta?.changes) continue

    const items = await db.prepare(`SELECT title, quantity FROM cart_item WHERE cart_id = ?1 ORDER BY rowid`)
      .bind(cart.id).all<{ title: string; quantity: number }>()
    const stillEligible = await db.prepare(`SELECT c.id FROM cart c WHERE c.id = ?1 AND c.updated_at = ?2 AND ${eligible}`)
      .bind(cart.id, cart.updated_at).first<{ id: string }>()
    if (!stillEligible) {
      await db.prepare(`DELETE FROM cart_reminder WHERE cart_id = ?1 AND status = 'sending'`).bind(cart.id).run()
      continue
    }

    const storeName = settings.business?.name || "Maktabah Ruhayn"
    const storeUrl = (config.storeUrl || "").replace(/\/+$/, "")
    const values: Record<string, string> = {
      "customer.first_name": cart.first_name?.trim() || "Customer",
      "cart.items": items.results.map((item) => `${item.title} × ${item.quantity}`).join("\n"),
      "store.name": storeName,
      "store.url": storeUrl,
    }
    const interpolate = (value: string) => value.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => escape(values[key.trim()] ?? "").replace(/\n/g, "<br>"))
    const source = isHtml(template.body) ? sanitizeHtml(template.body) : escape(template.body).replace(/\n/g, "<br>")
    // Replace placeholders after sanitizing the template, so customer and cart data remain text.
    const bodyHtml = interpolate(source)
    const greeted = greetCustomerEmail({
      html: bodyHtml,
      text: htmlToText(bodyHtml),
      customerName: [cart.first_name, cart.last_name].filter(Boolean).join(" "),
    })
    const subject = template.subject.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => values[key.trim()] ?? "")
    let error: string | null = null
    let providerId: string | null = null
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cart.email)) error = "Cart email address is invalid."
    else if (!config.endpoint || !config.token) error = "Email provider is not configured."
    else if (!/^https:\/\//i.test(storeUrl)) error = "Storefront URL is not configured."
    else {
      try {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cart.id))
        const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
        const response = await fetch(config.endpoint, {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", "Idempotency-Key": `cart-reminder-${key}` },
          body: JSON.stringify({
            from: config.from || "orders@maktabahruhayn.com",
            to: [cart.email],
            subject,
            html: renderEmailHtml({ bodyHtml: greeted.html, storeName, storeUrl, tagline: settings.business?.tagline, address: settings.business?.address, supportEmail: settings.business?.email, greetingFirst: true }),
            text: greeted.text,
          }),
        })
        if (!response.ok) error = `Email provider returned ${response.status}.`
        else providerId = ((await response.json()) as { id?: string }).id || null
      } catch (sendError) {
        error = sendError instanceof Error ? sendError.message : "Email delivery failed."
      }
    }
    await db.batch([
      db.prepare(`UPDATE cart_reminder SET status = ?2, error = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE cart_id = ?1`)
        .bind(cart.id, error ? "failed" : "sent", error),
      db.prepare(`INSERT INTO email_log (id, template, recipient, subject, status, error, provider_id) VALUES (?1, 'abandoned_cart', ?2, ?3, ?4, ?5, ?6)`)
        .bind(newId("mail"), cart.email, subject, error ? "failed" : "sent", error, providerId),
    ])
    if (error) {
      console.error(`Abandoned-cart reminder failed: ${error}`)
      failed++
    } else sent++
  }
  return { sent, failed }
}
