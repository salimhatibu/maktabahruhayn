import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { moderateReviewWorkflow } from "../../../../workflows/moderate-review"

type UpdateBody = { status: "published" | "hidden" }

/** POST /admin/reviews/:id { status } — moderation */
export async function POST(req: MedusaRequest<UpdateBody>, res: MedusaResponse) {
  const { result } = await moderateReviewWorkflow(req.scope).run({
    input: { id: req.params.id, status: req.validatedBody.status },
  })
  res.json({ review: result })
}

/** DELETE /admin/reviews/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  await moderateReviewWorkflow(req.scope).run({ input: { id: req.params.id, delete: true } })
  res.json({ id: req.params.id, object: "review", deleted: true })
}
