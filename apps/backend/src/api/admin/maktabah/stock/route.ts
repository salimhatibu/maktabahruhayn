import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { stockRows } from "../../../../lib/reports"
import { setStockLevelWorkflow } from "../../../../workflows/admin-ops"

/** GET /admin/maktabah/stock?q=&max=5 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const q = String(req.query.q || "").toLowerCase()
  const max = req.query.max !== undefined && req.query.max !== "" ? Number(req.query.max) : null
  const rows = (await stockRows(query)).filter(
    (r) =>
      (!q || r.title.toLowerCase().includes(q) || (r.sku || "").toLowerCase().includes(q)) &&
      (max === null || r.available <= max)
  )
  res.json({ rows, count: rows.length })
}

type Body = { inventory_item_id: string; location_id: string; stocked_quantity: number }

/** POST /admin/maktabah/stock { inventory_item_id, location_id, stocked_quantity } */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  await setStockLevelWorkflow(req.scope).run({ input: req.validatedBody })
  res.json({ updated: true })
}
