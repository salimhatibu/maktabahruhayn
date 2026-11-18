import { htmlToText, renderEmailHtml } from "@maktabah/shared"
import type { D1 } from "./client"
import { getSettings } from "./catalogue"
import { toMajor } from "./money"
import { DEFAULT_SETTINGS, type EmailSettings } from "./settings-defaults"
import { newId } from "./writes"

export type OrderNotificationEvent = "order_placed" | "order_completed" | "review_request" | "digital_delivery"

type NotificationConfig = {
  endpoint?: string
  token?: string
  from?: string
  storeUrl?: string
  digitalFileAvailable?: (url: string) => Promise<boolean>
}

export function digitalFileKey(fileUrl: string, publicUrl: string): string | null {
  try {
    const base = new URL(publicUrl)
    const url = new URL(fileUrl)
    const prefix = `${base.pathname.replace(/\/+$/, "")}/digital/`
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return null
    const name = decodeURIComponent(url.pathname.slice(prefix.length))
    return name ? `digital/${name}` : null
  } catch {
    return null
  }
}

/** Attempts one transactional email per order and event; failed attempts can be retried. */
export async function notifyOrder(
  db: D1,
  orderId: string,
  event: OrderNotificationEvent,
  config: NotificationConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await sendOrderNotification(db, orderId, event, config)
  } catch (error) {
    console.error(`Order ${orderId} ${event} notification failed`, error)
    return { ok: false, error: "Could not record or send the order email. Check the server logs." }
  }
}

