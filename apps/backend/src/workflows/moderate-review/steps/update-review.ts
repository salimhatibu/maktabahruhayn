import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { REVIEW_MODULE } from "../../../modules/review"
import type ReviewModuleService from "../../../modules/review/service"

export type ModerateReviewInput = { id: string; status?: "published" | "hidden"; delete?: boolean }

export const updateReviewStep = createStep(
  "update-review",
  async (input: ModerateReviewInput, { container }) => {
    const reviews: ReviewModuleService = container.resolve(REVIEW_MODULE)
    const previous = await reviews.retrieveReview(input.id)
    if (input.delete) {
      await reviews.softDeleteReviews(input.id)
      return new StepResponse({ id: input.id, deleted: true }, { previous, deleted: true })
    }
    const review = await reviews.updateReviews({ id: input.id, status: input.status })
    return new StepResponse({ id: review.id, deleted: false, status: review.status }, { previous, deleted: false })
  },
  async (undo, { container }) => {
    if (!undo) {
      return
    }
    const reviews: ReviewModuleService = container.resolve(REVIEW_MODULE)
    if (undo.deleted) {
      await reviews.restoreReviews(undo.previous.id)
    } else {
      await reviews.updateReviews({ id: undo.previous.id, status: undo.previous.status })
    }
  }
)
