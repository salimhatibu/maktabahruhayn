import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PAYMENT_REQUEST_MODULE } from "../../../../modules/payment-request"
import type PaymentRequestModuleService from "../../../../modules/payment-request/service"
import { adminStkRequestWorkflow } from "../../../../workflows/admin-ops"

/** GET /admin/maktabah/payment-requests */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const requests: PaymentRequestModuleService = req.scope.resolve(PAYMENT_REQUEST_MODULE)
  const [rows, count] = await requests.listAndCountPaymentRequests({}, { order: { created_at: "DESC" }, take: 100 })
  res.json({ requests: rows, count })
}

type Body = { phone: string; amount: number; reference: string; description?: string; order_id?: string }

/** POST /admin/maktabah/payment-requests: send an M-Pesa STK push. */
export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const { result } = await adminStkRequestWorkflow(req.scope).run({
    input: { ...req.validatedBody, created_by: req.auth_context?.actor_id },
  })
  res.status(201).json({ request: result })
}
