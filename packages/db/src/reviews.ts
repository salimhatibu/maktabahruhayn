import type { D1 } from "./client"

export type RatingSummary = {
  average: number
  count: number
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>
}

export type ReviewRow = {
  id: string
  productId: string
  authorName: string | null
  rating: number
  title: string | null
  body: string | null
  createdAt: string
  verifiedPurchase: boolean
}

/** Average and count of approved reviews, for a page of books. */
export async function getRatingSummaries(db: D1, productIds: string[]): Promise<Record<string, RatingSummary>> {
  if (!productIds.length) {
    return {}
  }
  const placeholders = productIds.map((_, i) => `?${i + 1}`).join(", ")
  const { results } = await db
    .prepare(
      `SELECT product_id, rating, COUNT(*) AS count
         FROM review
        WHERE status = 'approved' AND product_id IN (${placeholders})
        GROUP BY product_id, rating`
    )
    .bind(...productIds)
    .all<{ product_id: string; rating: number; count: number }>()

  const out: Record<string, RatingSummary> = {}
  for (const row of results) {
    const entry =
      out[row.product_id] ||
      (out[row.product_id] = { average: 0, count: 0, distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } })
    const star = String(Math.min(Math.max(Math.round(row.rating), 1), 5)) as "1" | "2" | "3" | "4" | "5"
    entry.distribution[star] += row.count
    entry.count += row.count
  }
  for (const entry of Object.values(out)) {
    const total = Object.entries(entry.distribution).reduce((sum, [star, n]) => sum + Number(star) * n, 0)
    entry.average = entry.count ? Math.round((total / entry.count) * 10) / 10 : 0
  }
  return out
}

export async function listReviews(db: D1, productId: string, limit = 10, offset = 0) {
  const [rows, summary] = await Promise.all([
    db
      .prepare(
        // A review counts as verified when that customer has an order
        // containing a variant of this book.
        `SELECT r.id, r.product_id, r.author_name, r.rating, r.title, r.body, r.created_at,
                EXISTS (
                  SELECT 1 FROM "order" o
                    JOIN order_item oi ON oi.order_id = o.id
                    JOIN variant v ON v.id = oi.variant_id
                   WHERE o.customer_id = r.customer_id AND v.product_id = r.product_id
                ) AS verified
           FROM review r WHERE r.product_id = ?1 AND r.status = 'approved'
          ORDER BY r.created_at DESC LIMIT ?2 OFFSET ?3`
      )
      .bind(productId, Math.min(Math.max(limit, 1), 50), Math.max(offset, 0))
      .all<{
        id: string
        product_id: string
        author_name: string | null
        rating: number
        title: string | null
        body: string | null
        created_at: string
        verified: number
      }>(),
    getRatingSummaries(db, [productId]),
  ])

  return {
    reviews: rows.results.map((r) => ({
      id: r.id,
      productId: r.product_id,
      authorName: r.author_name,
      rating: r.rating,
      title: r.title,
      body: r.body,
      createdAt: r.created_at,
      verifiedPurchase: r.verified === 1,
    })) satisfies ReviewRow[],
    summary:
      summary[productId] ||
      ({ average: 0, count: 0, distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } } satisfies RatingSummary),
  }
}
