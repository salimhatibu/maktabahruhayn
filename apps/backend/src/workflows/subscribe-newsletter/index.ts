import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { subscribeStep, type SubscribeInput } from "./steps/subscribe"

export const subscribeNewsletterWorkflow = createWorkflow(
  "subscribe-newsletter",
  (input: SubscribeInput) => new WorkflowResponse(subscribeStep(input))
)
