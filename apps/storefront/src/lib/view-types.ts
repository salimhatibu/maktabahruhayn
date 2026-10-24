import type { BookMetadata } from "@maktabah/shared"

/**
 * The shapes the storefront renders.
 *
 * The view model the D1 layer maps onto. The database's own row types live
 * in @maktabah/db; these are what components receive.
 */

/** A region a shopper can be priced in, as the header's picker renders it. */
export type StoreRegion = {
  id: string
  name: string
  currency_code: string
  countries?: { iso_2: string }[]
}

export type Money = {
  amount: number
  original: number
  currency: string
  onSale: boolean
  saleEndsAt?: string | null
}

export type Availability =
  | { status: "in_stock" }
  | { status: "low_stock"; quantity: number }
  | { status: "backorder" }
  | { status: "preorder" }
  | { status: "out_of_stock" }

export type BookFormat = {
  variantId: string
  label: string
  price: Money | null
  availability: Availability
  dimensions: { width: number; length: number; height: number; weight: number } | null
}

export type EditorialReview = { quote: string; source: string }

export type BundleItem = { product_id: string; title: string; quantity: number }

export type BookView = {
  id: string
  handle: string
  title: string
  subtitle: string | null
  /** Plain text, for meta tags, JSON-LD and blurbs. */
  description: string | null
  /** Sanitised HTML for the Overview section. */
  descriptionHtml: string | null
  unit: string | null
  bundleItems: BundleItem[]
  optionDisplay: "buttons" | "dropdown"
  cover: string | null
  images: string[]
  author: string | null
  arabicTitle: string | null
  series: string | null
  releaseDate: string | null
  isPreorder: boolean
  booksellerNote: string | null
  authorBio: string | null
  editorialReviews: EditorialReview[]
  pages: number | null
  meta: BookMetadata | null
  categories: { id: string; name: string; handle: string }[]
  tags: string[]
  formats: BookFormat[]
}

/** The minimum a book card needs; search hits map onto this too. */
export type CardBook = {
  id: string | null
  handle: string
  title: string
  author: string | null
  arabicTitle: string | null
  series: string | null
  cover: string | null
  format: string | null
  price: Money | null
  variantId: string | null
  isPreorder: boolean
  availability: Availability | null
  rating?: { average: number; count: number } | null
  /** Plain-text opening of the description, shown under the title. */
  blurb?: string | null
}

export type BookSort = "featured" | "newest" | "title-asc" | "title-desc" | "price-asc" | "price-desc"

export type SearchSort = "relevance" | "price-asc" | "price-desc"

export type RatingSummary = {
  average: number
  count: number
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>
}

export type Review = {
  id: string
  display_name: string
  rating: number
  title: string | null
  content: string
  verified_purchase: boolean
  created_at: string
}
