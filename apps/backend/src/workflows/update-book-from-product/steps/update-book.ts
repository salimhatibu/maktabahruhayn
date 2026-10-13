import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { BOOK_MODULE } from "../../../modules/book"
import type BookModuleService from "../../../modules/book/service"
import type { BookAdditionalData } from "../../../modules/book/types"
import { pickBookFields } from "../../../modules/book/types"

type UpdateBookStepInput = {
  id: string
} & BookAdditionalData

export const updateBookStep = createStep(
  "update-book",
  async ({ id, ...data }: UpdateBookStepInput, { container }) => {
    const bookModule: BookModuleService = container.resolve(BOOK_MODULE)
    const prevData = await bookModule.retrieveBook(id)
    const fields = pickBookFields(data)

    const book = await bookModule.updateBooks({
      id,
      ...fields,
    })

    return new StepResponse(book, prevData)
  },
  async (prevData, { container }) => {
    if (!prevData) {
      return
    }

    const bookModule: BookModuleService = container.resolve(BOOK_MODULE)
    await bookModule.updateBooks(prevData)
  }
)
