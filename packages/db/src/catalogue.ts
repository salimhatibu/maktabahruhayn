import type { D1 } from "./client"
import { BASE_CURRENCY, convert, toMinor } from "./money"
import type { BookDetail, BookFacets, BookSummary, Category, Filter, ListBooksOptions } from "./types"

/** Description HTML reduced to the plain text a card blurb shows. */
function plainText(html: string | null): string | null {
  if (!html) {
    return null
  }
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_, e) => ({ nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e as string] || " ")
    .replace(/\s+/g, " ")
    .trim()
  return text || null
}

/** Latest FX rates, keyed by currency, as units per 1 of the base currency. */
export async function getFxRates(db: D1): Promise<Record<string, number>> {
  const { results } = await db.prepare("SELECT currency_code, rate FROM fx_rate").all<{
    currency_code: string
    rate: number
  }>()
  const rates: Record<string, number> = {}
  for (const row of results) {
    rates[row.currency_code] = row.rate
  }
  return rates
}

type PricedRow = {
  id: string
  handle: string
  title: string
  subtitle: string | null
  thumbnail: string | null
  preorder: number
  series: string | null
  blurb_html: string | null
  author: string | null
  title_arabic: string | null
  variant_id: string
  option_value: string
  manage_inventory: number
  low_stock_threshold: number | null
  price_cur: number | null
  price_base: number | null
  compare_cur: number | null
  compare_base: number | null
  sale_ends_at: string | null
  stock: number | null
  allow_backorder: number
}

/**
 * A price set explicitly in the shopper's currency always wins; otherwise the
 * base price is converted. Returned in minor units of `currency`.
 */
function priceOf(row: PricedRow, currency: string, rates: Record<string, number>) {
  const priceMinor =
    row.price_cur ?? (row.price_base === null ? 0 : convert(row.price_base, currency, rates))
  const compareRaw = row.compare_cur ?? (row.compare_base === null ? null : convert(row.compare_base, currency, rates))
  // Only show a struck-through price when it is actually higher.
  const compareAtMinor = compareRaw !== null && compareRaw > priceMinor ? compareRaw : null
  const saleEndsAt = compareAtMinor ? (row.sale_ends_at || null) : null
  return { priceMinor, compareAtMinor, saleEndsAt }
}

/** The cheapest variant of each product carries the listing price. */
const LIST_SELECT = `
  SELECT p.id, p.handle, p.title, p.subtitle, p.thumbnail, p.preorder, p.series,
         substr(p.description_html, 1, 800) AS blurb_html,
         b.author, b.title_arabic,
         v.id AS variant_id, v.option_value, v.manage_inventory, v.low_stock_threshold,
         (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'base' AND currency_code = ?1) AS price_cur,
         (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'base' AND currency_code = ?2) AS price_base,
         (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'sale' AND currency_code = ?1) AS compare_cur,
         (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'sale' AND currency_code = ?2) AS compare_base,
         (SELECT COALESCE(SUM(stocked_quantity - reserved_quantity), 0) FROM inventory_level WHERE variant_id = v.id) AS stock,
         v.allow_backorder,
         (SELECT pl.ends_at FROM variant_price vp JOIN price_list pl ON pl.id = vp.price_list_id WHERE vp.variant_id = v.id AND vp.kind = 'sale' AND pl.ends_at IS NOT NULL LIMIT 1) AS sale_ends_at
    FROM product p
    JOIN variant v ON v.product_id = p.id
                  AND v.rank = (SELECT MIN(rank) FROM variant WHERE product_id = p.id)
    LEFT JOIN book b ON b.product_id = p.id`

/** Published, not deleted, and live now rather than scheduled for later. */
const LIVE = `p.status = 'published' AND p.deleted_at IS NULL
              AND (p.publish_at IS NULL OR p.publish_at <= ?3)`

const values = (filter: Filter): string[] =>
  (Array.isArray(filter) ? filter : filter ? [filter] : []).filter(Boolean)

