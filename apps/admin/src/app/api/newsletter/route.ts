import { NextResponse, type NextRequest } from "next/server"
import { newId } from "@maktabah/db"
import { csvRow } from "@/lib/csv"
import { db } from "@/lib/db"

/**
 * GET /api/newsletter?limit= — subscribers, newest first.
 * `?format=csv` returns the export the previous admin offered.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const limit = Math.min(Math.max(Number(params.get("limit")) || 200, 1), 1000)

  const { results } = await (await db())
    .prepare(
      `SELECT id, email, name, phone, country_code, source, created_at
         FROM newsletter_subscriber ORDER BY created_at DESC LIMIT ?1`
    )
    .bind(limit)
    .all<Record<string, string | null>>()

  if (params.get("format") === "csv") {
    const header = "email,name,phone,country,source,subscribed_at"
    const rows = results.map((row) =>
      csvRow([row.email, row.name, row.phone, row.country_code, row.source, row.created_at])
    )
    return new NextResponse([header, ...rows].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="subscribers.csv"',
      },
    })
  }

  return NextResponse.json({ subscribers: results, count: results.length })
}

/**
 * POST /api/newsletter — import subscribers from CSV.
 * Accepts a CSV body where the first column is the email address.
 * Uses INSERT OR IGNORE so duplicates are silently skipped.
 */
export async function POST(request: NextRequest) {
  const text = await request.text()
  if (!text.trim()) {
    return NextResponse.json({ message: "Empty CSV body." }, { status: 400 })
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
  const emails: string[] = []

  for (const line of lines) {
    const cols = line.split(",").map((c) => c.replace(/^["'\s]+|["'\s]+$/g, ""))
    const candidate = cols[0]
    if (emailRe.test(candidate)) {
      emails.push(candidate.toLowerCase())
    }
  }

  if (!emails.length) {
    return NextResponse.json({ message: "No valid email addresses found in the CSV." }, { status: 400 })
  }

  const unique = [...new Set(emails)]
  const d = await db()
  const now = new Date().toISOString()
  let imported = 0

  const BATCH = 50
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH)
    const stmts = chunk.map((email) =>
      d
        .prepare(
          `INSERT OR IGNORE INTO newsletter_subscriber (id, email, source, created_at)
           VALUES (?1, ?2, 'csv-import', ?3)`
        )
        .bind(newId("nsub"), email, now)
    )
    const results = await d.batch(stmts)
    imported += results.filter((r) => r.meta?.changes && r.meta.changes > 0).length
  }

  return NextResponse.json({ imported, skipped: unique.length - imported, total: unique.length })
}
