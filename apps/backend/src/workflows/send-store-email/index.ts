import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendEmailStep, type SendStoreEmailInput } from "./steps/send-email"

export const sendStoreEmailWorkflow = createWorkflow(
  "send-store-email",
  (input: SendStoreEmailInput) => new WorkflowResponse(sendEmailStep(input))
)
