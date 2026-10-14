import type { BindingType, BookLanguage } from "@maktabah/shared"

/**
 * The books collection as this backend creates and indexes it. It lives here
 * rather than in @maktabah/shared because the backend is its only user: the
 * storefront searches through GET /store/books/search and never talks to
 * Typesense. Keeping it local also keeps the built server free of a runtime
 * import of a workspace package, which production Node cannot resolve.
 */

export interface TypesenseBookDocument {
  id: string
  title: string
  title_arabic?: string
  author?: string
  translator?: string
  publisher?: string
  categories: string[]
  isbn_13?: string
  language?: BookLanguage | string
  binding_type?: BindingType | string
  price_kes?: number
  price_usd?: number
  handle?: string
  thumbnail?: string
  status?: string
}

export const TYPESENSE_BOOKS_COLLECTION = "books" as const

export const TYPESENSE_BOOKS_SCHEMA = {
  name: TYPESENSE_BOOKS_COLLECTION,
  /**
   * Transliterated Arabic names are hyphenated ("an-Nawawi", "al-Bukhari"),
   * so hyphens split tokens; otherwise "nawawi" would not match.
   */
  token_separators: ["-"],
  fields: [
    { name: "title", type: "string" as const },
    { name: "title_arabic", type: "string" as const, optional: true },
    { name: "author", type: "string" as const, optional: true, facet: true },
    { name: "translator", type: "string" as const, optional: true },
    { name: "publisher", type: "string" as const, optional: true, facet: true },
    { name: "categories", type: "string[]" as const, facet: true },
    { name: "isbn_13", type: "string" as const, optional: true },
    { name: "language", type: "string" as const, optional: true, facet: true },
    {
      name: "binding_type",
      type: "string" as const,
      optional: true,
      facet: true,
    },
    { name: "price_kes", type: "float" as const, optional: true, facet: true },
    { name: "price_usd", type: "float" as const, optional: true, facet: true },
    { name: "handle", type: "string" as const, optional: true },
    { name: "thumbnail", type: "string" as const, optional: true },
    { name: "status", type: "string" as const, optional: true, facet: true },
  ],
}
