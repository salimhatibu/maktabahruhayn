import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import {
  createBookFromProductWorkflow,
  type CreateBookFromProductWorkflowInput,
} from "../create-book-from-product"
import type { BookAdditionalData } from "../../modules/book/types"

createProductsWorkflow.hooks.productsCreated(
  async ({ products, additional_data }, { container }) => {
    const workflow = createBookFromProductWorkflow(container)

    for (const product of products) {
      await workflow.run({
        input: {
          product,
          additional_data: additional_data as BookAdditionalData | undefined,
        } as CreateBookFromProductWorkflowInput,
      })
    }
  }
)
