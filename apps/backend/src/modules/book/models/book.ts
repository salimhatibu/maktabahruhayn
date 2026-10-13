import { model } from "@medusajs/framework/utils"

export const Book = model.define("book", {
  id: model.id().primaryKey(),
  title_arabic: model.text().nullable(),
  author: model.text().nullable(),
  translator: model.text().nullable(),
  commentator_tahqeeq: model.text().nullable(),
  publisher: model.text().nullable(),
  binding_type: model.text().nullable(),
  script_type: model.text().nullable(),
  language: model.text().nullable(),
  volume_count: model.number().nullable(),
  isbn_10: model.text().nullable(),
  isbn_13: model.text().nullable(),
  sample_pdf_url: model.text().nullable(),
})
