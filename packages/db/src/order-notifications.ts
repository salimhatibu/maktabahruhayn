import { htmlToText, renderEmailHtml } from "@maktabah/shared"
import type { D1 } from "./client"
import { getSettings } from "./catalogue"
import { toMajor } from "./money"
import { DEFAULT_SETTINGS, type EmailSettings } from "./settings-defaults"
import { newId } from "./writes"

export type OrderNotificationEvent = "order_placed" | "order_completed"

/** Attempts one transactional email per order and event; failed attempts can be retried. */
export async function notifyOrder(
  db: D1,
  orderId: string,
  event: OrderNotificationEvent,
  config: { endpoint?: string; token?: string; from?: string; storeUrl?: string }
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
  config: { endpoint?: string; token?: string; from?: string; storeUrl?: string }
): Promise<{ ok: boolean; error?: string }> {
  const order = await db.prepare(`SELECT id, display_id, email, currency_code, total_minor, shipping_address FROM "order" WHERE id = ?1`)
    .bind(orderId).first<{ id: string; display_id: number; email: string; currency_code: string; total_minor: number; shipping_address: string }>()
  if (!order) return { ok: false, error: "Order not found." }

  const settings = await getSettings<{ email?: Partial<EmailSettings>; business?: { name?: string } }>(db)
  const template = settings.email?.templates?.[event] ?? DEFAULT_SETTINGS.email.templates[event]
  if (!template.enabled) return { ok: true }

  const items = await db.prepare(`SELECT product_title, quantity FROM order_item WHERE order_id = ?1 ORDER BY rowid`)
    .bind(orderId).all<{ product_title: string; quantity: number }>()
  const address = JSON.parse(order.shipping_address) as { first_name?: string }
  const storeName = settings.business?.name || "Maktabah Ruhayn"
  const storeUrl = (config.storeUrl || "").replace(/\/+$/, "")
  const values: Record<string, string> = {
    "customer.first_name": address.first_name || "Customer",
    "order.display_id": String(order.display_id),
    "order.items": items.results.map((item) => `${item.product_title} × ${item.quantity}`).join("\n"),
    "order.total": `${order.currency_code.toUpperCase()} ${toMajor(order.total_minor).toFixed(2)}`,
    "store.name": storeName,
    "store.url": storeUrl,
  }
  const interpolate = (text: string, html: boolean) => text.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => {
    const value = values[key.trim()] ?? ""
    return html ? value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : value
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
  let error: string | null = null
  let providerId: string | null = null
  if (!config.endpoint || !config.token) {
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
          text: htmlToText(bodyHtml),
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
