import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { manageAffiliateWorkflow, type AffiliateInputBody } from "../types"

/** POST /admin/maktabah/affiliates/:id */
export async function POST(req: MedusaRequest<AffiliateInputBody>, res: MedusaResponse) {
  const { result } = await manageAffiliateWorkflow(req.scope).run({
    input: { ...req.validatedBody, id: req.params.id },
  })
  res.json({ affiliate: result })
}

/** DELETE /admin/maktabah/affiliates/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  await manageAffiliateWorkflow(req.scope).run({ input: { id: req.params.id, delete: true } })
  res.json({ id: req.params.id, object: "affiliate", deleted: true })
}
