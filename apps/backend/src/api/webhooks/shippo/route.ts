import crypto from "node:crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { processShippoTrackingWorkflow } from "../../../workflows/process-shippo-tracking"

type ShippoWebhook = {
  event?: string
  data?: {
    tracking_number?: string
    tracking_status?: {
      object_id?: string
      status?: string
      status_details?: string
      status_date?: string
    }
  }
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

/**
 * POST /webhooks/shippo?token=SHIPPO_WEBHOOK_SECRET
 *
 * Shippo does not sign webhook bodies, so the endpoint is authenticated with
 * a shared secret in the URL configured in the Shippo dashboard. Processing
 * is idempotent per tracking-status id.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const secret = process.env.SHIPPO_WEBHOOK_SECRET || ""
  const token = String(req.query.token || req.headers["x-shippo-token"] || "")
  if (!secret || !safeEqual(token, secret)) {
    res.status(401).json({ message: "Invalid webhook token" })
    return
  }

  const body = req.body as ShippoWebhook
  const status = body.data?.tracking_status
  if (body.event !== "track_updated" || !body.data?.tracking_number || !status?.status) {
    res.status(200).json({ ignored: true })
    return
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const eventId =
    status.object_id ||
    crypto
      .createHash("sha256")
      .update(`${body.data.tracking_number}|${status.status}|${status.status_date || ""}`)
      .digest("hex")

  const { result } = await processShippoTrackingWorkflow(req.scope).run({
    input: {
      tracking_number: body.data.tracking_number,
      status: status.status,
      status_details: status.status_details,
      status_date: status.status_date,
      event_id: eventId,
    },
  })

  logger.info(
    `Shippo tracking ${body.data.tracking_number}: ${status.status}${result.duplicate ? " (duplicate)" : ""}`
  )
  res.status(200).json({ received: true, duplicate: result.duplicate })
}
