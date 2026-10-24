import { NextResponse, type NextRequest } from "next/server"
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
