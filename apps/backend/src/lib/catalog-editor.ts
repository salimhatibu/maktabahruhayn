import type { RemoteQueryFunction } from "@medusajs/framework/types"

type Query = Omit<RemoteQueryFunction, symbol>

/** Parcel presets the editor offers (cm / g), used for Shippo rating. */
export const SHIPPING_SIZES = {
  small: { label: "Small package (most books)", length: 21, width: 15, height: 3, weight: 450 },
  medium: { label: "Medium package (large book or 2-3 books)", length: 25, width: 18, height: 6, weight: 1100 },
  large: { label: "Large package (box set)", length: 32, width: 24, height: 12, weight: 3000 },
  xlarge: { label: "Extra large (big multi-volume set)", length: 40, width: 30, height: 20, weight: 7000 },
} as const

export type ShippingSize = keyof typeof SHIPPING_SIZES | "custom"

export type LocationStock = { location_id: string; quantity: number }

export type CatalogVariantInput = {
  id?: string
  option_value: string
  custom_sku?: string | null
  /** Price customers pay now, in KES. */
  selling_price: number
  /** Price before discount in KES; above selling_price puts the variant on sale. */
  original_price?: number | null
  cost?: number | null
  low_stock_threshold?: number | null
  stock: LocationStock[]
}

export type BookFields = {
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

export type CatalogProductInput = {
  id?: string
  title: string
  subtitle?: string | null
  handle?: string | null
  description_html?: string | null
  images: string[]
  thumbnail?: string | null
  category_ids: string[]
  primary_category_id?: string | null
  unit: string
  product_type: "standard" | "bundle"
  bundle_items?: { product_id: string; title: string; quantity: number }[]
  delivery_type: "physical" | "digital"
  track_inventory: boolean
  allow_backorder?: boolean
  shipping_size: ShippingSize
  custom_dimensions?: { length: number; width: number; height: number; weight: number } | null
  option_title: string
  /** How the storefront shows the variant choice. */
  option_display?: "buttons" | "dropdown"
  variants: CatalogVariantInput[]
  status: "draft" | "published"
  publish_at?: string | null
  pages?: number | null
  /** Merchandising tags (bestseller, new-release, coming-soon, staff-pick…). */
  tags?: string[]
  release_date?: string | null
  preorder?: boolean
  series?: string | null
  bookseller_note?: string | null
  author_bio?: string | null
  editorial_reviews?: { quote: string; source: string }[]
  book: BookFields
}

/** Tags the storefront builds shelves and menus from. */
export const MERCHANDISING_TAGS = [
  { value: "bestseller", label: "Bestseller" },
  { value: "new-release", label: "New arrival" },
  { value: "coming-soon", label: "Pre-order" },
  { value: "staff-pick", label: "Booksellers' pick" },
]

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

/** Short, readable code used as the system SKU (e.g. MR-7K2Q9D). */
export function systemSku(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  let n = h >>> 0
  for (let i = 0; i < 6; i++) {
    out += alphabet[n % alphabet.length]
    n = Math.floor(n / alphabet.length) || (h >>> (i + 1))
  }
  return `MR-${out}`
}

export const SALE_LIST_TITLE = "Sale Items"

/** Everything the editor shows for one product. */
export async function loadEditorProduct(query: Query, id: string) {
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "subtitle",
      "handle",
      "description",
      "status",
      "thumbnail",
      "metadata",
      "created_at",
      "images.url",
      "categories.id",
      "tags.value",
      "options.id",
      "options.title",
      "book.*",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.manage_inventory",
      "variants.allow_backorder",
      "variants.metadata",
      "variants.weight",
      "variants.length",
      "variants.width",
      "variants.height",
      "variants.options.value",
      "variants.price_set.id",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.prices.price_list_id",
      "variants.inventory_items.inventory_item_id",
      "variants.inventory_items.inventory.location_levels.location_id",
      "variants.inventory_items.inventory.location_levels.stocked_quantity",
    ],
    filters: { id },
  })
  const product = data[0] as Record<string, any> | undefined
  if (!product) {
    return null
  }

  const { data: lists } = await query.graph({ entity: "price_list", fields: ["id"], filters: { title: SALE_LIST_TITLE } })
  const saleList = lists[0] as { id: string } | undefined
  const meta = product.metadata || {}

  // variants.prices only carries base prices; sale prices live in the price list.
  const priceSetIds = (product.variants || []).map((v: Record<string, any>) => v.price_set?.id).filter(Boolean) as string[]
  const salePrices = new Map<string, number>()
  if (saleList && priceSetIds.length) {
    const { data: rows } = await query.graph({
      entity: "price",
      fields: ["price_set_id", "currency_code", "amount"],
      filters: { price_list_id: saleList.id, price_set_id: priceSetIds, currency_code: "kes" },
    })
    for (const r of rows as { price_set_id: string; amount: number }[]) {
      salePrices.set(r.price_set_id, Number(r.amount))
    }
  }

  const variants = (product.variants || []).map((v: Record<string, any>) => {
    const prices = (v.prices || []) as { amount: number; currency_code: string; price_list_id: string | null }[]
    const base = prices.find((p) => p.currency_code === "kes" && !p.price_list_id)
    const saleAmount = v.price_set?.id ? salePrices.get(v.price_set.id) : undefined
    const sale = saleAmount !== undefined ? { amount: saleAmount } : undefined
    const levels = (v.inventory_items?.[0]?.inventory?.location_levels || []) as { location_id: string; stocked_quantity: number }[]
    return {
      id: v.id as string,
      option_value: (v.options?.[0]?.value as string) || v.title,
      sku: v.sku as string | null,
      system_sku: (v.metadata?.system_sku as string) || systemSku(v.id),
      custom_sku: (v.metadata?.custom_sku as string) || null,
      selling_price: Number(sale?.amount ?? base?.amount ?? 0),
      original_price: sale ? Number(base?.amount ?? 0) : null,
      cost: (v.metadata?.cost as number) ?? null,
      low_stock_threshold: (v.metadata?.low_stock_threshold as number) ?? null,
      manage_inventory: Boolean(v.manage_inventory),
      allow_backorder: Boolean(v.allow_backorder),
      dimensions: { length: v.length, width: v.width, height: v.height, weight: v.weight },
      stock: levels.map((l) => ({ location_id: l.location_id, quantity: Number(l.stocked_quantity) })),
    }
  })

  const categoryIds = (product.categories || []).map((c: { id: string }) => c.id)
  const firstDims = variants[0]?.dimensions
  return {
    id: product.id as string,
    product_number: (meta.product_number as number) ?? null,
    title: product.title as string,
    subtitle: product.subtitle as string | null,
    handle: product.handle as string,
    description_html: (product.description as string) || "",
    status: product.status as "draft" | "published" | "proposed" | "rejected",
    publish_at: (meta.publish_at as string) || null,
    images: (product.images || []).map((i: { url: string }) => i.url),
    thumbnail: product.thumbnail as string | null,
    category_ids: categoryIds,
    primary_category_id: (meta.primary_category_id as string) || categoryIds[0] || null,
    unit: (meta.unit as string) || "item",
    product_type: (meta.product_type as "standard" | "bundle") || "standard",
    bundle_items: (meta.bundle_items as { product_id: string; title: string; quantity: number }[]) || [],
    delivery_type: (meta.delivery_type as "physical" | "digital") || "physical",
    track_inventory: variants.some((v: { manage_inventory: boolean }) => v.manage_inventory),
    allow_backorder: variants.some((v: { allow_backorder: boolean }) => v.allow_backorder),
    shipping_size: ((meta.shipping_size as ShippingSize) || "custom") as ShippingSize,
    custom_dimensions: firstDims?.length
      ? {
          length: Number(firstDims.length),
          width: Number(firstDims.width),
          height: Number(firstDims.height),
          weight: Number(firstDims.weight),
        }
      : null,
    option_title: (product.options?.[0]?.title as string) || "Format",
    option_display: ((meta.option_display as string) === "dropdown" ? "dropdown" : "buttons") as "buttons" | "dropdown",
    pages: (meta.pages as number) ?? null,
    tags: (product.tags || []).map((t: { value: string }) => t.value) as string[],
    release_date: (meta.release_date as string) || null,
    preorder: meta.preorder === true,
    series: (meta.series as string) || null,
    bookseller_note: (meta.bookseller_note as string) || null,
    author_bio: (meta.author_bio as string) || null,
    editorial_reviews: (Array.isArray(meta.editorial_reviews) ? meta.editorial_reviews : []) as { quote: string; source: string }[],
    book: (product.book || {}) as BookFields,
    variants,
  }
}
