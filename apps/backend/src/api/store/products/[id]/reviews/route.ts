import type {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { REVIEW_MODULE } from "../../../../../modules/review"
import type ReviewModuleService from "../../../../../modules/review/service"
import { createReviewWorkflow } from "../../../../../workflows/create-review"
import type { StoreCreateReviewType } from "./validators"

/** GET /store/products/:id/reviews?limit=10&offset=0 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const reviews: ReviewModuleService = req.scope.resolve(REVIEW_MODULE)
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const productId = req.params.id

  const [rows, count] = await reviews.listAndCountReviews(
    { product_id: productId, status: "published" },
    {
      select: ["id", "display_name", "rating", "title", "content", "verified_purchase", "created_at"],
      order: { created_at: "DESC" },
      skip: offset,
      take: limit,
    }
  )
  const summary = (await reviews.summarize([productId]))[productId]
  res.json({ reviews: rows, count, limit, offset, summary })
}

/** POST /store/products/:id/reviews (signed-in customers) */
export async function POST(
  req: AuthenticatedMedusaRequest<StoreCreateReviewType>,
  res: MedusaResponse
) {
  const { result } = await createReviewWorkflow(req.scope).run({
    input: {
      product_id: req.params.id,
      customer_id: req.auth_context.actor_id,
      rating: req.validatedBody.rating,
      title: req.validatedBody.title,
      content: req.validatedBody.content,
    },
  })
  res.status(201).json({ review: result })
}
