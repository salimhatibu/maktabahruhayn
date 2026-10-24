import {
  getBook as dbGetBook,
  getRatingSummaries as dbGetRatingSummaries,
  getSettings as dbGetSettings,
  listReviews as dbListReviews,
  getFacets as dbGetFacets,
  listBooks as dbListBooks,
  listCategories as dbListCategories,
  toMajor,
  type BookDetail,
  type BookSummary,
} from "@maktabah/db"
import type { BookMetadata } from "@maktabah/shared"
import { convertFromBase, refreshRatesIfStale } from "./pricing"
import { descriptionHtml, plainText } from "./rich-text"
import { db } from "./db"
import { currentRegion } from "./region-context"
import type {
  Availability,
  Review,
  RatingSummary,
  BookFormat,
  BookSort,
  BookView,
  CardBook,
  Money,
} from "./view-types"

/**
 * The catalogue, read straight from D1.
 *
 * Maps the database's rows onto the `BookView` and `CardBook` shapes the
 * pages render. Prices arrive in minor units and are converted here, because
 * the view model carries major units.
 */

const LOW_STOCK = 5

function money(priceMinor: number, compareAtMinor: number | null, currency: string, saleEndsAt?: string | null): Money | null {
  if (!priceMinor) {
    return null
  }
  const amount = toMajor(priceMinor)
  const original = compareAtMinor ? toMajor(compareAtMinor) : amount
  return { amount, original, currency, onSale: original > amount, saleEndsAt: original > amount ? saleEndsAt : null }
}

function availability(
  stock: number,
  options: { manageInventory: boolean; allowBackorder: boolean; preorder: boolean; lowStockThreshold?: number | null }
): Availability {
  if (options.preorder) {
    return { status: "preorder" }
  }
  if (!options.manageInventory) {
    return { status: "in_stock" }
  }
  const low = options.lowStockThreshold ?? LOW_STOCK
  if (stock > low) {
    return { status: "in_stock" }
  }
  if (stock > 0) {
    return { status: "low_stock", quantity: stock }
  }
  return options.allowBackorder ? { status: "backorder" } : { status: "out_of_stock" }
}

function toMeta(book: BookDetail["book"]): BookMetadata {
  return {
    title_arabic: book.titleArabic,
    author: book.author,
    translator: book.translator,
    commentator_tahqeeq: book.commentatorTahqeeq,
    publisher: book.publisher,
    binding_type: book.bindingType as BookMetadata["binding_type"],
    script_type: book.scriptType as BookMetadata["script_type"],
    language: book.language as BookMetadata["language"],
    volume_count: book.volumeCount,
    isbn_10: book.isbn10,
    isbn_13: book.isbn13,
    sample_pdf_url: book.samplePdfUrl,
  }
}

/** A listing row carries one variant, which is enough for a card. */
export function summaryToCard(book: BookSummary): CardBook {
  return {
    id: book.id,
    handle: book.handle,
    title: book.title,
    author: book.author,
    arabicTitle: book.arabicTitle,
    series: book.series,
    cover: book.thumbnail,
    format: book.formatLabel || null,
    price: money(book.priceMinor, book.compareAtMinor, book.currency, book.saleEndsAt),
    variantId: book.variantId || null,
    isPreorder: book.preorder,
    availability: availability(book.stock, {
      manageInventory: book.manageInventory,
      allowBackorder: book.allowBackorder,
      preorder: book.preorder,
      lowStockThreshold: book.lowStockThreshold,
    }),
  }
}

function detailToView(book: BookDetail): BookView {
  const formats: BookFormat[] = book.variants.map((variant) => ({
    variantId: variant.id,
    label: variant.optionValue || variant.title,
    price: money(variant.priceMinor, variant.compareAtMinor, book.currency, variant.saleEndsAt),
    availability: availability(variant.stock, {
      manageInventory: variant.manageInventory,
      allowBackorder: variant.allowBackorder,
      preorder: book.preorder,
      lowStockThreshold: variant.lowStockThreshold,
    }),
    dimensions: variant.dimensions,
  }))

  return {
    id: book.id,
    handle: book.handle,
    title: book.title,
    subtitle: book.subtitle,
    description: book.descriptionHtml ? plainText(book.descriptionHtml).replace(/\s+/g, " ") || null : null,
    // Rendered with dangerouslySetInnerHTML, so it only ever leaves here sanitised.
    descriptionHtml: book.descriptionHtml ? descriptionHtml(book.descriptionHtml) || null : null,
    unit: book.unit,
    bundleItems: [],
    optionDisplay: book.optionDisplay,
    cover: book.thumbnail || book.images[0] || null,
    images: book.images,
    author: book.book.author,
    arabicTitle: book.book.titleArabic,
    series: book.series,
    releaseDate: null,
    isPreorder: book.preorder,
    booksellerNote: book.booksellerNote,
    authorBio: book.authorBio,
    editorialReviews: book.editorialReviews,
    pages: book.pages,
    meta: toMeta(book.book),
    categories: book.categories.map((c) => ({ id: c.handle, handle: c.handle, name: c.name })),
    tags: book.tags,
    formats,
  }
}

export type ListOptions = {
  limit?: number
  offset?: number
  category?: string | string[]
  tag?: string | string[]
  sort?: BookSort
  excludeId?: string
  onSale?: boolean
  q?: string
  language?: string | string[]
  binding?: string | string[]
  publisher?: string | string[]
  priceMin?: number
  priceMax?: number
}

