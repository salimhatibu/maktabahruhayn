import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { remindAbandonedCartWorkflow } from "../../../../../../workflows/admin-ops"

/** POST /admin/maktabah/abandoned-carts/:id/remind */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  await remindAbandonedCartWorkflow(req.scope).run({ input: { cart_id: req.params.id } })
  res.json({ reminded: true })
}
