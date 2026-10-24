import { NextResponse } from "next/server"
import { DEFAULT_SETTINGS, withDefaults } from "@maktabah/db"
import { db } from "@/lib/db"

/**
 * GET /api/catalog/meta — everything the product editor needs besides the
 * product itself: stock locations, categories, other products (for bundles),
 * the catalogue settings, the merchandising tags and the parcel presets.
 */
const SHIPPING_SIZES = [
  { value: "small", label: "Small package (most books)", length: 21, width: 15, height: 3, weight: 450 },
  { value: "medium", label: "Medium package (large book or 2-3 books)", length: 25, width: 18, height: 6, weight: 1100 },
  { value: "large", label: "Large package (box set)", length: 32, width: 24, height: 12, weight: 3000 },
  { value: "xlarge", label: "Extra large (big multi-volume set)", length: 40, width: 30, height: 20, weight: 7000 },
  { value: "custom", label: "Custom size", length: 0, width: 0, height: 0, weight: 0 },
]

const TAGS = [
  { value: "bestseller", label: "Bestseller" },
  { value: "new-release", label: "New arrival" },
  { value: "coming-soon", label: "Pre-order" },
  { value: "staff-pick", label: "Booksellers' pick" },
]

export async function GET() {
  const database = await db()
  const [locations, categories, products, settings] = await database.batch<Record<string, string | null>>([
    database.prepare(`SELECT id, name FROM stock_location ORDER BY name`),
    database.prepare(`SELECT id, handle, name, parent_id FROM category WHERE is_active = 1 ORDER BY rank, name`),
    database.prepare(
      `SELECT id, title, thumbnail FROM product WHERE deleted_at IS NULL ORDER BY product_number DESC LIMIT 500`
    ),
    database.prepare(`SELECT value FROM store_setting WHERE key = 'catalog'`),
  ])

  let saved: unknown = null
  try {
    saved = settings.results[0]?.value ? JSON.parse(String(settings.results[0].value)) : null
  } catch {
    saved = null
  }

  return NextResponse.json({
    locations: locations.results,
    categories: categories.results,
    products: products.results,
    catalog: withDefaults("catalog", saved) ?? DEFAULT_SETTINGS.catalog,
    tags: TAGS,
    shipping_sizes: SHIPPING_SIZES,
    storefront_url: (process.env.STOREFRONT_URL || "").replace(/\/+$/, ""),
  })
}
