import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateReviewStep, type ModerateReviewInput } from "./steps/update-review"

export const moderateReviewWorkflow = createWorkflow(
  "moderate-review",
  (input: ModerateReviewInput) => new WorkflowResponse(updateReviewStep(input))
)