function buildFilters(options: ListBooksOptions, params: unknown[]) {
  const where: string[] = []

  /** Binds one or more values and returns the `IN (?n, ?n+1)` list for them. */
  const bindList = (list: string[]) =>
    list
      .map((value) => {
        params.push(value)
        return `?${params.length}`
      })
      .join(", ")

  const add = (clause: string, filter: Filter) => {
    const list = values(filter)
    if (list.length) {
      where.push(clause.replace("IN (?)", `IN (${bindList(list)})`))
    }
  }

  add(
    "EXISTS (SELECT 1 FROM product_category pc JOIN category c ON c.id = pc.category_id WHERE pc.product_id = p.id AND c.handle IN (?))",
    options.category
  )
  add("EXISTS (SELECT 1 FROM product_tag t WHERE t.product_id = p.id AND t.value IN (?))", options.tag)
  add("b.language IN (?)", options.language)
  add("b.binding_type IN (?)", options.binding)
  add("b.publisher IN (?)", options.publisher)
  // A query of nothing but quotes and spaces has no terms; FTS5 would reject
  // the empty MATCH, so it is treated as no query.
  const match = options.q ? ftsQuery(options.q) : ""
  if (match) {
    params.push(match)
    where.push(`p.id IN (SELECT product_id FROM book_search WHERE book_search MATCH ?${params.length})`)
  }
  if (options.sale) {
    where.push(`EXISTS (SELECT 1 FROM variant_price sp WHERE sp.variant_id = v.id AND sp.kind = 'sale')`)
  }
  if (options.priceMin != null && Number.isFinite(options.priceMin)) {
    params.push(toMinor(options.priceMin))
    where.push(`COALESCE(price_cur, price_base) >= ?${params.length}`)
  }
  if (options.priceMax != null && Number.isFinite(options.priceMax)) {
    params.push(toMinor(options.priceMax))
    where.push(`COALESCE(price_cur, price_base) <= ?${params.length}`)
  }
  return where
}

/**
 * User input goes to FTS5 as quoted prefix terms: quoting stops characters
 * like `-` or `"` being read as operators, and the trailing `*` makes typing
 * "nawaw" match "Nawawi".
 */
export function ftsQuery(input: string): string {
  const terms = input
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/"/g, ""))
    .filter(Boolean)
    .slice(0, 8)
  return terms.map((term) => `"${term}"*`).join(" ")
}

export async function listBooks(
  db: D1,
  options: ListBooksOptions = {}
): Promise<{ books: BookSummary[]; count: number }> {
  const currency = (options.currency || BASE_CURRENCY).toLowerCase()
  // Both are written into the SQL text, so they must be plain integers.
  const whole = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? Math.floor(value as number) : fallback
  const limit = Math.min(Math.max(whole(options.limit, 24), 1), 100)
  const offset = Math.min(Math.max(whole(options.offset, 0), 0), 100_000)
  const params: unknown[] = [currency, BASE_CURRENCY, new Date().toISOString()]
  const where = [LIVE, ...buildFilters(options, params)]

  const order =
    options.sort === "price-asc"
      ? "COALESCE(price_cur, price_base) ASC"
      : options.sort === "price-desc"
        ? "COALESCE(price_cur, price_base) DESC"
        : options.sort === "newest"
          ? "p.created_at DESC"
          : "p.product_number DESC"

  const sql = `${LIST_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`
  const countSql = `SELECT COUNT(*) AS n FROM product p
    JOIN variant v ON v.product_id = p.id AND v.rank = (SELECT MIN(rank) FROM variant WHERE product_id = p.id)
    LEFT JOIN book b ON b.product_id = p.id
    WHERE ${where.join(" AND ")}`

  const [rows, total, rates] = await Promise.all([
    db.prepare(sql).bind(...params).all<PricedRow>(),
    db.prepare(countSql).bind(...params).first<{ n: number }>(),
    getFxRates(db),
  ])

  const ids = rows.results.map((r) => r.id)
  const { tags, categories } = await loadLabels(db, ids)

  return {
    count: total?.n ?? rows.results.length,
    books: rows.results.map((row) => ({
      id: row.id,
      handle: row.handle,
      title: row.title,
      subtitle: row.subtitle,
      thumbnail: row.thumbnail,
      author: row.author,
      arabicTitle: row.title_arabic,
      series: row.series,
      variantId: row.variant_id,
      formatLabel: row.option_value,
      manageInventory: row.manage_inventory === 1,
      allowBackorder: row.allow_backorder === 1,
      lowStockThreshold: row.low_stock_threshold,
      blurb: plainText(row.blurb_html),
      currency,
      ...priceOf(row, currency, rates),
      stock: Number(row.stock || 0),
      inStock: Number(row.stock || 0) > 0 || row.allow_backorder === 1,
      preorder: row.preorder === 1,
      tags: tags.get(row.id) || [],
      categories: categories.get(row.id) || [],
    })),
  }
}