async function sendOrderNotification(
  db: D1,
  orderId: string,
  event: OrderNotificationEvent,
  config: NotificationConfig
): Promise<{ ok: boolean; error?: string }> {
  const order = await db.prepare(`SELECT id, display_id, email, currency_code, total_minor, shipping_address, payment_status, status FROM "order" WHERE id = ?1`)
    .bind(orderId).first<{ id: string; display_id: number; email: string; currency_code: string; total_minor: number; shipping_address: string; payment_status: string; status: string }>()
  if (!order) return { ok: false, error: "Order not found." }

  const settings = await getSettings<{ email?: Partial<EmailSettings>; business?: { name?: string } }>(db)
  const digitalItems = event === "digital_delivery" && order.payment_status === "captured" && order.status !== "cancelled"
    ? await db.prepare(
      `SELECT oi.id, oi.product_title, p.digital_file_url FROM order_item oi
       JOIN variant v ON v.id = oi.variant_id JOIN product p ON p.id = v.product_id
       WHERE oi.order_id = ?1 AND p.delivery_type = 'digital'`
    ).bind(orderId).all<{ id: string; product_title: string; digital_file_url: string | null }>()
    : null
  let digitalError: string | null = null
  if (event === "digital_delivery") {
    if (order.payment_status !== "captured" || order.status === "cancelled") return { ok: false, error: "Digital access requires a paid, active order." }
    if (!digitalItems?.results.length) return { ok: true }
    if (digitalItems.results.some((item) => !item.digital_file_url)) digitalError = "A digital product has no file configured."
    else if (!config.storeUrl || !/^https:\/\//i.test(config.storeUrl)) digitalError = "The storefront URL is not configured for digital delivery."
    else if (!config.digitalFileAvailable) digitalError = "Digital file storage is not configured."
    else {
      try {
        for (const item of digitalItems.results) {
          if (!item.digital_file_url || !(await config.digitalFileAvailable(item.digital_file_url))) {
            digitalError = "A digital file is missing or is not in the configured media bucket."
            break
          }
        }
      } catch (error) {
        console.error(`Digital file validation for order ${orderId} failed`, error)
        digitalError = "Could not check digital file storage."
      }
    }
  }
  const template = event === "digital_delivery"
    ? { enabled: true, subject: "Your digital books for order #{{order.display_id}}", body: "Assalamu alaikum {{customer.first_name}},\n\nYour payment for order #{{order.display_id}} is confirmed. Open your digital books using the links below:\n\n{{digital.links}}\n\nPlease keep these links private.\n\n{{store.name}}" }
    : settings.email?.templates?.[event] ?? DEFAULT_SETTINGS.email.templates[event]
  if (!template.enabled) return { ok: true }

  const items = await db.prepare(`SELECT product_title, quantity FROM order_item WHERE order_id = ?1 ORDER BY rowid`)
    .bind(orderId).all<{ product_title: string; quantity: number }>()
  const reviewLinks = event === "review_request"
    ? await db.prepare(
      `SELECT DISTINCT p.title, p.handle FROM order_item oi
       JOIN variant v ON v.id = oi.variant_id JOIN product p ON p.id = v.product_id
       WHERE oi.order_id = ?1 ORDER BY oi.rowid`
    ).bind(orderId).all<{ title: string; handle: string }>()
    : null
  const address = JSON.parse(order.shipping_address) as { first_name?: string }
  const storeName = settings.business?.name || "Maktabah Ruhayn"
  const storeUrl = (config.storeUrl || "").replace(/\/+$/, "")
  const values: Record<string, string> = {
    "customer.first_name": address.first_name || "Customer",
    "order.display_id": String(order.display_id),
    "order.items": items.results.map((item) => `${item.product_title} × ${item.quantity}`).join("\n"),
    "order.total": `${order.currency_code.toUpperCase()} ${toMajor(order.total_minor).toFixed(2)}`,
    "review.links": (reviewLinks?.results ?? [])
      .map((item) => `${item.title}: ${(config.storeUrl || "").replace(/\/+$/, "")}/books/${item.handle}#reviews`).join("\n"),
    "store.name": storeName,
    "store.url": storeUrl,
  }
  const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  const digitalLinks = (digitalItems?.results ?? []).map((item) => ({
    title: item.product_title,
    url: `${storeUrl}/digital/${encodeURIComponent(orderId)}/${encodeURIComponent(item.id)}`,
  }))
  values["digital.links"] = digitalLinks.map((item) => `${item.title}: ${item.url}`).join("\n")
  const interpolate = (text: string, html: boolean) => text.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => {
    const name = key.trim()
    if (html && name === "digital.links") {
      return digitalLinks.map((item) => `<a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>`).join("<br>")
    }
    const value = values[name] ?? ""
    return html ? escapeHtml(value) : value
  })
  const subject = interpolate(template.subject, false)
  const bodyHtml = interpolate(template.body, true).replace(/\n/g, "<br>")
  const claimed = await db.prepare(
    `INSERT INTO order_notification (order_id, event, status) VALUES (?1, ?2, 'sending')
     ON CONFLICT (order_id, event) DO UPDATE SET status = 'sending', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE status = 'failed' OR (status = 'sending' AND updated_at < strftime('%Y-%m-%dT%H:%M:%fZ','now', '-5 minutes'))`
  ).bind(orderId, event).run()
  if (!claimed.meta?.changes) {
    const existing = await db.prepare(`SELECT status FROM order_notification WHERE order_id = ?1 AND event = ?2`)
      .bind(orderId, event).first<{ status: string }>()
    return existing?.status === "sent" ? { ok: true } : { ok: false, error: "Order email is already being sent." }
  }
  let error: string | null = digitalError
  let providerId: string | null = null
  if (error) {
    // Record the failed delivery below so an admin can retry it.
  } else if (!config.endpoint || !config.token) {
    error = "Email provider is not configured."
  } else {
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `order-${orderId}-${event}`,
        },
        body: JSON.stringify({
          from: config.from || "orders@maktabahruhayn.com",
          to: [order.email],
          subject,
          html: renderEmailHtml({ bodyHtml, storeName, storeUrl }),
          text: event === "digital_delivery" ? htmlToText(interpolate(template.body, false).replace(/\n/g, "<br>")) : htmlToText(bodyHtml),
        }),
      })
      if (!response.ok) error = `Email provider returned ${response.status}.`
      else {
        const result = await response.json() as { id?: string }
        providerId = result.id || null
      }
    } catch (sendError) {
      error = sendError instanceof Error ? sendError.message : "Email delivery failed."
    }
  }
  await db.batch([
    db.prepare(`UPDATE order_notification SET status = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE order_id = ?1 AND event = ?2`)
      .bind(orderId, event, error ? "failed" : "sent"),
    db.prepare(`INSERT INTO email_log (id, template, recipient, subject, status, error, provider_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
      .bind(newId("mail"), event, order.email, subject, error ? "failed" : "sent", error, providerId),
  ])
  if (error) console.error(`Order ${orderId} ${event} notification failed: ${error}`)
  return error ? { ok: false, error } : { ok: true }
}

/** How long after delivery the review request is sent. */
export const REVIEW_REQUEST_DELAY_DAYS = 3

/** Sends review requests for orders delivered at least three days ago; safe to run repeatedly. */
export async function sendDueReviewRequests(
  db: D1,
  config: { endpoint?: string; token?: string; from?: string; storeUrl?: string },
  limit = 25
): Promise<{ sent: number; failed: number }> {
  const due = await db.prepare(
    `SELECT o.id FROM "order" o
     LEFT JOIN order_notification n ON n.order_id = o.id AND n.event = 'review_request'
     WHERE o.fulfillment_status = 'delivered' AND o.status != 'cancelled'
       AND o.delivered_at IS NOT NULL
       AND o.delivered_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now', '-${REVIEW_REQUEST_DELAY_DAYS} days')
       AND (n.order_id IS NULL OR n.status = 'failed'
            OR (n.status = 'sending' AND n.updated_at < strftime('%Y-%m-%dT%H:%M:%fZ','now', '-5 minutes')))
     ORDER BY o.delivered_at LIMIT ?1`
  ).bind(limit).all<{ id: string }>()
  let sent = 0
  let failed = 0
  for (const row of due.results) {
    const result = await notifyOrder(db, row.id, "review_request", config)
    if (result.ok) sent += 1
    else failed += 1
  }
  return { sent, failed }
}
