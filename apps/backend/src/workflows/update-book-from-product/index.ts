import { ProductDTO } from "@medusajs/framework/types"
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createRemoteLinkStep,
  dismissRemoteLinkStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"
import { BOOK_MODULE } from "../../modules/book"
import type { BookAdditionalData } from "../../modules/book/types"
import { createBookStep } from "../create-book-from-product/steps/create-book"
import { deleteBookStep } from "./steps/delete-book"
import { updateBookStep } from "./steps/update-book"

export type UpdateBookFromProductWorkflowInput = {
  product: ProductDTO
  additional_data?: BookAdditionalData
}

export const updateBookFromProductWorkflow = createWorkflow(
  "update-book-from-product",
  (input: UpdateBookFromProductWorkflowInput) => {
    const { data: products } = useQueryGraphStep({
      entity: "product",
      fields: ["book.*"],
      filters: {
        id: input.product.id,
      },
    }).config({ name: "retrieve-product-book" })

    const bookFields = transform({ input }, (data) => {
      return data.input.additional_data ?? {}
    })

    const created = when(
      "create-product-book-link",
      { input, products },
      (data) => {
        const values = Object.values(data.input.additional_data ?? {})
        return (
          !data.products[0]?.book &&
          values.some(
            (value) => value !== undefined && value !== null && value !== ""
          )
        )
      }
    ).then(() => {
      const book = createBookStep(bookFields)

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

      return book
    })

    const updatePayload = transform({ input, products }, (data) => {
      const additional = data.input.additional_data ?? {}
      return {
        id: data.products[0].book?.id as string,
        title_arabic: additional.title_arabic,
        author: additional.author,
        translator: additional.translator,
        commentator_tahqeeq: additional.commentator_tahqeeq,
        publisher: additional.publisher,
        binding_type: additional.binding_type,
        script_type: additional.script_type,
        language: additional.language,
        volume_count: additional.volume_count,
        isbn_10: additional.isbn_10,
        isbn_13: additional.isbn_13,
        sample_pdf_url: additional.sample_pdf_url,
      }
    })

    const updated = when(
      "update-product-book",
      { input, products },
      (data) => {
        const values = Object.values(data.input.additional_data ?? {})
        return (
          Boolean(data.products[0]?.book) &&
          values.length > 0 &&
          values.some(
            (value) => value !== undefined && value !== null && value !== ""
          )
        )
      }
    ).then(() => {
      return updateBookStep(updatePayload)
    })

    const deleted = when(
      "delete-product-book-link",
      { input, products },
      (data) => {
        const values = Object.values(data.input.additional_data ?? {})
        return (
          Boolean(data.products[0]?.book) &&
          values.length > 0 &&
          values.every(
            (value) => value === null || value === "" || value === undefined
          )
        )
      }
    ).then(() => {
      deleteBookStep({
        book: products[0].book!,
      })

      dismissRemoteLinkStep({
        [BOOK_MODULE]: {
          book_id: products[0].book!.id,
        },
      })

      return products[0].book!.id
    })

    return new WorkflowResponse({
      created,
      updated,
      deleted,
    })
  }
)
