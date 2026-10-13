import { MedusaService } from "@medusajs/framework/utils"
import { Review } from "./models/review"

export type RatingSummary = {
  average: number
  count: number
  /** Count of reviews per star rating, 1 through 5. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
}

class ReviewModuleService extends MedusaService({ Review }) {
  /** Average rating and star distribution of published reviews per product. */
  async summarize(productIds: string[]): Promise<Record<string, RatingSummary>> {
    if (!productIds.length) {
      return {}
    }
    const reviews = await this.listReviews(
      { product_id: productIds, status: "published" },
      { select: ["product_id", "rating"], take: null }
    )
    const out: Record<string, RatingSummary> = {}
    for (const id of productIds) {
      out[id] = { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }
    }
    for (const review of reviews) {
      const summary = out[review.product_id]
      const stars = Math.min(5, Math.max(1, Math.round(review.rating))) as 1 | 2 | 3 | 4 | 5
      summary.count += 1
      summary.distribution[stars] += 1
      summary.average += review.rating
    }
    for (const summary of Object.values(out)) {
      summary.average = summary.count ? Math.round((summary.average / summary.count) * 10) / 10 : 0
    }
    return out
  }
}

export default ReviewModuleService
