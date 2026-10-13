import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import {
  updateBookFromProductWorkflow,
  type UpdateBookFromProductWorkflowInput,
} from "../update-book-from-product"
import type { BookAdditionalData } from "../../modules/book/types"

updateProductsWorkflow.hooks.productsUpdated(
  async ({ products, additional_data }, { container }) => {
    if (!additional_data) {
      return
    }

    const workflow = updateBookFromProductWorkflow(container)

    for (const product of products) {
      await workflow.run({
        input: {
          product,
          additional_data: additional_data as BookAdditionalData,
        } as UpdateBookFromProductWorkflowInput,
      })
    }
  }
)
