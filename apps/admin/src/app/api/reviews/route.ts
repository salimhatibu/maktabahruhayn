import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"

/** GET /api/reviews?status=&product_id= — the moderation queue. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const status = params.get("status")
  const productId = params.get("product_id")

  const where: string[] = []
  const binds: unknown[] = []
  if (status && status !== "all") {
    binds.push(status)
    where.push(`r.status = ?${binds.length}`)
  }
  if (productId) {
    binds.push(productId)
    where.push(`r.product_id = ?${binds.length}`)
  }

  const { results } = await (await db())
    .prepare(
      `SELECT r.id, r.product_id, r.customer_id, r.author_name, r.rating, r.title, r.body,
              r.status, r.created_at, p.title AS product_title
         FROM review r LEFT JOIN product p ON p.id = r.product_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY r.created_at DESC LIMIT 500`
    )
    .bind(...binds)
    .all<Record<string, string | number | null>>()

  return NextResponse.json({
    reviews: results.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      product_title: row.product_title,
      display_name: row.author_name || "Reader",
      rating: row.rating,
      title: row.title,
      content: row.body,
      status: row.status,
      created_at: row.created_at,
    })),
  })
}
