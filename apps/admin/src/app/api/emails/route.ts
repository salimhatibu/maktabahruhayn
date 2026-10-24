import { NextResponse } from "next/server"
import { db } from "@/lib/db"

/** GET /api/emails — SMTP status and the send log. */
export async function GET() {
  const { results } = await (await db())
    .prepare(
      `SELECT id, template, recipient, subject, status, error, created_at
         FROM email_log ORDER BY created_at DESC LIMIT 200`
    )
    .all<Record<string, string | null>>()

  return NextResponse.json({
    // Named as the page reads them.
    smtp_configured: Boolean(process.env.EMAIL_API_URL && process.env.EMAIL_API_KEY),
    from: process.env.SMTP_FROM || "",
    emails: results.map((row) => ({
      id: row.id,
      to: row.recipient,
      template: row.template,
      subject: row.subject,
      status: row.status,
      created_at: row.created_at,
    })),
  })
}