/** Tags and categories for a page of products, in one round trip each. */
async function loadLabels(db: D1, ids: string[]) {
  const tags = new Map<string, string[]>()
  const categories = new Map<string, { handle: string; name: string }[]>()
  if (!ids.length) {
    return { tags, categories }
  }
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(", ")
  const [tagRows, catRows] = await db.batch<{ product_id: string; value?: string; handle?: string; name?: string }>([
    db.prepare(`SELECT product_id, value FROM product_tag WHERE product_id IN (${placeholders})`).bind(...ids),
    db
      .prepare(
        `SELECT pc.product_id, c.handle, c.name FROM product_category pc
           JOIN category c ON c.id = pc.category_id
          WHERE pc.product_id IN (${placeholders})`
      )
      .bind(...ids),
  ])
  for (const row of tagRows.results) {
    tags.set(row.product_id, [...(tags.get(row.product_id) || []), row.value as string])
  }
  for (const row of catRows.results) {
    categories.set(row.product_id, [
      ...(categories.get(row.product_id) || []),
      { handle: row.handle as string, name: row.name as string },
    ])
  }
  return { tags, categories }
}

export async function getBook(db: D1, handle: string, currency = BASE_CURRENCY): Promise<BookDetail | null> {
  const code = currency.toLowerCase()
  // Drafts and books scheduled for later are not on the shelf, even by URL.
  const row = await db
    .prepare(
      `SELECT p.*, b.title_arabic, b.author, b.translator, b.commentator_tahqeeq, b.publisher,
              b.binding_type, b.script_type, b.language, b.volume_count, b.isbn_10, b.isbn_13, b.sample_pdf_url
         FROM product p LEFT JOIN book b ON b.product_id = p.id
        WHERE p.handle = ?1 AND p.status = 'published' AND p.deleted_at IS NULL
          AND (p.publish_at IS NULL OR p.publish_at <= ?2)`
    )
    .bind(handle, new Date().toISOString())
    .first<Record<string, any>>()
  if (!row) {
    return null
  }

  const [variants, images, labels, rates] = await Promise.all([
    db
      .prepare(
        `SELECT v.id, v.title, v.option_value, v.system_sku, v.custom_sku, v.allow_backorder,
                v.manage_inventory, v.low_stock_threshold,
                v.length_cm, v.width_cm, v.height_cm, v.weight_g,
                (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'base' AND currency_code = ?2) AS price_cur,
                (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'base' AND currency_code = ?3) AS price_base,
                (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'sale' AND currency_code = ?2) AS compare_cur,
                (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'sale' AND currency_code = ?3) AS compare_base,
                (SELECT pl.ends_at FROM variant_price vp JOIN price_list pl ON pl.id = vp.price_list_id WHERE vp.variant_id = v.id AND vp.kind = 'sale' AND pl.ends_at IS NOT NULL LIMIT 1) AS sale_ends_at,
                (SELECT COALESCE(SUM(stocked_quantity - reserved_quantity), 0) FROM inventory_level WHERE variant_id = v.id) AS stock
           FROM variant v WHERE v.product_id = ?1 ORDER BY v.rank`
      )
      .bind(row.id, code, BASE_CURRENCY)
      .all<
        PricedRow & {
          system_sku: string
          custom_sku: string | null
          length_cm: number | null
          width_cm: number | null
          height_cm: number | null
          weight_g: number | null
        }
      >(),
    db.prepare(`SELECT url FROM product_image WHERE product_id = ?1 ORDER BY rank`).bind(row.id).all<{ url: string }>(),
    loadLabels(db, [row.id as string]),
    getFxRates(db),
  ])

  const priced = variants.results.map((v) => ({
    id: v.id,
    title: v.title,
    optionValue: v.option_value,
    sku: v.custom_sku || v.system_sku,
    stock: Number(v.stock || 0),
    manageInventory: v.manage_inventory === 1,
    allowBackorder: v.allow_backorder === 1,
    lowStockThreshold: v.low_stock_threshold,
    dimensions:
      v.length_cm || v.width_cm || v.height_cm || v.weight_g
        ? {
            length: Number(v.length_cm || 0),
            width: Number(v.width_cm || 0),
            height: Number(v.height_cm || 0),
            weight: Number(v.weight_g || 0),
          }
        : null,
    ...priceOf(v as PricedRow, code, rates),
  }))
  const cheapest = priced.reduce<(typeof priced)[number] | null>(
    (min, v) => (!min || v.priceMinor < min.priceMinor ? v : min),
    null
  )
  const stock = priced.reduce((n, v) => n + v.stock, 0)

  return {
    id: row.id,
    handle: row.handle,
    title: row.title,
    subtitle: row.subtitle,
    thumbnail: row.thumbnail,
    author: row.author ?? null,
    arabicTitle: row.title_arabic ?? null,
    series: row.series ?? null,
    variantId: cheapest?.id ?? "",
    formatLabel: cheapest?.optionValue ?? "",
    manageInventory: priced.some((v) => v.manageInventory),
    allowBackorder: priced.some((v) => v.allowBackorder),
    lowStockThreshold: cheapest?.lowStockThreshold ?? null,
    blurb: plainText(row.description_html),
    currency: code,
    priceMinor: cheapest?.priceMinor ?? 0,
    compareAtMinor: cheapest?.compareAtMinor ?? null,
    saleEndsAt: cheapest?.saleEndsAt ?? null,
    stock,
    inStock: stock > 0 || priced.some((v) => v.allowBackorder),
    preorder: row.preorder === 1,
    tags: labels.tags.get(row.id) || [],
    categories: labels.categories.get(row.id) || [],
    descriptionHtml: row.description_html || "",
    // Nothing makes image URLs unique per product, and the gallery keys on them.
    images: [...new Set(images.results.map((i) => i.url))],
    pages: row.pages ?? null,
    booksellerNote: row.bookseller_note ?? null,
    authorBio: row.author_bio ?? null,
    editorialReviews: JSON.parse(row.editorial_reviews || "[]"),
    unit: row.unit || "item",
    optionTitle: row.option_title || "Format",
    optionDisplay: row.option_display === "dropdown" ? "dropdown" : "buttons",
    book: {
      titleArabic: row.title_arabic ?? null,
      author: row.author ?? null,
      translator: row.translator ?? null,
      commentatorTahqeeq: row.commentator_tahqeeq ?? null,
      publisher: row.publisher ?? null,
      bindingType: row.binding_type ?? null,
      scriptType: row.script_type ?? null,
      language: row.language ?? null,
      volumeCount: row.volume_count ?? null,
      isbn10: row.isbn_10 ?? null,
      isbn13: row.isbn_13 ?? null,
      samplePdfUrl: row.sample_pdf_url ?? null,
    },
    variants: priced,
  }
}

