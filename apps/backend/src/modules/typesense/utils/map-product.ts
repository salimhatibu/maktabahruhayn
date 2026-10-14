import type { TypesenseBookDocument } from "../collection"

export type LinkedBook = {
  id?: string | null
  title_arabic?: string | null
  author?: string | null
  translator?: string | null
  publisher?: string | null
  language?: string | null
  binding_type?: string | null
  isbn_13?: string | null
}

export type ProductWithBook = {
  id: string
  title?: string | null
  handle?: string | null
  thumbnail?: string | null
  status?: string | null
  categories?: ({ name?: string | null } | null)[] | null
  book?: LinkedBook | null
  variants?:
    | ({
        prices?:
          | ({
              amount?: number | null
              currency_code?: string | null
            } | null)[]
          | null
      } | null)[]
    | null
}

export const PRODUCT_TYPESENSE_FIELDS = [
  "id",
  "title",
  "handle",
  "thumbnail",
  "status",
  "categories.name",
  "book.*",
  "variants.prices.amount",
  "variants.prices.currency_code",
] as const

export function extractPrice(
  product: ProductWithBook,
  currencyCode: string
): number | undefined {
  for (const variant of product.variants || []) {
    for (const price of variant?.prices || []) {
      if (
        price?.currency_code?.toLowerCase() === currencyCode.toLowerCase() &&
        typeof price.amount === "number"
      ) {
        return price.amount
      }
    }
  }

  return undefined
}

export function toTypesenseDocument(
  product: ProductWithBook
): TypesenseBookDocument {
  const categories = (product.categories || [])
    .map((category) => category?.name?.trim())
    .filter((name): name is string => Boolean(name))

  const book = product.book

  return {
    id: product.id,
    title: product.title || "",
    title_arabic: book?.title_arabic || undefined,
    author: book?.author || undefined,
    translator: book?.translator || undefined,
    publisher: book?.publisher || undefined,
    categories,
    isbn_13: book?.isbn_13 || undefined,
    language: book?.language || undefined,
    binding_type: book?.binding_type || undefined,
    price_kes: extractPrice(product, "kes"),
    price_usd: extractPrice(product, "usd"),
    handle: product.handle || undefined,
    thumbnail: product.thumbnail || undefined,
    status: product.status || undefined,
  }
}
