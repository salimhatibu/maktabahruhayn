import { NextResponse, type NextRequest } from "next/server"
import { newId } from "@maktabah/db"
import { htmlToText, renderEmailHtml } from "@maktabah/shared"
import { db } from "@/lib/db"

/**
 * POST /api/emails/bulk — send an email to a batch of recipients.
 *
 * Body: { subject, body, recipients: "all" | "subscribers" | string[], limit?: number }
 *
 * When recipients is "all", sends to every customer + subscriber.
 * When "subscribers", sends to newsletter subscribers only.
 * When an array, sends to those specific email addresses.
 * limit caps how many are sent in this request (for batching in groups of 50).
 * offset skips that many rows before taking limit.
 */
export async function POST(request: NextRequest) {
  const payload = (await request.json()) as {
    subject?: string
    body?: string
    recipients?: "all" | "subscribers" | string[]
    limit?: number
    offset?: number
  }

  const subject = String(payload.subject || "").trim()
  const body = String(payload.body || "").trim()
  if (!subject || !body) {
    return NextResponse.json({ message: "Subject and body are required." }, { status: 400 })
  }

  const endpoint = process.env.EMAIL_API_URL
  const token = process.env.EMAIL_API_KEY
  const from = process.env.SMTP_FROM || "orders@maktabahruhayn.com"
  if (!endpoint || !token) {
    return NextResponse.json({ message: "Email provider is not configured (set EMAIL_API_URL and EMAIL_API_KEY)." }, { status: 503 })
  }

  const d = await db()
  let emails: string[] = []
  // subscriber id per address, so the footer can carry a working unsubscribe link
  const subscriberIds = new Map<string, string>()
  const limit = Math.min(Math.max(Number(payload.limit) || 50, 1), 200)
  const offset = Math.max(Number(payload.offset) || 0, 0)

  if (Array.isArray(payload.recipients)) {
    emails = payload.recipients
  } else if (payload.recipients === "subscribers") {
    const { results } = await d
      .prepare("SELECT id, email FROM newsletter_subscriber WHERE status = 'subscribed' ORDER BY created_at ASC LIMIT ?1 OFFSET ?2")
      .bind(limit, offset)
      .all<{ id: string; email: string }>()
    emails = results.map((r) => r.email)
    for (const r of results) subscriberIds.set(r.email.toLowerCase(), r.id)
  } else {
    const { results } = await d
      .prepare(
        `SELECT email, MAX(sub_id) AS sub_id FROM (
           SELECT email, NULL AS sub_id FROM customer
           UNION ALL
           SELECT email, id AS sub_id FROM newsletter_subscriber WHERE status = 'subscribed'
         ) GROUP BY email COLLATE NOCASE ORDER BY email ASC LIMIT ?1 OFFSET ?2`
      )
      .bind(limit, offset)
      .all<{ email: string; sub_id: string | null }>()
    emails = results.map((r) => r.email)
    for (const r of results) if (r.sub_id) subscriberIds.set(r.email.toLowerCase(), r.sub_id)
  }

  if (!emails.length) {
    return NextResponse.json({ sent: 0, failed: 0, total: 0, done: true })
  }

  let sent = 0
  let failed = 0
  const logStmts: ReturnType<typeof d.prepare>[] = []

  const storeUrl = (process.env.STOREFRONT_URL || "").replace(/\/+$/, "")
  const storeName = process.env.STORE_NAME || "Maktabah Ruhayn"

  for (const to of emails) {
    let status: "sent" | "failed" = "failed"
    let error: string | null = null
    let providerId: string | null = null

    const subId = subscriberIds.get(to.toLowerCase())
    const html = renderEmailHtml({
      bodyHtml: body,
      storeName,
      storeUrl,
      address: "Nairobi • Kenya",
      // Customers who never subscribed have nothing to unsubscribe from.
      unsubscribeUrl: subId && storeUrl ? `${storeUrl}/unsubscribe?id=${encodeURIComponent(subId)}` : undefined,
    })

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, html, text: htmlToText(body) }),
      })
      if (response.ok) {
        status = "sent"
        const result = (await response.json()) as { id?: string }
        providerId = result.id || null
        sent++
      } else {
        error = `Provider returned ${response.status}`
        failed++
      }
    } catch (e) {
      error = (e as Error).message
      failed++
    }

    logStmts.push(
      d.prepare(
        `INSERT INTO email_log (id, template, recipient, subject, status, error, provider_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(newId("mail"), "bulk", to, subject, status, error, providerId)
    )
  }

  if (logStmts.length) {
    const BATCH = 50
    for (let i = 0; i < logStmts.length; i += BATCH) {
      await d.batch(logStmts.slice(i, i + BATCH))
    }
  }

  return NextResponse.json({
    sent,
    failed,
    total: emails.length,
    done: emails.length < limit,
  })
}
