import { ProductDTO } from "@medusajs/framework/types"
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"
import { BOOK_MODULE } from "../../modules/book"
import type { BookAdditionalData } from "../../modules/book/types"
import { createBookStep } from "./steps/create-book"

export type CreateBookFromProductWorkflowInput = {
  product: ProductDTO
  additional_data?: BookAdditionalData
}

export const createBookFromProductWorkflow = createWorkflow(
  "create-book-from-product",
  (input: CreateBookFromProductWorkflowInput) => {
    const bookData = transform({ input }, (data) => data.input.additional_data ?? {})

    const book = createBookStep(bookData)

    when({ book }, ({ book: createdBook }) => createdBook !== undefined).then(
      () => {
        createRemoteLinkStep([
          {
            [Modules.PRODUCT]: {
              product_id: input.product.id,
            },
            [BOOK_MODULE]: {
              book_id: book.id,
            },
          },
        ])
      }
    )

    return new WorkflowResponse({ book })
  }
)
