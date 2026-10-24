import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  const d1 = await db()
  const { results } = await d1
    .prepare(
      `SELECT sa.id, sa.email, sa.status, sa.created_at, sa.notified_at,
              p.title AS product_title, p.handle AS product_handle,
              v.title AS variant_title
         FROM stock_alert sa
         LEFT JOIN product p ON p.id = sa.product_id
         LEFT JOIN variant v ON v.id = sa.variant_id
        ORDER BY sa.created_at DESC
        LIMIT 500`
    )
    .all<Record<string, string | null>>()

  return NextResponse.json({ alerts: results, count: results.length })
}
