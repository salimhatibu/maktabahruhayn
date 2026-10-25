import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"

/** GET /api/emails — SMTP status and the send log. */
export async function GET() {
  const { results } = await (await db())
    .prepare(
      `SELECT id, template, recipient, subject, status, error, provider_id, created_at
         FROM email_log ORDER BY created_at DESC LIMIT 200`
    )
    .all<Record<string, string | null>>()

  return NextResponse.json({
    smtp_configured: Boolean(process.env.EMAIL_API_URL && process.env.EMAIL_API_KEY),
    from: process.env.SMTP_FROM || "",
    emails: results.map((row) => ({
      id: row.id,
      to: row.recipient,
      template: row.template,
      subject: row.subject,
      status: row.status,
      provider_id: row.provider_id,
      created_at: row.created_at,
    })),
  })
}

/** DELETE /api/emails — remove email log entries by ID. */
export async function DELETE(request: NextRequest) {
  const { ids } = (await request.json()) as { ids?: string[] }
  if (!ids?.length) {
    return NextResponse.json({ message: "No IDs provided." }, { status: 400 })
  }
  const d = await db()
  const stmts = ids.map((id) =>
    d.prepare("DELETE FROM email_log WHERE id = ?1").bind(id)
  )
  await d.batch(stmts)
  return NextResponse.json({ deleted: ids.length })
}
