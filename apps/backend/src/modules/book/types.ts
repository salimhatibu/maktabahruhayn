export type BookAdditionalData = {
  title_arabic?: string | null
  author?: string | null
  translator?: string | null
  commentator_tahqeeq?: string | null
  publisher?: string | null
  binding_type?: string | null
  script_type?: string | null
  language?: string | null
  volume_count?: number | null
  isbn_10?: string | null
  isbn_13?: string | null
  sample_pdf_url?: string | null
}

export const BOOK_FIELD_KEYS = [
  "title_arabic",
  "author",
  "translator",
  "commentator_tahqeeq",
  "publisher",
  "binding_type",
  "script_type",
  "language",
  "volume_count",
  "isbn_10",
  "isbn_13",
  "sample_pdf_url",
] as const

export function pickBookFields(
  data?: BookAdditionalData | null
): BookAdditionalData {
  if (!data) {
    return {}
  }

  const result: BookAdditionalData = {}

  for (const key of BOOK_FIELD_KEYS) {
    if (key in data) {
      result[key] = data[key] as never
    }
  }

  return result
}

export function hasBookFields(data?: BookAdditionalData | null): boolean {
  if (!data) {
    return false
  }

  return BOOK_FIELD_KEYS.some((key) => key in data)
}
