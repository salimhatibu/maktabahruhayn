import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { abandonedCarts } from "../../../../lib/reports"

/** GET /admin/maktabah/abandoned-carts?hours=1 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const hours = Math.max(Number(req.query.hours) || 1, 0)
  const carts = await abandonedCarts(query, { olderThanHours: hours, limit: 300 })
  res.json({ carts, count: carts.length })
}
