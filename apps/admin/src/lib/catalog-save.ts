import { BASE_CURRENCY, convertToBase, getFxRates, newId, toMinor, type D1, type D1Statement } from "@maktabah/db"
import { isHtml, sanitizeHtml } from "@maktabah/shared"

/**
 * Saving a product from the editor.
 *
 * Everything the form owns is rewritten in one batch: variants and their
 * prices, images, categories, tags, the book record and the stock levels.
 * D1 has no interactive transaction, and a batch is atomic, so a half-saved
 * product is not possible.
 *
 * Prices arrive in KES major units, as the editor has always worked in.
 */
export type VariantInput = {
  id?: string
  option_value: string
  custom_sku?: string | null
  selling_price: number
  original_price?: number | null
  cost?: number | null
  low_stock_threshold?: number | null
  stock: { location_id: string; quantity: number }[]
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
  bundle_items?: { product_id: string; quantity: number }[]
  delivery_type: "physical" | "digital"
  digital_file_url?: string | null
  track_inventory: boolean
  allow_backorder?: boolean
  shipping_size: string
  custom_dimensions?: { length: number; width: number; height: number; weight: number } | null
  option_title: string
  option_display?: "buttons" | "dropdown"
  variants: VariantInput[]
  status: "draft" | "published"
  publish_at?: string | null
  pages?: number | null
  tags?: string[]
  release_date?: string | null
  preorder?: boolean
  series?: string | null
  bookseller_note?: string | null
  author_bio?: string | null
  editorial_reviews?: { quote: string; source: string }[]
  book: Record<string, string | number | null | undefined>
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

/** Short, readable code used as the system SKU, stable for a given variant. */
export function systemSku(seed: string) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  let n = hash >>> 0
  for (let i = 0; i < 6; i++) {
    out += alphabet[n % alphabet.length]
    n = Math.floor(n / alphabet.length) || hash >>> (i + 1)
  }
  return `MR-${out}`
}

const PRESETS: Record<string, { length: number; width: number; height: number; weight: number }> = {
  small: { length: 21, width: 15, height: 3, weight: 450 },
  medium: { length: 25, width: 18, height: 6, weight: 1100 },
  large: { length: 32, width: 24, height: 12, weight: 3000 },
  xlarge: { length: 40, width: 30, height: 20, weight: 7000 },
}

