import { NextResponse } from "next/server"
import { db } from "@/lib/db"

/** GET /api/media — images already used by products, for "Browse existing". */
export async function GET() {
  const { results } = await (await db())
    .prepare(
      `SELECT pi.url, p.title AS product, p.updated_at
         FROM product_image pi JOIN product p ON p.id = pi.product_id
        WHERE p.deleted_at IS NULL
        ORDER BY p.updated_at DESC`
    )
    .all<{ url: string; product: string }>()

  const seen = new Set<string>()
  const images: { url: string; product: string }[] = []
  for (const row of results) {
    if (!seen.has(row.url)) {
      seen.add(row.url)
      images.push({ url: row.url, product: row.product })
    }
  }
  return NextResponse.json({ images })
}
