import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { BOOK_MODULE } from "../../../modules/book"
import type BookModuleService from "../../../modules/book/service"

type DeleteBookStepInput = {
  book: { id: string }
}

export const deleteBookStep = createStep(
  "delete-book",
  async ({ book }: DeleteBookStepInput, { container }) => {
    const bookModule: BookModuleService = container.resolve(BOOK_MODULE)
    // Load the full record so compensation can restore it exactly.
    const existing = await bookModule.retrieveBook(book.id)
    await bookModule.deleteBooks(book.id)
    return new StepResponse(existing, existing)
  },
  async (book, { container }) => {
    if (!book) {
      return
    }

    const bookModule: BookModuleService = container.resolve(BOOK_MODULE)
    const { raw_volume_count: _raw, ...data } = book as typeof book & {
      raw_volume_count?: unknown
    }
    await bookModule.createBooks(data)
  }
)