export async function listCategories(db: D1): Promise<Category[]> {
  const { results } = await db
    .prepare(`SELECT id, handle, name, parent_id FROM category WHERE is_active = 1 ORDER BY rank, name`)
    .all<{ id: string; handle: string; name: string; parent_id: string | null }>()
  return results.map((c) => ({ id: c.id, handle: c.handle, name: c.name, parentId: c.parent_id }))
}

/** Counts for the filter sidebar, under the filters already applied. */
export async function getFacets(db: D1, options: ListBooksOptions = {}): Promise<BookFacets> {
  const params: unknown[] = ["", BASE_CURRENCY, new Date().toISOString()]
  const where = [LIVE, ...buildFilters(options, params)].join(" AND ")
  const from = `FROM product p
    JOIN variant v ON v.product_id = p.id AND v.rank = (SELECT MIN(rank) FROM variant WHERE product_id = p.id)
    LEFT JOIN book b ON b.product_id = p.id`

  const field = (column: string) =>
    db
      .prepare(
        `SELECT ${column} AS value, COUNT(*) AS count ${from}
          WHERE ${where} AND ${column} IS NOT NULL
          GROUP BY ${column} ORDER BY count DESC`
      )
      .bind(...params)

  const [language, binding, publisher, category] = await db.batch<{ value: string; count: number }>([
    field("b.language"),
    field("b.binding_type"),
    field("b.publisher"),
    // Categories need their own join: a book can sit in several, so the count
    // is of distinct products rather than rows.
    db
      .prepare(
        `SELECT c.handle AS value, COUNT(DISTINCT p.id) AS count ${from}
           JOIN product_category pc ON pc.product_id = p.id
           JOIN category c ON c.id = pc.category_id
          WHERE ${where}
          GROUP BY c.handle ORDER BY count DESC`
      )
      .bind(...params),
  ])
  return {
    language: language.results,
    binding: binding.results,
    publisher: publisher.results,
    category: category.results,
  }
}

/** Every settings section, parsed. */
export async function getSettings<T extends Record<string, unknown>>(db: D1): Promise<T> {
  const { results } = await db.prepare(`SELECT key, value FROM store_setting`).all<{ key: string; value: string }>()
  const out: Record<string, unknown> = {}
  for (const row of results) {
    try {
      out[row.key] = JSON.parse(row.value)
    } catch {
      out[row.key] = null
    }
  }
  return out as T
}
