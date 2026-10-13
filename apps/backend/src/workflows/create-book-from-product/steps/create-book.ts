import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { BOOK_MODULE } from "../../../modules/book"
import type BookModuleService from "../../../modules/book/service"
import type { BookAdditionalData } from "../../../modules/book/types"
import { pickBookFields } from "../../../modules/book/types"

export const createBookStep = createStep(
  "create-book",
  async (data: BookAdditionalData, { container }) => {
    const fields = pickBookFields(data)
    const hasValues = Object.values(fields).some(
      (value) => value !== undefined && value !== null && value !== ""
    )

    if (!hasValues) {
      return new StepResponse(undefined)
    }

    const bookModule: BookModuleService = container.resolve(BOOK_MODULE)
    const book = await bookModule.createBooks(fields)

    return new StepResponse(book, book)
  },
  async (book, { container }) => {
    if (!book?.id) {
      return
    }

    const bookModule: BookModuleService = container.resolve(BOOK_MODULE)
    await bookModule.deleteBooks(book.id)
  }
)
