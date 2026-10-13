/**
 * Seeds the catalog from seed-data/catalog/books.json: real titles with the
 * publisher's details (authors, translators, ISBNs, pages, sizes, weights),
 * cover images, stock levels, a sale price list, subject categories and
 * merchandising tags. Non-USD prices are derived afterwards by the
 * sync-converted-prices workflow.
 *
 *   pnpm seed:catalog
 *
 * Re-running skips books whose handle already exists.
 */
import fs from "node:fs"
import path from "node:path"
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  PriceListStatus,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  batchPriceListPricesWorkflow,
  createInventoryLevelsWorkflow,
  createPriceListsWorkflow,
  createProductCategoriesWorkflow,
  createProductTagsWorkflow,
  createProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"
import type { BookAdditionalData } from "../modules/book/types"
import { syncConvertedPricesWorkflow } from "../workflows/sync-converted-prices"

type CatalogBook = {
  handle: string
  title: string
  subtitle: string | null
  description: string
  category: string
  tags: string[]
  format: string
  book: BookAdditionalData
  pages: number | null
  dimensions_cm: number[] | null
  weight_g: number | null
  series: string | null
  price_usd: number
  sale_price_usd: number | null
  stock: number
  allow_backorder: boolean
  preorder: boolean
  images: string[]
  source_url: string
  editorial_reviews?: { quote: string; source: string }[]
  bookseller_note?: string
}

export const CATEGORIES = [
  { handle: "quran-mushaf", name: "Qur'an & Mushaf", arabic: "القرآن الكريم" },
  { handle: "tafsir", name: "Tafsir", arabic: "التفسير" },
  { handle: "hadith", name: "Hadith", arabic: "الحديث" },
  { handle: "fiqh-aqidah", name: "Fiqh & Aqidah", arabic: "الفقه والعقيدة" },
  { handle: "seerah-history", name: "Seerah & History", arabic: "السيرة والتاريخ" },
  { handle: "islamic-living", name: "Islamic Living", arabic: "الأذكار والآداب" },
  { handle: "islamic-education", name: "Islamic Education & Arabic", arabic: "التعليم واللغة العربية" },
  { handle: "childrens-books", name: "Children's Books", arabic: "كتب الأطفال" },
  { handle: "gifts", name: "Gifts & Calendars", arabic: "الهدايا" },
]

const TAGS = ["bestseller", "new-release", "coming-soon", "staff-pick"]

/** Store-written notes and published review quotes, keyed by handle. */
const EDITORIAL: Record<string, Pick<CatalogBook, "bookseller_note" | "editorial_reviews">> = {
  "noble-quran-bewley": {
    bookseller_note:
      "A fluent, readable English rendering that many readers keep beside a Mushaf for daily study.",
    editorial_reviews: [
      {
        quote:
          "This new translation of the Qur'an immediately outdated all the others in the English-speaking world.",
        source: "Dr. Y. Dutton, Edinburgh University, Journal of Qur'anic Studies (2000)",
      },
    ],
  },
  "tafsir-ibn-kathir-10-volume-set": {
    bookseller_note: "The tafsir set we recommend most to English readers who want a narration-based commentary.",
  },
  "riyad-us-saliheen-2-volume-set": {
    bookseller_note: "Short chapters make this ideal for a family reading circle after Maghrib.",
  },
  "the-sealed-nectar": {
    bookseller_note:
      "Winner of the Muslim World League's seerah prize and the first biography of the Prophet we hand to new readers.",
  },
  "fortress-of-the-muslim-pocket": {
    bookseller_note: "Small enough for a jacket pocket. A favourite gift for new Muslims.",
  },
  "my-first-prayer-book": {
    bookseller_note: "QR codes link to video guidance, so children can follow along with each step of wudu and salah.",
  },
}