/** Books for a listing, priced in the visitor's region. */
export async function listCatalogue(options: ListOptions = {}): Promise<{ books: CardBook[]; count: number }> {
  const [database, region] = await Promise.all([db(), currentRegion()])
  await refreshRatesIfStale(database)
  const sort =
    options.sort === "price-asc" || options.sort === "price-desc"
      ? options.sort
      : options.sort === "newest"
        ? "newest"
        : "featured"

  const { books, count } = await dbListBooks(database, {
    currency: region.currency,
    category: options.category,
    tag: options.tag,
    q: options.q,
    sale: options.onSale,
    language: options.language,
    binding: options.binding,
    publisher: options.publisher,
    priceMin: options.priceMin,
    priceMax: options.priceMax,
    sort,
    // One extra row covers the excluded book without a second query.
    limit: (options.limit ?? 12) + (options.excludeId ? 1 : 0),
    offset: options.offset,
  })

  const filtered = options.excludeId ? books.filter((b) => b.id !== options.excludeId) : books
  const cards = filtered.slice(0, options.limit ?? 12).map(summaryToCard)

  // Title sorts are not worth a dedicated index on a catalogue this size.
  if (options.sort === "title-asc" || options.sort === "title-desc") {
    cards.sort((a, b) => a.title.localeCompare(b.title) * (options.sort === "title-desc" ? -1 : 1))
  }
  return { books: cards, count: options.excludeId ? Math.max(count - 1, cards.length) : count }
}

export async function getCatalogueBook(handle: string): Promise<BookView | null> {
  const [database, region] = await Promise.all([db(), currentRegion()])
  await refreshRatesIfStale(database)
  const book = await dbGetBook(database, handle, region.currency)
  return book ? detailToView(book) : null
}

export async function listCatalogueCategories() {
  return dbListCategories(await db())
}

export async function getCatalogueFacets(options: ListOptions = {}) {
  return dbGetFacets(await db(), {
    category: options.category,
    tag: options.tag,
    q: options.q,
    sale: options.onSale,
    language: options.language,
    binding: options.binding,
    publisher: options.publisher,
  })
}

/** Attaches approved-review averages to a page of cards. */
export async function withCatalogueRatings(cards: CardBook[]): Promise<CardBook[]> {
  const ids = cards.map((c) => c.id).filter((id): id is string => Boolean(id))
  if (!ids.length) {
    return cards
  }
  const summaries = await dbGetRatingSummaries(await db(), ids)
  return cards.map((card) => ({ ...card, rating: (card.id && summaries[card.id]) || null }))
}

/** Other books by the same author, for the product page. */
export async function listCatalogueByAuthor(author: string, excludeId: string): Promise<CardBook[]> {
  const [database, region] = await Promise.all([db(), currentRegion()])
  const { books } = await dbListBooks(database, { currency: region.currency, q: author, limit: 13 })
  return books.filter((b) => b.id !== excludeId).slice(0, 12).map(summaryToCard)
}

/** Approved reviews for a book, in the shape the product page renders. */
export async function listCatalogueReviews(
  productId: string,
  limit = 10,
  offset = 0
): Promise<{ reviews: Review[]; summary: RatingSummary }> {
  const { reviews, summary } = await dbListReviews(await db(), productId, limit, offset)
  return {
    summary,
    reviews: reviews.map((r) => ({
      id: r.id,
      display_name: r.authorName || "Verified reader",
      rating: r.rating,
      title: r.title,
      content: r.body || "",
      verified_purchase: r.verifiedPurchase,
      created_at: r.createdAt,
    })),
  }
}

/**
 * Free-shipping threshold in the visitor's currency, from the admin's Shipping
 * settings. USD and KES are set there directly; other currencies are converted
 * from the USD figure.
 */
export async function getFreeShipping(currency: string): Promise<number | null> {
  const database = await db()
  const settings = await dbGetSettings<{
    shipping?: { freeThresholdUsd?: number; freeThresholdKes?: number }
  }>(database)
  const code = currency.toLowerCase()
  const usd = Number(settings.shipping?.freeThresholdUsd ?? 0)
  const kes = Number(settings.shipping?.freeThresholdKes ?? 0)
  if (code === "usd") {
    return usd > 0 ? usd : null
  }
  if (code === "kes") {
    return kes > 0 ? kes : null
  }
  return usd > 0 ? await convertFromBase(usd, code) : null
}

export const SEARCH_FACET_NAMES = ["categories", "language", "binding_type", "publisher"] as const
export type SearchFacetKey = (typeof SEARCH_FACET_NAMES)[number]
export type SearchFacet = { field_name: SearchFacetKey; counts: { value: string; count: number }[] }

/**
 * Search results with the facet counts for the sidebar, in the shape the
 * search page already renders. Relevance ordering comes from the FTS index;
 * the price sorts are the catalogue's own.
 */
export async function searchCatalogue(
  q: string,
  selected: Record<SearchFacetKey, string[]>,
  sort: "relevance" | "price-asc" | "price-desc" = "relevance",
  limit = 48
): Promise<{ cards: CardBook[]; count: number; facets: SearchFacet[] }> {
  const options: ListOptions = {
    q: q && q !== "*" ? q : undefined,
    category: selected.categories,
    language: selected.language,
    binding: selected.binding_type,
    publisher: selected.publisher,
    sort: sort === "relevance" ? "featured" : sort,
    limit,
  }
  const [{ books, count }, facets] = await Promise.all([listCatalogue(options), getCatalogueFacets(options)])
  return {
    cards: await withCatalogueRatings(books),
    count,
    facets: [
      { field_name: "categories", counts: facets.category },
      { field_name: "language", counts: facets.language },
      { field_name: "binding_type", counts: facets.binding },
      { field_name: "publisher", counts: facets.publisher },
    ],
  }
}
