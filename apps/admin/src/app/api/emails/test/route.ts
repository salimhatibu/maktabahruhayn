import { NextResponse, type NextRequest } from "next/server"
import { newId } from "@maktabah/db"
import { db } from "@/lib/db"

/**
 * POST /api/emails/test { to, template }
 *
 * Sending runs through an HTTP email API rather than SMTP, because a Worker
 * cannot open the raw socket SMTP needs. Without one configured this records
 * the attempt and says so, instead of silently doing nothing.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { to?: string; template?: string }
  const to = String(body.to || "").trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 })
  }

  const endpoint = process.env.EMAIL_API_URL
  const token = process.env.EMAIL_API_KEY
  const from = process.env.SMTP_FROM || "orders@maktabahruhayn.com"
  const subject = `Test email (${body.template || "generic"})`
  let status: "sent" | "failed" = "failed"
  let error: string | null = "No email provider is configured (set EMAIL_API_URL and EMAIL_API_KEY)."
  let providerId: string | null = null

  if (endpoint && token) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text: "This is a test email from the Maktabah Ruhayn admin.",
        }),
      })
      if (response.ok) {
        status = "sent"
        error = null
        const result = (await response.json()) as { id?: string }
        providerId = result.id || null
      } else {
        error = `Provider returned ${response.status}`
      }
    } catch (sendError) {
      error = (sendError as Error).message
    }
  }

  await (await db())
    .prepare(
      `INSERT INTO email_log (id, template, recipient, subject, status, error, provider_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(newId("mail"), body.template || "test", to, subject, status, error, providerId)
    .run()

  return status === "sent"
    ? NextResponse.json({ sent: true })
    : NextResponse.json({ message: error }, { status: 503 })
}
