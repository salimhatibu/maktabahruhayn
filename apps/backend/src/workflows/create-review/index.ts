import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createReviewStep, type CreateReviewInput } from "./steps/create-review"

export const createReviewWorkflow = createWorkflow("create-review", (input: CreateReviewInput) => {
  const review = createReviewStep(input)
  return new WorkflowResponse(review)
})
