import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../modules/review"
import type ReviewModuleService from "../../../../modules/review/service"

/** GET /store/reviews/summary?product_id[]=prod_1&product_id[]=prod_2 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const raw = req.query.product_id
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).slice(0, 100)
  const reviews: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  res.json({ summaries: await reviews.summarize(ids) })
}
