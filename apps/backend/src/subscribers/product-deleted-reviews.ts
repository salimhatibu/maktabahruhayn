import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { deleteProductReviewsWorkflow } from "../workflows/delete-product-reviews"

/** Reviews belong to a product; remove them when the product is deleted. */
export default async function productDeletedReviews({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await deleteProductReviewsWorkflow(container).run({ input: { product_ids: [data.id] } })
}

export const config: SubscriberConfig = {
  event: "product.deleted",
}
