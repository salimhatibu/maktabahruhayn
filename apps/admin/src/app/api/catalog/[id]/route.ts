import { NextResponse, type NextRequest } from "next/server"
import { convert, getFxRates, toMajor } from "@maktabah/db"
import { db } from "@/lib/db"
import { deleteUnusedMedia } from "@/lib/media"
import { saveCatalogProduct, type CatalogProductInput } from "@/lib/catalog-save"

/** GET /api/catalog/:id — everything the editor shows for one product. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const database = await db()

  const product = await database
    .prepare(
      `SELECT p.*, b.title_arabic, b.author, b.translator, b.commentator_tahqeeq, b.publisher,
              b.binding_type, b.script_type, b.language, b.volume_count, b.isbn_10, b.isbn_13, b.sample_pdf_url
         FROM product p LEFT JOIN book b ON b.product_id = p.id
        WHERE p.id = ?1 AND p.deleted_at IS NULL`
    )
    .bind(id)
    .first<Record<string, string | number | null>>()
  if (!product) {
    return NextResponse.json({ message: "Product not found" }, { status: 404 })
  }

  const [images, categories, tags, variants, bundle] = await database.batch<Record<string, string | number | null>>([
    database.prepare(`SELECT url FROM product_image WHERE product_id = ?1 ORDER BY rank`).bind(id),
    database.prepare(`SELECT category_id FROM product_category WHERE product_id = ?1`).bind(id),
    database.prepare(`SELECT value FROM product_tag WHERE product_id = ?1`).bind(id),
    database
      .prepare(
        `SELECT v.id, v.option_value, v.system_sku, v.custom_sku, v.low_stock_threshold, v.cost_minor,
                v.length_cm, v.width_cm, v.height_cm, v.weight_g, v.manage_inventory, v.allow_backorder,
                (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'base' AND currency_code = 'kes') AS base_kes,
                (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'sale' AND currency_code = 'kes') AS sale_kes,
                (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'base' AND currency_code = 'usd') AS base_usd,
                (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'sale' AND currency_code = 'usd') AS sale_usd
           FROM variant v WHERE v.product_id = ?1 ORDER BY v.rank`
      )
      .bind(id),
    database.prepare(`SELECT product_id, quantity FROM bundle_item WHERE bundle_id = ?1 ORDER BY rank`).bind(id),
  ])

  const stock = await database
    .prepare(
      `SELECT il.variant_id, il.location_id, il.stocked_quantity
         FROM inventory_level il JOIN variant v ON v.id = il.variant_id
        WHERE v.product_id = ?1`
    )
    .bind(id)
    .all<{ variant_id: string; location_id: string; stocked_quantity: number }>()

  // The editor works in KES. A book priced only in the base currency is shown
  // converted, so opening and saving it cannot wipe its price to zero.
  const rates = await getFxRates(database)
  const asKes = (kes: unknown, base: unknown) =>
    kes !== null && kes !== undefined
      ? toMajor(Number(kes))
      : base === null || base === undefined
        ? 0
        : toMajor(convert(Number(base), "kes", rates))

  const firstVariant = variants.results[0]
  const dimensions = firstVariant?.length_cm
    ? {
        length: Number(firstVariant.length_cm),
        width: Number(firstVariant.width_cm || 0),
        height: Number(firstVariant.height_cm || 0),
        weight: Number(firstVariant.weight_g || 0),
      }
    : null

  return NextResponse.json({
    product: {
      id: product.id,
      product_number: product.product_number,
      title: product.title,
      subtitle: product.subtitle,
      handle: product.handle,
      description_html: product.description_html || "",
      status: product.status,
      publish_at: product.publish_at,
      images: images.results.map((row) => String(row.url)),
      category_ids: categories.results.map((row) => String(row.category_id)),
      primary_category_id: product.primary_category_id,
      unit: product.unit,
      product_type: product.product_type,
      bundle_items: bundle.results.map((row) => ({
        product_id: String(row.product_id),
        title: "",
        quantity: Number(row.quantity || 1),
      })),
      delivery_type: product.delivery_type,
      digital_file_url: product.digital_file_url || null,
      track_inventory: variants.results.some((v) => v.manage_inventory === 1),
      allow_backorder: variants.results.some((v) => v.allow_backorder === 1),
      shipping_size: product.shipping_size,
      custom_dimensions: dimensions,
      option_title: product.option_title,
      option_display: product.option_display,
      pages: product.pages,
      tags: tags.results.map((row) => String(row.value)),
      release_date: product.release_date,
      preorder: product.preorder === 1,
      series: product.series,
      bookseller_note: product.bookseller_note,
      author_bio: product.author_bio,
      editorial_reviews: JSON.parse(String(product.editorial_reviews || "[]")),
      book: {
        title_arabic: product.title_arabic,
        author: product.author,
        translator: product.translator,
        commentator_tahqeeq: product.commentator_tahqeeq,
        publisher: product.publisher,
        binding_type: product.binding_type,
        script_type: product.script_type,
        language: product.language,
        volume_count: product.volume_count,
        isbn_10: product.isbn_10,
        isbn_13: product.isbn_13,
        sample_pdf_url: product.sample_pdf_url,
      },
      variants: variants.results.map((variant) => ({
        id: variant.id,
        option_value: variant.option_value,
        system_sku: variant.system_sku,
        custom_sku: variant.custom_sku,
        // The editor works in KES major units, as it always has.
        selling_price: asKes(variant.base_kes, variant.base_usd),
        original_price:
          variant.sale_kes === null && variant.sale_usd === null
            ? null
            : asKes(variant.sale_kes, variant.sale_usd),
        cost: variant.cost_minor === null ? null : toMajor(Number(variant.cost_minor)),
        low_stock_threshold: variant.low_stock_threshold,
        stock: stock.results
          .filter((level) => level.variant_id === variant.id)
          .map((level) => ({ location_id: level.location_id, quantity: level.stocked_quantity })),
      })),
    },
  })
}

/** POST /api/catalog/:id — saves the editor form. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json()) as CatalogProductInput
  try {
    const productId = await saveCatalogProduct(await db(), { ...body, id })
    return NextResponse.json({ id: productId })
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 })
  }
}

/**
 * DELETE /api/catalog/:id — the product and everything it owns.
 *
 * Stock reservations are cleared first. A reservation belongs to an order in
 * flight, and leaving one behind is what made a book in an open order
 * impossible to delete before. Images are removed from R2 unless another
 * product still uses them.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const database = await db()

  const owned = await database
    .prepare(
      `SELECT url FROM product_image WHERE product_id = ?1
        UNION SELECT thumbnail FROM product WHERE id = ?1 AND thumbnail IS NOT NULL
        UNION SELECT sample_pdf_url FROM book WHERE product_id = ?1 AND sample_pdf_url IS NOT NULL`
    )
    .bind(id)
    .all<{ url: string }>()

  await database.batch([
    database
      .prepare(
        `UPDATE inventory_level SET reserved_quantity = 0, version = version + 1
          WHERE variant_id IN (SELECT id FROM variant WHERE product_id = ?1)`
      )
      .bind(id),
    // Variants, prices, images, the book row, tags and categories all cascade.
    database.prepare(`DELETE FROM product WHERE id = ?1`).bind(id),
  ])

  const deletedFiles = await deleteUnusedMedia(
    database,
    owned.results.map((row) => row.url).filter(Boolean)
  )
  return NextResponse.json({ id, deleted: true, deleted_files: deletedFiles })
}
