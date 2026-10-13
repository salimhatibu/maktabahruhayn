import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IPaymentModuleService } from "@medusajs/framework/types"
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { processStkResultWorkflow } from "../../../../../workflows/admin-ops"

/**
 * POST /api/payment/mpesa/callback?sid=<payment session id>
 *
 * Safaricom STK Push callback. (The extra "api" folder makes Medusa serve
 * this at /api/..., the path given in the Daraja configuration.) The provider issues this URL with the Medusa
 * payment session id in `sid`. Success is verified against Safaricom's STK
 * status query before anything is captured (callbacks are unsigned), and
 * processPaymentWorkflow is idempotent, so Safaricom's retries are safe.
 * Optionally restrict callers with DARAJA_ALLOWED_IPS (comma separated).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const allowed = (process.env.DARAJA_ALLOWED_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
  const caller = String(req.headers["cf-connecting-ip"] || req.ip || "")
  if (allowed.length && !allowed.includes(caller)) {
    logger.warn(`Rejected M-Pesa callback from ${caller}`)
    res.status(403).json({ ResultCode: 1, ResultDesc: "Forbidden" })
    return
  }

  const body = (req.body || {}) as Record<string, unknown>
  const sid = typeof req.query.sid === "string" ? req.query.sid : ""
  const rid = typeof req.query.rid === "string" ? req.query.rid : ""

  // Acknowledge immediately; Safaricom retries slow endpoints.
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" })

  // Admin-initiated STK pushes (Payments > M-Pesa STK Push) carry `rid`.
  if (rid) {
    const cb = (body.Body as { stkCallback?: Record<string, unknown> } | undefined)?.stkCallback || {}
    const items = (cb.CallbackMetadata as { Item?: { Name: string; Value: unknown }[] } | undefined)?.Item || []
    try {
      await processStkResultWorkflow(req.scope).run({
        input: {
          request_id: rid,
          checkout_request_id: String(cb.CheckoutRequestID || ""),
          result_code: Number(cb.ResultCode ?? -1),
          result_description: String(cb.ResultDesc || ""),
          receipt: String(items.find((i) => i.Name === "MpesaReceiptNumber")?.Value || "") || undefined,
        },
      })
    } catch (error) {
      logger.error(`M-Pesa payment request callback failed: ${String(error)}`)
    }
    return
  }

  try {
    const payment: IPaymentModuleService = req.scope.resolve(Modules.PAYMENT)
    const action = await payment.getWebhookActionAndData({
      provider: "daraja_daraja",
      payload: {
        data: { ...body, sid },
        rawData: Buffer.from(JSON.stringify(body)),
        headers: req.headers as Record<string, unknown>,
      },
    })
    logger.info(`M-Pesa callback for session ${sid || "unknown"}: ${action.action}`)
    await processPaymentWorkflow(req.scope).run({ input: action })
  } catch (error) {
    logger.error(`M-Pesa callback processing failed: ${String(error)}`)
  }
}
