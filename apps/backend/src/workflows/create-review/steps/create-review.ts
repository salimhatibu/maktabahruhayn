import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { REVIEW_MODULE } from "../../../modules/review"
import type ReviewModuleService from "../../../modules/review/service"

export type CreateReviewInput = {
  product_id: string
  customer_id: string
  rating: number
  title?: string | null
  content: string
}

/**
 * Creates a published review. The customer's display name is first name plus
 * last initial, and the review is marked as a verified purchase when one of
 * the customer's orders contains the product.
 */
export const createReviewStep = createStep(
  "create-review",
  async (input: CreateReviewInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const reviews: ReviewModuleService = container.resolve(REVIEW_MODULE)

    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { id: input.product_id },
    })
    if (!products.length) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Book not found")
    }

    const existing = await reviews.listReviews({
      product_id: input.product_id,
      customer_id: input.customer_id,
    })
    if (existing.length) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, "You have already reviewed this book")
    }

    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["first_name", "last_name", "orders.items.product_id"],
      filters: { id: input.customer_id },
    })
    const customer = customers[0] as
      | {
          first_name?: string | null
          last_name?: string | null
          orders?: { items?: { product_id?: string | null }[] | null }[] | null
        }
      | undefined
    const verified = Boolean(
      customer?.orders?.some((order) =>
        order.items?.some((item) => item.product_id === input.product_id)
      )
    )
    const display =
      [customer?.first_name, customer?.last_name ? `${customer.last_name[0]}.` : null]
        .filter(Boolean)
        .join(" ") || "Reader"

    const review = await reviews.createReviews({
      product_id: input.product_id,
      customer_id: input.customer_id,
      display_name: display,
      rating: input.rating,
      title: input.title || null,
      content: input.content,
      verified_purchase: verified,
    })

    return new StepResponse(review, review.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const reviews: ReviewModuleService = container.resolve(REVIEW_MODULE)
    await reviews.deleteReviews(id)
  }
)
