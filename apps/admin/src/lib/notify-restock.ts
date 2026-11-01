import { newId, type D1 } from "@maktabah/db"
import { htmlToText, renderEmailHtml } from "@maktabah/shared"

type Waiting = {
  id: string
  email: string
  variant_id: string | null
  title: string
  handle: string
  option_value: string | null
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * Emails everyone waiting on a book that is back on the shelf, and marks
 * their alert notified so it never goes out twice.
 *
 * Called after stock is written. An alert with no variant is waiting on the
 * book as a whole, so any edition coming back satisfies it; one naming a
 * variant waits for that edition alone. Availability counts reservations,
 * so copies already promised to an open order do not look like stock.
 *
 * Never throws: a restock must still succeed if the mail provider is down.
 */
export async function notifyRestocked(d: D1, variantIds: string[]): Promise<number> {
  const ids = [...new Set(variantIds.filter(Boolean))]
  if (!ids.length) return 0

  const endpoint = process.env.EMAIL_API_URL
  const token = process.env.EMAIL_API_KEY
  if (!endpoint || !token) return 0

  const from = process.env.SMTP_FROM || "orders@maktabahruhayn.com"
  const storeUrl = (process.env.STOREFRONT_URL || "").replace(/\/+$/, "")
  const storeName = process.env.STORE_NAME || "Maktabah Ruhayn"

  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",")
  const available = `(SELECT COALESCE(SUM(il.stocked_quantity - il.reserved_quantity), 0)
                       FROM inventory_level il WHERE il.variant_id = v.id)`

  let waiting: Waiting[] = []
  try {
    const { results } = await d
      .prepare(
        `SELECT sa.id, sa.email, sa.variant_id, p.title, p.handle, v.option_value
           FROM stock_alert sa
           JOIN product p ON p.id = sa.product_id AND p.deleted_at IS NULL
           JOIN variant v ON v.product_id = p.id
          WHERE sa.status = 'waiting'
            AND v.id IN (${placeholders})
            AND (sa.variant_id IS NULL OR sa.variant_id = v.id)
            AND (v.manage_inventory = 0 OR ${available} > 0)
          GROUP BY sa.id`
      )
      .bind(...ids)
      .all<Waiting>()
    waiting = results
  } catch {
    return 0
  }
  if (!waiting.length) return 0

  let notified = 0
  const done: string[] = []
  const logs: ReturnType<typeof d.prepare>[] = []

  for (const w of waiting) {
    const edition = w.variant_id && w.option_value ? ` (${w.option_value})` : ""
    const name = `${w.title}${edition}`
    const link = storeUrl && w.handle ? `${storeUrl}/books/${w.handle}` : storeUrl
    const subject = `${w.title} is back in stock`
    const bodyHtml =
      `<h2>${escape(name)} is back</h2>` +
      `<p>You asked us to let you know when this came back to the shelf. It is available again now.</p>` +
      (link
        ? `<p><a href="${escape(link)}">View ${escape(w.title)}</a></p>`
        : "") +
      `<p>Stock is limited, so it may go again shortly.</p>`

    let status: "sent" | "failed" = "failed"
    let error: string | null = null
    let providerId: string | null = null

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [w.email],
          subject,
          html: renderEmailHtml({ bodyHtml, storeName, storeUrl, address: "Nairobi • Kenya" }),
          text: htmlToText(bodyHtml),
        }),
      })
      if (response.ok) {
        status = "sent"
        const result = (await response.json()) as { id?: string }
        providerId = result.id || null
        done.push(w.id)
        notified++
      } else {
        error = `Provider returned ${response.status}`
      }
    } catch (e) {
      error = (e as Error).message
    }

    logs.push(
      d
        .prepare(
          `INSERT INTO email_log (id, template, recipient, subject, status, error, provider_id)
           VALUES (?1, 'back_in_stock', ?2, ?3, ?4, ?5, ?6)`
        )
        .bind(newId("mail"), w.email, subject, status, error, providerId)
    )
  }

  // Only the ones that actually went out are closed; a failure stays waiting
  // so the next restock tries again rather than losing the customer silently.
  try {
    if (done.length) {
      const marks = done.map((_, i) => `?${i + 1}`).join(",")
      logs.push(
        d.prepare(
          `UPDATE stock_alert SET status = 'notified', notified_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id IN (${marks})`
        ).bind(...done)
      )
    }
    for (let i = 0; i < logs.length; i += 50) {
      await d.batch(logs.slice(i, i + 50))
    }
  } catch {
    // The mail is already away; losing the bookkeeping must not fail the restock.
  }

  return notified
}
