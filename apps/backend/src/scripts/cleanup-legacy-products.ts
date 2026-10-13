/**
 * One-off cleanup: deletes the Medusa starter clothing products, the
 * placeholder books from the first catalog seed, their now-empty categories,
 * and the starter's flat-rate shipping options (which have no prices in most
 * of our currencies; Shippo rates replace them). Only the explicit names
 * below are touched.
 *
 *   pnpm --filter @maktabah/backend exec medusa exec ./src/scripts/cleanup-legacy-products.ts
 */
import fs from "node:fs"
import { BOOK_MODULE } from "../modules/book"
import type BookModuleService from "../modules/book/service"
import path from "node:path"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  deleteShippingOptionsWorkflow,
  deletePriceListsWorkflow,
  deleteProductCategoriesWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"

const LEGACY_PRODUCT_HANDLES = [
  // Medusa starter clothing
  "t-shirt",
  "sweatshirt",
  "sweatpants",
  "shorts",
  // First-pass placeholder books (replaced by seed-data/catalog/books.json).
  // Handles reused by the real catalog must never appear here.
  "riyad-as-salihin",
  "tafsir-ibn-kathir-abridged",
  "fortress-of-the-muslim",
  "al-aqidah-al-wasitiyyah",
  "madinah-arabic-reader-book-1",
  "al-ajurrumiyyah",
  "purification-of-the-heart",
  "book-of-knowledge-ihya",
  "mukhtasar-al-quduri",
  "mushaf-madani-large",
  "mushaf-indo-pak-13-line",
  "tafsiri-ya-qurani-tukufu",
  "al-adab-al-mufrad",
  "goodnight-stories-from-the-quran",
  "muwatta-imam-malik-new-edition",
  "sahih-al-bukhari-arabic-english",
]

const LEGACY_SHIPPING_OPTIONS = ["Standard Shipping", "Express Shipping"]

const LEGACY_CATEGORY_HANDLES = [
  "shirts",
  "sweatshirts",
  "pants",
  "merch",
  "quran-tafsir",
  "fiqh",
  "aqeedah",
  "spirituality",
  "arabic-language",
  "kids-teens",
]

export default async function cleanupLegacyProducts({ container }: ExecArgs) {
  const catalog = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "seed-data/catalog/books.json"), "utf8")
  ) as { books: { handle: string }[] }
  const keep = new Set(catalog.books.map((b) => b.handle))
  const overlap = LEGACY_PRODUCT_HANDLES.filter((h) => keep.has(h))
  if (overlap.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Refusing to delete catalog books: ${overlap.join(", ")}`
    )
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: LEGACY_PRODUCT_HANDLES },
  })
  if (products.length) {
    await deleteProductsWorkflow(container).run({
      input: { ids: products.map((p) => p.id as string) },
    })
  }
  logger.info(`Deleted ${products.length} legacy products: ${products.map((p) => p.handle).join(", ")}`)

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle", "products.id"],
    filters: { handle: LEGACY_CATEGORY_HANDLES },
  })
  const empty = categories.filter((c) => !(c.products || []).length)
  if (empty.length) {
    await deleteProductCategoriesWorkflow(container).run({
      input: empty.map((c) => c.id as string),
    })
  }
  logger.info(`Deleted ${empty.length} empty legacy categories`)

  const { data: lists } = await query.graph({
    entity: "price_list",
    fields: ["id"],
    filters: { title: "Seasonal Sale" },
  })
  if (lists.length) {
    await deletePriceListsWorkflow(container).run({ input: { ids: lists.map((l) => l.id as string) } })
  }
  logger.info(`Deleted ${lists.length} legacy price lists`)

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "provider_id"],
    filters: { name: LEGACY_SHIPPING_OPTIONS },
  })
  const starter = options.filter((o) => o.provider_id === "manual_manual")
  if (starter.length) {
    await deleteShippingOptionsWorkflow(container).run({ input: { ids: starter.map((o) => o.id as string) } })
  }
  logger.info(`Deleted ${starter.length} starter flat-rate shipping options`)

  // Book records whose product was deleted before the link cascaded.
  const { data: books } = await query.graph({ entity: "book", fields: ["id", "product.id"] })
  const orphans = books.filter((b) => !(b as { product?: { id?: string } | null }).product?.id)
  if (orphans.length) {
    const bookModule: BookModuleService = container.resolve(BOOK_MODULE)
    await bookModule.deleteBooks(orphans.map((b) => b.id as string))
  }
  logger.info(`Deleted ${orphans.length} orphaned book records`)
}