const MIME: Record<string, string> = { ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png" }

/**
 * Shipping dimensions for the variant (cm / g). Thickness and missing weights
 * are estimates from page count and trim size (80 gsm paper, ~0.0055 cm per
 * page, 0.3 cm board per hardcover volume); published weights win.
 */
function shippingSpecs(b: CatalogBook) {
  const [w, l, h] = b.dimensions_cm || [15, 21]
  const width = Math.min(w, l)
  const length = Math.max(w, l)
  const vols = b.book.volume_count || 1
  const hard = b.book.binding_type !== "softcover"
  const thickness =
    h ?? Math.max(0.5, (b.pages || 120) * 0.0055 + (hard ? 0.3 * vols : 0.05 * vols))
  const area = (width * length) / 10000
  const estimated = b.pages
    ? (b.pages / 2) * area * 80 + (hard ? 90 : 25) * vols
    : 250 * vols
  return {
    width,
    length,
    height: Math.round(thickness * 10) / 10,
    weight: Math.round(b.weight_g || estimated),
  }
}

export default async function seedCatalog({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment = container.resolve(Modules.FULFILLMENT)

  const root = path.resolve(process.cwd(), "seed-data/catalog")
  const { books } = JSON.parse(fs.readFileSync(path.join(root, "books.json"), "utf8")) as {
    books: CatalogBook[]
  }

  // Categories
  const { data: existingCategories } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
  })
  const categoryIds = new Map(existingCategories.map((c) => [c.handle as string, c.id as string]))
  const missingCategories = CATEGORIES.filter((c) => !categoryIds.has(c.handle))
  if (missingCategories.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missingCategories.map((c, i) => ({
          name: c.name,
          handle: c.handle,
          is_active: true,
          rank: i,
          metadata: { arabic: c.arabic },
        })),
      },
    })
    result.forEach((c) => categoryIds.set(c.handle, c.id))
  }

  // Tags
  const { data: existingTags } = await query.graph({ entity: "product_tag", fields: ["id", "value"] })
  const tagIds = new Map(existingTags.map((t) => [t.value as string, t.id as string]))
  const missingTags = TAGS.filter((t) => !tagIds.has(t))
  if (missingTags.length) {
    const { result } = await createProductTagsWorkflow(container).run({
      input: { product_tags: missingTags.map((value) => ({ value })) },
    })
    result.forEach((t) => tagIds.set(t.value, t.id))
  }

  // Sales channel, shipping profile, stock location
  const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id", "name"] })
  const channel = channels.find((c) => c.name === "Default Sales Channel") || channels[0]
  const [profile] = await fulfillment.listShippingProfiles({ type: "default" })
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id"] })
  if (!channel || !profile || !locations[0]) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Run the initial seed and seed:fulfillment first (sales channel, shipping profile, stock location)."
    )
  }
  const locationId = locations[0].id as string

  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: books.map((b) => b.handle) },
  })
  const existingHandles = new Set(existing.map((p) => p.handle))

  const sale: { variant_id: string; amount: number }[] = []
  const levels: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
  let created = 0

  for (const book of books) {
    if (existingHandles.has(book.handle)) {
      continue
    }

    const { result: uploads } = await uploadFilesWorkflow(container).run({
      input: {
        files: book.images.map((name) => ({
          filename: `${book.handle}-${name}`,
          mimeType: MIME[path.extname(name)] || "image/webp",
          content: fs.readFileSync(path.join(root, "images", name)).toString("base64"),
          access: "public" as const,
        })),
      },
    })
    const images = uploads.map((u) => ({ url: u.url }))
    const editorial = EDITORIAL[book.handle] || {}

    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: book.title,
            subtitle: book.subtitle || undefined,
            handle: book.handle,
            description: book.description,
            status: ProductStatus.PUBLISHED,
            thumbnail: images[0]?.url,
            images,
            shipping_profile_id: profile.id,
            category_ids: [categoryIds.get(book.category)!],
            tag_ids: book.tags.map((t) => tagIds.get(t)!).filter(Boolean),
            sales_channels: [{ id: channel.id as string }],
            metadata: {
              pages: book.pages,
              series: book.series,
              preorder: book.preorder || undefined,
              bookseller_note: editorial.bookseller_note,
              editorial_reviews: editorial.editorial_reviews,
              source_url: book.source_url,
            },
            options: [{ title: "Format", values: [book.format] }],
            variants: [
              {
                title: book.format,
                sku: book.book.isbn_13 || book.handle,
                ean: book.book.isbn_13 || undefined,
                manage_inventory: true,
                allow_backorder: book.allow_backorder,
                options: { Format: book.format },
                ...shippingSpecs(book),
                prices: [{ currency_code: "usd", amount: book.price_usd }],
              },
            ],
          },
        ],
        // The product-created hook links this to the Book module record.
        additional_data: book.book as Record<string, unknown>,
      },
    })

    const productId = result[0].id
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "inventory_items.inventory_item_id"],
      filters: { product_id: productId },
    })
    for (const variant of variants) {
      const itemId = variant.inventory_items?.[0]?.inventory_item_id as string | undefined
      if (itemId) {
        levels.push({ inventory_item_id: itemId, location_id: locationId, stocked_quantity: book.stock })
      }
      if (book.sale_price_usd) {
        sale.push({ variant_id: variant.id as string, amount: book.sale_price_usd })
      }
    }
    created += 1
  }

  if (levels.length) {
    await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: levels } })
  }

  if (sale.length) {
    const prices = sale.map((s) => ({ variant_id: s.variant_id, currency_code: "usd", amount: s.amount }))
    const { data: lists } = await query.graph({
      entity: "price_list",
      fields: ["id"],
      filters: { title: "Sale Items" },
    })
    if (lists[0]) {
      await batchPriceListPricesWorkflow(container).run({
        input: { data: { id: lists[0].id as string, create: prices, update: [], delete: [] } },
      })
    } else {
      await createPriceListsWorkflow(container).run({
        input: {
          price_lists_data: [
            {
              title: "Sale Items",
              description: "Reduced titles, matching the publisher's current sale prices",
              status: PriceListStatus.ACTIVE,
              prices,
            },
          ],
        },
      })
    }
  }

  const { result: synced } = await syncConvertedPricesWorkflow(container).run({ input: {} })
  logger.info(
    `Catalog: created ${created} books (${existingHandles.size} existed), ${sale.length} on sale; derived ${synced.base_prices} converted prices`
  )
}
