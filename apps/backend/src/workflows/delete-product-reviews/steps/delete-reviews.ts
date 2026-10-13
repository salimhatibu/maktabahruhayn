import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { REVIEW_MODULE } from "../../../modules/review"
import type ReviewModuleService from "../../../modules/review/service"

export const deleteReviewsStep = createStep(
  "delete-reviews",
  async (input: { product_ids: string[] }, { container }) => {
    const reviews: ReviewModuleService = container.resolve(REVIEW_MODULE)
    const rows = await reviews.listReviews({ product_id: input.product_ids }, { select: ["id"] })
    const ids = rows.map((r) => r.id)
    if (ids.length) {
      await reviews.softDeleteReviews(ids)
    }
    return new StepResponse({ deleted: ids.length }, ids)
  },
  async (ids, { container }) => {
    if (!ids?.length) {
      return
    }
    const reviews: ReviewModuleService = container.resolve(REVIEW_MODULE)
    await reviews.restoreReviews(ids)
  }
)
