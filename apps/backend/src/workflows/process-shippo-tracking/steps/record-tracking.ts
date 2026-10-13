import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IFulfillmentModuleService } from "@medusajs/framework/types"

export type TrackingEvent = {
  tracking_number: string
  status: string
  status_details?: string
  status_date?: string
  /** Shippo's id for this tracking status; used for idempotency. */
  event_id: string
}

export type RecordTrackingResult = {
  fulfillment_id: string | null
  order_id: string | null
  duplicate: boolean
  delivered: boolean
  already_delivered: boolean
}

/**
 * Stores the latest Shippo tracking status on the fulfillment's metadata.
 * Events already recorded (same event id) are ignored, so retried webhooks
 * are harmless.
 */
/** Previous metadata to restore; fulfillmentId is null when nothing changed. */
type Compensation = { fulfillmentId: string | null; metadata: Record<string, unknown> }

export const recordTrackingStep = createStep<TrackingEvent, RecordTrackingResult, Compensation>(
  "record-tracking",
  async (input: TrackingEvent, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT)

    const { data: labels } = await query.graph({
      entity: "fulfillment_label",
      fields: ["fulfillment_id"],
      filters: { tracking_number: input.tracking_number },
    })
    const fulfillmentId = labels[0]?.fulfillment_id as string | undefined
    if (!fulfillmentId) {
      return new StepResponse<RecordTrackingResult, Compensation>(
        {
          fulfillment_id: null,
          order_id: null,
          duplicate: false,
          delivered: false,
          already_delivered: false,
        },
        { fulfillmentId: null, metadata: {} }
      )
    }

    const { data: rows } = await query.graph({
      entity: "fulfillment",
      fields: ["id", "metadata", "delivered_at", "order.id"],
      filters: { id: fulfillmentId },
    })
    const row = rows[0] as {
      metadata?: Record<string, unknown> | null
      delivered_at?: string | null
      order?: { id: string } | null
    }
    const metadata = row?.metadata || {}
    const seen = (metadata.shippo_event_ids as string[] | undefined) || []

    const result: RecordTrackingResult = {
      fulfillment_id: fulfillmentId,
      order_id: row?.order?.id || null,
      duplicate: seen.includes(input.event_id),
      delivered: input.status === "DELIVERED",
      already_delivered: Boolean(row?.delivered_at),
    }
    if (result.duplicate) {
      return new StepResponse<RecordTrackingResult, Compensation>(result, { fulfillmentId: null, metadata })
    }

    await fulfillment.updateFulfillment(fulfillmentId, {
      metadata: {
        ...metadata,
        tracking_status: input.status,
        tracking_status_details: input.status_details,
        tracking_status_date: input.status_date,
        shippo_event_ids: [...seen, input.event_id].slice(-50),
      },
    })

    return new StepResponse<RecordTrackingResult, Compensation>(result, { fulfillmentId, metadata })
  },
  async (previous, { container }) => {
    if (!previous?.fulfillmentId) {
      return
    }
    const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
    await fulfillment.updateFulfillment(previous.fulfillmentId, { metadata: previous.metadata })
  }
)
