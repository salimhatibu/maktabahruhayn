import { cookies } from "next/headers"
import type { BookMetadata } from "@maktabah/shared"
import { SUBJECTS, TAGS, type TagKey } from "./catalog"
import { backendUrl, mediaUrl, publishableKey, REGION_COOKIE } from "./config"
import { parseRegionCookie, type RegionPreference } from "./region"
import { descriptionHtml, plainText } from "./rich-text"

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

export class MedusaRequestError extends Error {
  constructor(
    public status: number,
    public path: string,
    public body: string
  ) {
    super(`Medusa ${status} ${path}${body ? `: ${body.slice(0, 200)}` : ""}`)
  }

  /** The `message` field of a Medusa error body, when present. */
  get publicMessage(): string | null {
    try {
      return (JSON.parse(this.body) as { message?: string }).message || null
    } catch {
      return null
    }
  }
}

export async function medusaFetch<T>(
  path: string,
  init?: RequestInit & { revalidate?: number | false; token?: string | null }
): Promise<T> {
  const { revalidate = 60, token, ...rest } = init || {}
  const headers = new Headers(rest.headers)
  headers.set("Content-Type", "application/json")
  if (publishableKey) {
    headers.set("x-publishable-api-key", publishableKey)
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(`${backendUrl}${path}`, {
    ...rest,
    headers,
    ...(revalidate === false || token ? { cache: "no-store" as const } : { next: { revalidate } }),
  })

  if (!response.ok) {
    throw new MedusaRequestError(response.status, path, await response.text().catch(() => ""))
  }

  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

/* ------------------------------------------------------------------ */
/* Regions                                                             */
/* ------------------------------------------------------------------ */

export type StoreRegion = {
  id: string
  name: string
  currency_code: string
  countries?: { iso_2: string }[]
}

export async function listRegions(): Promise<StoreRegion[]> {
  try {
    const data = await medusaFetch<{ regions: StoreRegion[] }>(
      "/store/regions?fields=id,name,currency_code,*countries&limit=100",
      { revalidate: 300 }
    )
    return data.regions || []
  } catch (error) {
    console.error(error)
    return []
  }
}

export type RegionContext = RegionPreference & {
  regionId: string | null
  regionName: string
  currency: string
  /** Whether the visitor's country has its own region (else USD fallback). */
  served: boolean
  /** M-Pesa is offered in Kenya only. */
  mpesa: boolean
}

export async function readRegionPreference(): Promise<RegionPreference> {
  const jar = await cookies()
  return parseRegionCookie(jar.get(REGION_COOKIE)?.value)
}

/**
 * Resolves the visitor's country to the Medusa region whose currency they are
 * priced and charged in. Countries without a region fall back to USD.
 */
export async function getRegionContext(): Promise<RegionContext> {
  const preference = await readRegionPreference()
  const regions = await listRegions()
  const country = preference.country.toLowerCase()
  const own = regions.find((r) => r.countries?.some((c) => c.iso_2 === country))
  const match = own || regions.find((r) => r.currency_code === "usd") || regions[0]
  const currency = match?.currency_code || "usd"

  return {
    ...preference,
    regionId: match?.id || null,
    regionName: match?.name || "International",
    currency,
    served: Boolean(own),
    mpesa: currency === "kes",
  }
}

/* ------------------------------------------------------------------ */
/* Books                                                               */
/* ------------------------------------------------------------------ */

type RawPrice = {
  calculated_amount?: number | null
  original_amount?: number | null
  currency_code?: string | null
} | null

type RawProduct = {
  id: string
  title: string
  subtitle?: string | null
  handle: string
  description?: string | null
  thumbnail?: string | null
  metadata?: Record<string, unknown> | null
  images?: { url: string }[] | null
  categories?: { id: string; name: string; handle: string }[] | null
  tags?: { id: string; value: string }[] | null
  book?: BookMetadata | null
  variants?: {
    id: string
    title?: string | null
    sku?: string | null
    options?: { value: string }[] | null
    calculated_price?: RawPrice
    inventory_quantity?: number | null
    manage_inventory?: boolean | null
    allow_backorder?: boolean | null
    weight?: number | null
    length?: number | null
    width?: number | null
    height?: number | null
  }[] | null
}

export type Money = {
  amount: number
  original: number
  currency: string
  onSale: boolean
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
}

const PRODUCT_FIELDS = [
  "id",
  "title",
  "subtitle",
  "handle",
  "description",
  "thumbnail",
  "metadata",
  "*images",
  "*categories",
  "*tags",
  "*variants",
  "*variants.options",
  "*variants.calculated_price",
  "+variants.inventory_quantity",
  "+book.*",
].join(",")

const LOW_STOCK = 5

function toMoney(price: RawPrice): Money | null {
  if (!price || typeof price.calculated_amount !== "number") {
    return null
  }
  const original =
    typeof price.original_amount === "number" ? price.original_amount : price.calculated_amount
  return {
    amount: price.calculated_amount,
    original,
    currency: price.currency_code || "usd",
    onSale: original > price.calculated_amount,
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function isFutureDate(iso: string | null) {
  if (!iso) {
    return false
  }
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now()
}

function availabilityOf(
  variant: NonNullable<RawProduct["variants"]>[number],
  preorder: boolean
): Availability {
  if (preorder) {
    return { status: "preorder" }
  }
  if (variant.manage_inventory === false) {
    return { status: "in_stock" }
  }
  const qty = Number(variant.inventory_quantity ?? 0)
  if (qty > LOW_STOCK) {
    return { status: "in_stock" }
  }
  if (qty > 0) {
    return { status: "low_stock", quantity: qty }
  }
  return variant.allow_backorder ? { status: "backorder" } : { status: "out_of_stock" }
}

export function toBookView(product: RawProduct): BookView {
  const metadata = product.metadata || {}
  const releaseDate = text(metadata.release_date)
  const preorder = metadata.preorder === true || isFutureDate(releaseDate)
  const images = (product.images || []).map((i) => mediaUrl(i.url)).filter((u): u is string => Boolean(u))
  const pages = Number(metadata.pages)
  const editorial = Array.isArray(metadata.editorial_reviews)
    ? (metadata.editorial_reviews as EditorialReview[]).filter((r) => r?.quote)
    : []

  const rawDescription = text(product.description)
  const primaryCategory = text(metadata.primary_category_id)
  const bundleItems = Array.isArray(metadata.bundle_items)
    ? (metadata.bundle_items as BundleItem[]).filter((i) => i && typeof i.title === "string")
    : []

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    subtitle: text(product.subtitle),
    description: rawDescription ? text(plainText(rawDescription)) : null,
    descriptionHtml: rawDescription ? descriptionHtml(rawDescription) : null,
    unit: text(metadata.unit),
    bundleItems: metadata.product_type === "bundle" ? bundleItems : [],
    optionDisplay: metadata.option_display === "dropdown" ? "dropdown" : "buttons",
    cover: mediaUrl(product.thumbnail) || images[0] || null,
    images,
    author: text(product.book?.author),
    arabicTitle: text(product.book?.title_arabic),
    series: text(metadata.series),
    releaseDate,
    isPreorder: preorder,
    booksellerNote: text(metadata.bookseller_note),
    authorBio: text(metadata.author_bio),
    editorialReviews: editorial,
    pages: Number.isFinite(pages) && pages > 0 ? pages : null,
    meta: product.book || null,
    categories: [...(product.categories || [])].sort(
      (a, b) => Number(b.id === primaryCategory) - Number(a.id === primaryCategory)
    ),
    tags: (product.tags || []).map((t) => t.value),
    formats: (product.variants || []).map((variant) => ({
      variantId: variant.id,
      label: variant.options?.[0]?.value || variant.title || "Edition",
      price: toMoney(variant.calculated_price || null),
      availability: availabilityOf(variant, preorder),
      dimensions:
        variant.width && variant.length
          ? {
              width: variant.width,
              length: variant.length,
              height: variant.height || 0,
              weight: variant.weight || 0,
            }
          : null,
    })),
  }
}

export function toCardBook(book: BookView, format?: BookFormat): CardBook {
  const chosen = format || book.formats[0]
  return {
    id: book.id,
    handle: book.handle,
    title: book.title,
    author: book.author,
    arabicTitle: book.arabicTitle,
    series: book.series,
    cover: book.cover,
    format: chosen?.label || null,
    price: chosen?.price || null,
    variantId: chosen?.variantId || null,
    isPreorder: book.isPreorder,
    availability: chosen?.availability || null,
  }
}

async function lookupIds(
  path: "/store/product-categories" | "/store/product-tags",
  key: "handle" | "value",
  values: string[]
): Promise<Map<string, string>> {
  if (!values.length) {
    return new Map()
  }
  const params = new URLSearchParams({ fields: `id,${key}`, limit: "100" })
  values.forEach((v) => params.append(`${key}[]`, v))
  const listKey = path === "/store/product-categories" ? "product_categories" : "product_tags"
  try {
    const data = await medusaFetch<Record<string, { id: string; handle?: string; value?: string }[]>>(
      `${path}?${params}`,
      { revalidate: 3600 }
    )
    return new Map((data[listKey] || []).map((row) => [String(row[key]), row.id]))
  } catch (error) {
    console.error(error)
    return new Map()
  }
}

export type BookSort = "featured" | "newest" | "title-asc" | "title-desc" | "price-asc" | "price-desc"

const SORT_ORDER: Record<BookSort, string | null> = {
  featured: null,
  newest: "-created_at",
  "title-asc": "title",
  "title-desc": "-title",
  // Medusa cannot order by calculated price; these sort in memory.
  "price-asc": null,
  "price-desc": null,
}

export type ListBooksOptions = {
  limit?: number
  offset?: number
  category?: string
  tag?: TagKey
  sort?: BookSort
  excludeId?: string
  /** Only books with a sale price in the visitor's region. */
  onSale?: boolean
}

/** The whole catalog is small enough to sort and filter by price in memory. */
const FULL_SCAN_LIMIT = 200

/**
 * Lists books in the visitor's region. Without a category the query is
 * limited to the book departments, so non-book products never appear.
 */
export async function listBooks(
  options: ListBooksOptions = {}
): Promise<{ books: BookView[]; count: number }> {
  const { limit = 12, offset = 0, category, tag, sort = "featured", excludeId, onSale } = options
  const region = await getRegionContext()
  const inMemory = Boolean(onSale) || sort === "price-asc" || sort === "price-desc"

  const handles = category ? [category] : SUBJECTS.map((s) => s.handle)
  const [categoryIds, tagIds] = await Promise.all([
    lookupIds("/store/product-categories", "handle", handles),
    lookupIds("/store/product-tags", "value", tag ? [TAGS[tag].value] : []),
  ])

  if (!categoryIds.size || (tag && !tagIds.size)) {
    return { books: [], count: 0 }
  }

  const params = new URLSearchParams({
    fields: PRODUCT_FIELDS,
    limit: String(inMemory ? FULL_SCAN_LIMIT : excludeId ? limit + 1 : limit),
    offset: String(inMemory ? 0 : offset),
  })
  categoryIds.forEach((id) => params.append("category_id[]", id))
  tagIds.forEach((id) => params.append("tag_id[]", id))
  if (region.regionId) {
    params.set("region_id", region.regionId)
  }
  const order = SORT_ORDER[sort]
  if (order) {
    params.set("order", order)
  }

  try {
    const data = await medusaFetch<{ products: RawProduct[]; count: number }>(
      `/store/products?${params}`
    )
    let books = (data.products || []).filter((p) => p.id !== excludeId).map(toBookView)

    if (!inMemory) {
      return { books: books.slice(0, limit), count: data.count || 0 }
    }

    if (onSale) {
      books = books.filter((b) => b.formats.some((f) => f.price?.onSale))
    }
    if (sort === "price-asc" || sort === "price-desc") {
      const dir = sort === "price-asc" ? 1 : -1
      const priceOf = (b: BookView) => b.formats[0]?.price?.amount ?? Number.POSITIVE_INFINITY
      books.sort((a, b) => (priceOf(a) - priceOf(b)) * dir)
    }
    return { books: books.slice(offset, offset + limit), count: books.length }
  } catch (error) {
    console.error(error)
    return { books: [], count: 0 }
  }
}

export async function getBookByHandle(handle: string): Promise<BookView | null> {
  const region = await getRegionContext()
  const params = new URLSearchParams({ handle, fields: PRODUCT_FIELDS })
  if (region.regionId) {
    params.set("region_id", region.regionId)
  }

  try {
    const data = await medusaFetch<{ products: RawProduct[] }>(`/store/products?${params}`, {
      revalidate: 30,
    })
    const product = data.products?.[0]
    return product ? toBookView(product) : null
  } catch (error) {
    console.error(error)
    return null
  }
}

/** Loads live, region-priced books for the given product ids. */
export async function getBooksByIds(ids: string[]): Promise<Map<string, BookView>> {
  if (!ids.length) {
    return new Map()
  }
  const region = await getRegionContext()
  const params = new URLSearchParams({ fields: PRODUCT_FIELDS, limit: String(ids.length) })
  ids.forEach((id) => params.append("id[]", id))
  if (region.regionId) {
    params.set("region_id", region.regionId)
  }
  try {
    const data = await medusaFetch<{ products: RawProduct[] }>(`/store/products?${params}`, {
      revalidate: 30,
    })
    return new Map((data.products || []).map((p) => [p.id, toBookView(p)]))
  } catch (error) {
    console.error(error)
    return new Map()
  }
}

/** Other books by the same author, via the search index. */
export async function listBooksByAuthor(author: string, excludeId: string): Promise<BookView[]> {
  const result = await searchBooks(author)
  const ids = result.hits
    .filter((h) => h.id !== excludeId && h.author?.toLowerCase() === author.toLowerCase())
    .map((h) => h.id)
  const live = await getBooksByIds(ids)
  return ids.map((id) => live.get(id)).filter((b): b is BookView => Boolean(b))
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

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

export async function getRatingSummaries(productIds: string[]): Promise<Record<string, RatingSummary>> {
  if (!productIds.length) {
    return {}
  }
  const params = new URLSearchParams()
  productIds.forEach((id) => params.append("product_id[]", id))
  try {
    const data = await medusaFetch<{ summaries: Record<string, RatingSummary> }>(
      `/store/reviews/summary?${params}`,
      { revalidate: 60 }
    )
    return data.summaries || {}
  } catch {
    return {}
  }
}

/** Attaches rating summaries to cards (one request for the whole list). */
export async function withRatings(cards: CardBook[]): Promise<CardBook[]> {
  const ids = cards.map((c) => c.id).filter((id): id is string => Boolean(id))
  const summaries = await getRatingSummaries(ids)
  return cards.map((card) => {
    const s = card.id ? summaries[card.id] : undefined
    return { ...card, rating: s && s.count ? { average: s.average, count: s.count } : null }
  })
}

export async function listReviews(productId: string, limit = 10, offset = 0) {
  try {
    return await medusaFetch<{ reviews: Review[]; count: number; summary: RatingSummary }>(
      `/store/products/${productId}/reviews?limit=${limit}&offset=${offset}`,
      { revalidate: false }
    )
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

export type SearchHit = {
  id: string
  title: string
  title_arabic?: string
  author?: string
  translator?: string
  publisher?: string
  handle?: string
  thumbnail?: string
  language?: string
  binding_type?: string
  categories?: string[]
  price_usd?: number
  price_kes?: number
}

export type SearchFacet = {
  field_name: string
  counts: { value: string; count: number }[]
}

export const SEARCH_FACETS = ["categories", "language", "binding_type", "publisher"] as const
export type SearchFacetName = (typeof SEARCH_FACETS)[number]
export type SearchSort = "relevance" | "price-asc" | "price-desc"

export async function searchBooks(
  q: string,
  filters: Partial<Record<SearchFacetName, string[]>> = {},
  sort: SearchSort = "relevance",
  limit = 48
): Promise<{ hits: SearchHit[]; found: number; facets: SearchFacet[] }> {
  const params = new URLSearchParams({ q, limit: String(limit), sort })
  for (const facet of SEARCH_FACETS) {
    for (const value of filters[facet] || []) {
      params.append(facet, value)
    }
  }
  try {
    return await medusaFetch(`/store/books/search?${params}`, { revalidate: 30 })
  } catch (error) {
    console.error(error)
    return { hits: [], found: 0, facets: [] }
  }
}

export function hitToCardBook(hit: SearchHit): CardBook {
  return {
    id: hit.id,
    handle: hit.handle || "",
    title: hit.title,
    author: hit.author || null,
    arabicTitle: hit.title_arabic || null,
    series: null,
    cover: mediaUrl(hit.thumbnail),
    format: null,
    // Index prices are USD/KES only; live prices come from hydration.
    price: null,
    variantId: null,
    isPreorder: false,
    availability: null,
  }
}

/* ------------------------------------------------------------------ */
/* Shipping                                                            */
/* ------------------------------------------------------------------ */

export async function getFreeShippingThreshold(currency: string): Promise<number | null> {
  try {
    const data = await medusaFetch<{ thresholds: Record<string, number> }>(
      `/store/shipping/free-threshold?currency=${encodeURIComponent(currency.toLowerCase())}`,
      { revalidate: 3600 }
    )
    const value = data.thresholds?.[currency.toLowerCase()]
    return typeof value === "number" && value > 0 ? value : null
  } catch {
    return null
  }
}

export type ShippingCountry = { code: string; name: string; currency: string }

/** Every country we ship to, with the currency its region charges in. */
export async function listShippingCountries(): Promise<ShippingCountry[]> {
  const regions = await listRegions()
  const names = new Intl.DisplayNames(["en"], { type: "region" })
  return regions
    .flatMap((r) =>
      (r.countries || []).map((c) => ({
        code: c.iso_2.toLowerCase(),
        name: names.of(c.iso_2.toUpperCase()) || c.iso_2.toUpperCase(),
        currency: r.currency_code,
      }))
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}
