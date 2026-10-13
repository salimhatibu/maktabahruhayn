import { z } from "@medusajs/framework/zod"

const Stock = z.object({ location_id: z.string(), quantity: z.number().int().min(0).max(1_000_000) })

export const CatalogProductBody = z.object({
  title: z.string().trim().min(1).max(300),
  subtitle: z.string().max(300).nullish(),
  handle: z.string().max(120).nullish(),
  description_html: z.string().max(60_000).nullish(),
  images: z.array(z.string().url()).max(10),
  thumbnail: z.string().url().nullish(),
  category_ids: z.array(z.string()).max(20),
  primary_category_id: z.string().nullish(),
  unit: z.string().trim().min(1).max(30),
  product_type: z.enum(["standard", "bundle"]),
  bundle_items: z
    .array(z.object({ product_id: z.string(), title: z.string(), quantity: z.number().int().min(1).max(100) }))
    .max(30)
    .optional(),
  delivery_type: z.enum(["physical", "digital"]),
  track_inventory: z.boolean(),
  allow_backorder: z.boolean().optional(),
  shipping_size: z.enum(["small", "medium", "large", "xlarge", "custom"]),
  custom_dimensions: z
    .object({
      length: z.number().positive().max(300),
      width: z.number().positive().max(300),
      height: z.number().positive().max(300),
      weight: z.number().positive().max(100_000),
    })
    .nullish(),
  option_title: z.string().trim().min(1).max(40),
  option_display: z.enum(["buttons", "dropdown"]).optional(),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        option_value: z.string().trim().min(1).max(80),
        custom_sku: z.string().trim().max(60).nullish(),
        selling_price: z.number().positive().max(10_000_000),
        original_price: z.number().min(0).max(10_000_000).nullish(),
        cost: z.number().min(0).max(10_000_000).nullish(),
        low_stock_threshold: z.number().int().min(0).max(100_000).nullish(),
        stock: z.array(Stock).max(20),
      })
    )
    .min(1)
    .max(50),
  status: z.enum(["draft", "published"]),
  publish_at: z.string().datetime({ offset: true }).nullish(),
  pages: z.number().int().positive().max(100_000).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  release_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  preorder: z.boolean().optional(),
  series: z.string().max(200).nullish(),
  bookseller_note: z.string().max(2000).nullish(),
  author_bio: z.string().max(4000).nullish(),
  editorial_reviews: z
    .array(z.object({ quote: z.string().trim().min(1).max(1000), source: z.string().trim().max(200) }))
    .max(10)
    .optional(),
  book: z
    .object({
      title_arabic: z.string().max(300).nullish(),
      author: z.string().max(300).nullish(),
      translator: z.string().max(300).nullish(),
      commentator_tahqeeq: z.string().max(300).nullish(),
      publisher: z.string().max(300).nullish(),
      binding_type: z.string().max(60).nullish(),
      script_type: z.string().max(60).nullish(),
      language: z.string().max(60).nullish(),
      volume_count: z.number().int().positive().max(500).nullish(),
      isbn_10: z.string().max(20).nullish(),
      isbn_13: z.string().max(20).nullish(),
      sample_pdf_url: z.string().url().nullish(),
    })
    .default({}),
})

export type CatalogProductBodyType = z.infer<typeof CatalogProductBody>

export const QuickCategoryBody = z.object({ name: z.string().trim().min(1).max(80) })
