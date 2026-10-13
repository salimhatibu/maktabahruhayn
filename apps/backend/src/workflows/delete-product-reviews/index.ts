import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { deleteReviewsStep } from "./steps/delete-reviews"

export const deleteProductReviewsWorkflow = createWorkflow(
  "delete-product-reviews",
  (input: { product_ids: string[] }) => new WorkflowResponse(deleteReviewsStep(input))
)
