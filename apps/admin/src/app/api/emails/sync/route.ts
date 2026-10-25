import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const RESEND_BASE = "https://api.resend.com"

type ResendEmail = {
  id: string
  last_event: string
}

const EVENT_TO_STATUS: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "sent",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
}

/** POST /api/emails/sync — refresh delivery status from Resend for emails that have a provider_id. */
export async function POST() {
  const token = process.env.EMAIL_API_KEY
  if (!token) {
    return NextResponse.json({ message: "EMAIL_API_KEY is not set." }, { status: 503 })
  }

  const d = await db()
  const { results } = await d
    .prepare(
      `SELECT id, provider_id FROM email_log
       WHERE provider_id IS NOT NULL AND status IN ('sent','delivered','opened')
       ORDER BY created_at DESC LIMIT 50`
    )
    .all<{ id: string; provider_id: string }>()

  if (!results.length) {
    return NextResponse.json({ synced: 0, message: "No emails to sync." })
  }

  let synced = 0
  const stmts: ReturnType<typeof d.prepare>[] = []

  for (const row of results) {
    try {
      const res = await fetch(`${RESEND_BASE}/emails/${row.provider_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) continue
      const email = (await res.json()) as ResendEmail
      const newStatus = EVENT_TO_STATUS[email.last_event]
      if (newStatus) {
        stmts.push(
          d.prepare("UPDATE email_log SET status = ?1 WHERE id = ?2").bind(newStatus, row.id)
        )
        synced++
      }
    } catch {
      continue
    }
  }

  if (stmts.length) {
    await d.batch(stmts)
  }

  return NextResponse.json({ synced })
}
