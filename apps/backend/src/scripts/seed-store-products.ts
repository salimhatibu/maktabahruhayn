/**
 * Imports the store's own catalog from its current site (maktabahruhayn.com),
 * from seed-data/maktabah-ruhayn/products.json: titles, descriptions, images,
 * KES prices (pinned, never converted), the Special Pack sale, and the store's
 * Marriage & Family, Women and Arabic Books departments.
 *
 *   pnpm seed:store-products
 *
 * Re-running skips handles that already exist.
 */
import fs from "node:fs"
import path from "node:path"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules, PriceListStatus, ProductStatus } from "@medusajs/framework/utils"
import {
  batchPriceListPricesWorkflow,
  createPriceListsWorkflow,
  createProductCategoriesWorkflow,
  createProductTagsWorkflow,
  createProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"
import { syncConvertedPricesWorkflow } from "../workflows/sync-converted-prices"

type StoreProduct = {
  handle: string
  title: string
  description: string
  categories: string[]
  tags: string[]
  format: string
  author: string | null
  language: string | null
  binding_type: string | null
  price_kes: number
  price_usd: number
  sale_price_kes: number | null
  sale_price_usd: number | null
  preorder: boolean
  image: string | null
  source_url: string
}

const NEW_CATEGORIES = [
  { handle: "marriage-family", name: "Marriage & Family", arabic: "الزواج والأسرة" },
  { handle: "women", name: "Women", arabic: "المرأة المسلمة" },
  { handle: "arabic-books", name: "Arabic Books", arabic: "كتب عربية" },
]

export default async function seedStoreProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment = container.resolve(Modules.FULFILLMENT)
  const root = path.resolve(process.cwd(), "seed-data/maktabah-ruhayn")
  const { books } = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8")) as { books: StoreProduct[] }

  const { data: cats } = await query.graph({ entity: "product_category", fields: ["id", "handle"] })
  const categoryIds = new Map(cats.map((c) => [c.handle as string, c.id as string]))
  const missing = NEW_CATEGORIES.filter((c) => !categoryIds.has(c.handle))
  if (missing.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: missing.map((c, i) => ({
          name: c.name,
          handle: c.handle,
          is_active: true,
          rank: 20 + i,
          metadata: { arabic: c.arabic },
        })),
      },
    })
    result.forEach((c) => categoryIds.set(c.handle, c.id))
  }

  const { data: tags } = await query.graph({ entity: "product_tag", fields: ["id", "value"] })
  const tagIds = new Map(tags.map((t) => [t.value as string, t.id as string]))
  const missingTags = [...new Set(books.flatMap((b) => b.tags))].filter((t) => !tagIds.has(t))
  if (missingTags.length) {
    const { result } = await createProductTagsWorkflow(container).run({
      input: { product_tags: missingTags.map((value) => ({ value })) },
    })
    result.forEach((t) => tagIds.set(t.value, t.id))
  }

  const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id", "name"] })
  const channel = channels.find((c) => c.name === "Default Sales Channel") || channels[0]
  const [profile] = await fulfillment.listShippingProfiles({ type: "default" })
  if (!channel || !profile) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Run the initial seed first")
  }

  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: books.map((b) => b.handle) },
  })
  const have = new Set(existing.map((p) => p.handle))
  const sale: { variant_id: string; usd: number; kes: number }[] = []
  let created = 0

  for (const book of books) {
    if (have.has(book.handle)) {
      continue
    }
    let images: { url: string }[] = []
    if (book.image) {
      const { result } = await uploadFilesWorkflow(container).run({
        input: {
          files: [
            {
              filename: `${book.handle.slice(0, 60)}.webp`,
              mimeType: "image/webp",
              content: fs.readFileSync(path.join(root, "images", book.image)).toString("base64"),
              access: "public" as const,
            },
          ],
        },
      })
      images = result.map((r) => ({ url: r.url }))
    }

    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: book.title,
            handle: book.handle,
            description: book.description || undefined,
            status: ProductStatus.PUBLISHED,
            thumbnail: images[0]?.url,
            images,
            shipping_profile_id: profile.id,
            category_ids: book.categories.map((c) => categoryIds.get(c)).filter((id): id is string => Boolean(id)),
            tag_ids: book.tags.map((t) => tagIds.get(t)!).filter(Boolean),
            sales_channels: [{ id: channel.id as string }],
            metadata: { preorder: book.preorder || undefined, source_url: book.source_url },
            options: [{ title: "Format", values: [book.format] }],
            variants: [
              {
                title: book.format,
                sku: `MR-${book.handle.slice(0, 40)}`,
                // Stock levels are not published on the current site.
                manage_inventory: false,
                options: { Format: book.format },
                metadata: { pinned_currencies: ["kes"] },
                weight: book.format === "Bookmark" ? 20 : book.format === "3-Volume Set" ? 1500 : 350,
                length: book.format === "Bookmark" ? 16 : 21,
                width: book.format === "Bookmark" ? 5 : 14,
                height: book.format === "Bookmark" ? 0.2 : book.format === "3-Volume Set" ? 6 : 1.5,
                prices: [
                  { currency_code: "usd", amount: book.price_usd },
                  { currency_code: "kes", amount: book.price_kes },
                ],
              },
            ],
          },
        ],
        additional_data: {
          author: book.author,
          language: book.language,
          binding_type: book.binding_type,
          volume_count: book.format === "3-Volume Set" ? 3 : book.format === "Pack of 4" ? 4 : 1,
        },
      },
    })
    created += 1
    if (book.sale_price_kes && book.sale_price_usd) {
      sale.push({ variant_id: result[0].variants[0].id, usd: book.sale_price_usd, kes: book.sale_price_kes })
    }
  }

  if (sale.length) {
    const prices = sale.flatMap((s) => [
      { variant_id: s.variant_id, currency_code: "usd", amount: s.usd },
      { variant_id: s.variant_id, currency_code: "kes", amount: s.kes },
    ])
    const { data: lists } = await query.graph({ entity: "price_list", fields: ["id"], filters: { title: "Sale Items" } })
    if (lists[0]) {
      await batchPriceListPricesWorkflow(container).run({
        input: { data: { id: lists[0].id as string, create: prices, update: [], delete: [] } },
      })
    } else {
      await createPriceListsWorkflow(container).run({
        input: {
          price_lists_data: [
            { title: "Sale Items", description: "Reduced titles", status: PriceListStatus.ACTIVE, prices },
          ],
        },
      })
    }
  }

  const { result: synced } = await syncConvertedPricesWorkflow(container).run({ input: {} })
  logger.info(`Store products: created ${created} (${have.size} existed); derived ${synced.base_prices} converted prices`)
}
