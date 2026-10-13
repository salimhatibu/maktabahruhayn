import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { markOrderFulfillmentAsDeliveredWorkflow } from "@medusajs/medusa/core-flows"
import { recordTrackingStep, type TrackingEvent } from "./steps/record-tracking"

export const processShippoTrackingWorkflow = createWorkflow(
  "process-shippo-tracking",
  (input: TrackingEvent) => {
    const result = recordTrackingStep(input)

    const deliverInput = transform({ result }, ({ result }) => ({
      orderId: result.order_id as string,
      fulfillmentId: result.fulfillment_id as string,
    }))

    when(
      "mark-delivered",
      { result },
      ({ result }) =>
        result.delivered &&
        !result.duplicate &&
        !result.already_delivered &&
        Boolean(result.order_id && result.fulfillment_id)
    ).then(() => {
      markOrderFulfillmentAsDeliveredWorkflow.runAsStep({ input: deliverInput })
    })

    return new WorkflowResponse(result)
  }
)
