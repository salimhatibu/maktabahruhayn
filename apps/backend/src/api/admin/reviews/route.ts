import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../modules/review"
import type ReviewModuleService from "../../../modules/review/service"

/** GET /admin/reviews?status=published&limit=50&offset=0 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const reviews: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  const status = req.query.status === "hidden" || req.query.status === "published" ? req.query.status : undefined
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const [rows, count] = await reviews.listAndCountReviews(status ? { status } : {}, {
    order: { created_at: "DESC" },
    skip: offset,
    take: limit,
  })
  res.json({ reviews: rows, count, limit, offset })
}