export async function saveCatalogProduct(db: D1, input: CatalogProductInput): Promise<string> {
  const title = input.title?.trim()
  if (!title) {
    throw new Error("Enter a title.")
  }
  if (!input.variants?.length) {
    throw new Error("Add at least one format.")
  }

  const creating = !input.id || input.id === "new"
  const id = creating ? newId("prd") : (input.id as string)
  const handle = (input.handle?.trim() || slugify(title)) || id

  // Product numbers continue from the highest in use.
  let productNumber: number | null = null
  if (creating) {
    const row = await db.prepare(`SELECT MAX(product_number) AS max FROM product`).first<{ max: number | null }>()
    productNumber = Math.max(100, Number(row?.max || 0)) + 1
  }

  // Needed to write each price into the base currency as well as KES.
  const rates = await getFxRates(db)

  const size = PRESETS[input.shipping_size]
  const dimensions = input.shipping_size === "custom" ? input.custom_dimensions : size
  const statements: D1Statement[] = []

  statements.push(
    db
      .prepare(
        creating
          ? `INSERT INTO product (id, product_number, handle, title, subtitle, description_html, status,
                 publish_at, thumbnail, unit, product_type, delivery_type, primary_category_id, option_title,
                 option_display, shipping_size, pages, series, release_date, preorder, bookseller_note,
                 author_bio, editorial_reviews)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)`
          : `UPDATE product SET handle = ?3, title = ?4, subtitle = ?5, description_html = ?6, status = ?7,
                 publish_at = ?8, thumbnail = ?9, unit = ?10, product_type = ?11, delivery_type = ?12,
                 primary_category_id = ?13, option_title = ?14, option_display = ?15, shipping_size = ?16,
                 pages = ?17, series = ?18, release_date = ?19, preorder = ?20, bookseller_note = ?21,
                 author_bio = ?22, editorial_reviews = ?23,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1`
      )
      .bind(
        id,
        productNumber,
        handle,
        title,
        input.subtitle || null,
        // Plain text is stored as typed; HTML only ever as the sanitised allowlist.
        input.description_html && isHtml(input.description_html)
          ? sanitizeHtml(input.description_html)
          : input.description_html || "",
        input.status === "published" ? "published" : "draft",
        input.publish_at || null,
        input.thumbnail || input.images[0] || null,
        input.unit || "item",
        input.product_type === "bundle" ? "bundle" : "standard",
        input.delivery_type === "digital" ? "digital" : "physical",
        input.primary_category_id || input.category_ids[0] || null,
        input.option_title || "Format",
        input.option_display === "dropdown" ? "dropdown" : "buttons",
        input.shipping_size || "custom",
        input.pages ?? null,
        input.series || null,
        input.release_date || null,
        input.preorder ? 1 : 0,
        input.bookseller_note || null,
        input.author_bio || null,
        JSON.stringify(input.editorial_reviews || [])
      )
  )

  statements.push(
    db
      .prepare(`UPDATE product SET digital_file_url = ?2 WHERE id = ?1`)
      .bind(id, input.digital_file_url || null)
  )

  // Images, categories, tags and bundle items are owned wholesale by the form.
  statements.push(
    db.prepare(`DELETE FROM product_image WHERE product_id = ?1`).bind(id),
    ...input.images.map((url, index) =>
      db
        .prepare(`INSERT INTO product_image (id, product_id, url, rank) VALUES (?1, ?2, ?3, ?4)`)
        .bind(`img_${id}_${index}`, id, url, index)
    ),
    db.prepare(`DELETE FROM product_category WHERE product_id = ?1`).bind(id),
    ...input.category_ids.map((categoryId) =>
      db.prepare(`INSERT INTO product_category (product_id, category_id) VALUES (?1, ?2)`).bind(id, categoryId)
    ),
    db.prepare(`DELETE FROM product_tag WHERE product_id = ?1`).bind(id),
    ...(input.tags || []).map((value) =>
      db.prepare(`INSERT INTO product_tag (product_id, value) VALUES (?1, ?2)`).bind(id, value)
    ),
    db.prepare(`DELETE FROM bundle_item WHERE bundle_id = ?1`).bind(id),
    ...(input.bundle_items || []).map((item, index) =>
      db
        .prepare(`INSERT INTO bundle_item (bundle_id, product_id, quantity, rank) VALUES (?1, ?2, ?3, ?4)`)
        .bind(id, item.product_id, Math.max(1, item.quantity), index)
    )
  )

  const book = input.book || {}
  statements.push(
    db
      .prepare(
        `INSERT INTO book (product_id, title_arabic, author, translator, commentator_tahqeeq, publisher,
            binding_type, script_type, language, volume_count, isbn_10, isbn_13, sample_pdf_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT (product_id) DO UPDATE SET
           title_arabic = excluded.title_arabic, author = excluded.author, translator = excluded.translator,
           commentator_tahqeeq = excluded.commentator_tahqeeq, publisher = excluded.publisher,
           binding_type = excluded.binding_type, script_type = excluded.script_type,
           language = excluded.language, volume_count = excluded.volume_count,
           isbn_10 = excluded.isbn_10, isbn_13 = excluded.isbn_13, sample_pdf_url = excluded.sample_pdf_url`
      )
      .bind(
        id,
        book.title_arabic || null,
        book.author || null,
        book.translator || null,
        book.commentator_tahqeeq || null,
        book.publisher || null,
        book.binding_type || null,
        book.script_type || null,
        book.language || null,
        book.volume_count ?? null,
        book.isbn_10 || null,
        book.isbn_13 || null,
        book.sample_pdf_url || null
      )
  )

  // Variants the form no longer lists are removed; the rest are upserted.
  const keptIds = input.variants.map((variant) => variant.id).filter(Boolean) as string[]
  statements.push(
    db
      .prepare(
        `DELETE FROM variant WHERE product_id = ?1
          ${keptIds.length ? `AND id NOT IN (${keptIds.map((_, i) => `?${i + 2}`).join(", ")})` : ""}`
      )
      .bind(id, ...keptIds)
  )

  input.variants.forEach((variant, index) => {
    const variantId = variant.id || newId("var")
    const sellingMinor = toMinor(Number(variant.selling_price) || 0)
    const originalMinor = variant.original_price ? toMinor(Number(variant.original_price)) : null

    statements.push(
      db
        .prepare(
          `INSERT INTO variant (id, product_id, title, option_value, system_sku, custom_sku,
              manage_inventory, allow_backorder, low_stock_threshold, cost_minor,
              length_cm, width_cm, height_cm, weight_g, rank)
           VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
           ON CONFLICT (id) DO UPDATE SET
             title = excluded.title, option_value = excluded.option_value, custom_sku = excluded.custom_sku,
             manage_inventory = excluded.manage_inventory, allow_backorder = excluded.allow_backorder,
             low_stock_threshold = excluded.low_stock_threshold, cost_minor = excluded.cost_minor,
             length_cm = excluded.length_cm, width_cm = excluded.width_cm,
             height_cm = excluded.height_cm, weight_g = excluded.weight_g, rank = excluded.rank`
        )
        .bind(
          variantId,
          id,
          variant.option_value || "Standard",
          systemSku(variantId),
          variant.custom_sku || null,
          input.track_inventory ? 1 : 0,
          input.allow_backorder ? 1 : 0,
          variant.low_stock_threshold ?? null,
          variant.cost ? toMinor(Number(variant.cost)) : null,
          dimensions?.length ?? null,
          dimensions?.width ?? null,
          dimensions?.height ?? null,
          dimensions?.weight ?? null,
          index
        ),
      // The editor sets KES, so a KES shopper is charged exactly the figure
      // that was typed. The storefront converts outwards from the base row
      // though, so the base amount is written too - otherwise every shopper in
      // another currency would keep reading the price from before this save.
      db
        .prepare(
          `INSERT INTO variant_price (variant_id, currency_code, kind, amount_minor)
           VALUES (?1, 'kes', 'base', ?2)
           ON CONFLICT (variant_id, currency_code, kind) DO UPDATE SET amount_minor = excluded.amount_minor`
        )
        .bind(variantId, sellingMinor),
      db
        .prepare(
          `INSERT INTO variant_price (variant_id, currency_code, kind, amount_minor)
           VALUES (?1, ?2, 'base', ?3)
           ON CONFLICT (variant_id, currency_code, kind) DO UPDATE SET amount_minor = excluded.amount_minor`
        )
        .bind(variantId, BASE_CURRENCY, convertToBase(sellingMinor, "kes", rates)),
      db.prepare(`DELETE FROM variant_price WHERE variant_id = ?1 AND kind = 'sale'`).bind(variantId)
    )

    if (originalMinor && originalMinor > sellingMinor) {
      statements.push(
        db
          .prepare(
            `INSERT INTO variant_price (variant_id, currency_code, kind, amount_minor)
             VALUES (?1, 'kes', 'sale', ?2)`
          )
          .bind(variantId, originalMinor),
        db
          .prepare(
            `INSERT INTO variant_price (variant_id, currency_code, kind, amount_minor)
             VALUES (?1, ?2, 'sale', ?3)`
          )
          .bind(variantId, BASE_CURRENCY, convertToBase(originalMinor, "kes", rates))
      )
    }

    for (const level of variant.stock || []) {
      statements.push(
        db
          .prepare(
            `INSERT INTO inventory_level (variant_id, location_id, stocked_quantity)
             VALUES (?1, ?2, ?3)
             ON CONFLICT (variant_id, location_id) DO UPDATE SET
               stocked_quantity = excluded.stocked_quantity, version = version + 1`
          )
          .bind(variantId, level.location_id, Math.max(0, Math.round(level.quantity)))
      )
    }
  })

  await db.batch(statements)
  return id
}
