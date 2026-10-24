/** What a storefront listing needs for one book. */
export type BookSummary = {
  id: string
  handle: string
  title: string
  subtitle: string | null
  thumbnail: string | null
  author: string | null
  arabicTitle: string | null
  series: string | null
  /** Cheapest variant: what a card links to and adds to the cart. */
  variantId: string
  formatLabel: string
  manageInventory: boolean
  allowBackorder: boolean
  lowStockThreshold: number | null
  /** Plain-text opening of the description, for card blurbs. */
  blurb: string | null
  /** Price the shopper pays, in minor units of `currency`. */
  priceMinor: number
  /** Struck-through price when the book is on sale, else null. */
  compareAtMinor: number | null
  /** ISO date when the sale ends, if time-limited. */
  saleEndsAt: string | null
  currency: string
  inStock: boolean
  stock: number
  preorder: boolean
  tags: string[]
  categories: { handle: string; name: string }[]
}

/** Everything the product page shows. */
export type BookDetail = BookSummary & {
  descriptionHtml: string
  images: string[]
  pages: number | null
  series: string | null
  booksellerNote: string | null
  authorBio: string | null
  editorialReviews: { quote: string; source: string }[]
  unit: string
  optionTitle: string
  optionDisplay: "buttons" | "dropdown"
  book: {
    titleArabic: string | null
    author: string | null
    translator: string | null
    commentatorTahqeeq: string | null
    publisher: string | null
    bindingType: string | null
    scriptType: string | null
    language: string | null
    volumeCount: number | null
    isbn10: string | null
    isbn13: string | null
    samplePdfUrl: string | null
  }
  variants: {
    id: string
    title: string
    optionValue: string
    sku: string
    priceMinor: number
    compareAtMinor: number | null
    saleEndsAt: string | null
    stock: number
    manageInventory: boolean
    allowBackorder: boolean
    lowStockThreshold: number | null
    dimensions: { length: number; width: number; height: number; weight: number } | null
  }[]
}

export type Category = { id: string; handle: string; name: string; parentId: string | null }

export type Facet = { value: string; count: number }

export type BookFacets = {
  language: Facet[]
  binding: Facet[]
  publisher: Facet[]
  category: Facet[]
}

/** A filter accepts one value or several, which match as OR. */
export type Filter = string | string[] | undefined

export type ListBooksOptions = {
  currency?: string
  category?: Filter
  tag?: Filter
  /** Free text; runs through the FTS index. */
  q?: string
  sale?: boolean
  language?: Filter
  binding?: Filter
  publisher?: Filter
  sort?: "featured" | "price-asc" | "price-desc" | "newest"
  /** Minimum price in major units (inclusive). */
  priceMin?: number
  /** Maximum price in major units (inclusive). */
  priceMax?: number
  limit?: number
  offset?: number
}
