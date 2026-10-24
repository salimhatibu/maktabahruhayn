import { NextResponse, type NextRequest } from "next/server"
import { convert, getFxRates, toMajor } from "@maktabah/db"
import { csvRow } from "@/lib/csv"
import { db } from "@/lib/db"
import { saveCatalogProduct, type CatalogProductInput } from "@/lib/catalog-save"
import { deleteUnusedMedia } from "@/lib/media"

/**
 * GET /api/catalog?q=&view=all|published|draft|bundle&limit=&offset=
 *
 * The product list behind the Products page, returning the same rows the
 * previous admin's /admin/maktabah/catalog endpoint did: a KES price range,
 * total stock, categories and the merchandising fields.
 */
type CatalogRow = {
  id: string
  product_number: number | null
  title: string
  handle: string
  status: string
  publish_at: string | null
  thumbnail: string | null
  product_type: string
  updated_at: string
  author: string | null
  categories: string | null
  variants: number
  price_min: number | null
  price_max: number | null
  base_min: number | null
  base_max: number | null
  stock: number
  managed: number
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get("q") || "").trim().toLowerCase()
  const view = params.get("view") || "all"
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 200)
  const offset = Math.max(Number(params.get("offset")) || 0, 0)
  const database = await db()

  const { results } = await database
    .prepare(
      `SELECT p.id, p.product_number, p.title, p.handle, p.status, p.publish_at, p.thumbnail,
              p.product_type, p.updated_at,
              b.author,
              (SELECT group_concat(c.name, '|') FROM product_category pc
                 JOIN category c ON c.id = pc.category_id WHERE pc.product_id = p.id) AS categories,
              (SELECT COUNT(*) FROM variant WHERE product_id = p.id) AS variants,
              (SELECT MIN(amount_minor) FROM variant_price vp JOIN variant v ON v.id = vp.variant_id
                WHERE v.product_id = p.id AND vp.kind = 'base' AND vp.currency_code = 'kes') AS price_min,
              (SELECT MAX(amount_minor) FROM variant_price vp JOIN variant v ON v.id = vp.variant_id
                WHERE v.product_id = p.id AND vp.kind = 'base' AND vp.currency_code = 'kes') AS price_max,
              (SELECT MIN(amount_minor) FROM variant_price vp JOIN variant v ON v.id = vp.variant_id
                WHERE v.product_id = p.id AND vp.kind = 'base' AND vp.currency_code = 'usd') AS base_min,
              (SELECT MAX(amount_minor) FROM variant_price vp JOIN variant v ON v.id = vp.variant_id
                WHERE v.product_id = p.id AND vp.kind = 'base' AND vp.currency_code = 'usd') AS base_max,
              (SELECT COALESCE(SUM(il.stocked_quantity), 0) FROM inventory_level il
                 JOIN variant v ON v.id = il.variant_id WHERE v.product_id = p.id) AS stock,
              (SELECT COUNT(*) FROM variant WHERE product_id = p.id AND manage_inventory = 1) AS managed
         FROM product p LEFT JOIN book b ON b.product_id = p.id
        WHERE p.deleted_at IS NULL
        ORDER BY p.product_number DESC`
    )
    .all<CatalogRow>()

  // A book priced only in the base currency still shows a price here, so the
  // list is never a column of dashes.
  const rates = await getFxRates(database)
  const inKes = (kes: number | null, base: number | null) =>
    kes !== null ? toMajor(kes) : base === null ? null : toMajor(convert(base, "kes", rates))

  const all = results.map((row) => ({
    id: row.id,
    product_number: row.product_number,
    title: row.title,
    handle: row.handle,
    author: row.author,
    status: row.status,
    publish_at: row.publish_at,
    thumbnail: row.thumbnail,
    product_type: row.product_type,
    categories: row.categories ? String(row.categories).split("|") : [],
    // The list quotes KES in major units, as the previous admin did.
    price_min: inKes(row.price_min, row.base_min),
    price_max: inKes(row.price_max, row.base_max),
    variants: row.variants,
    stock: row.managed ? row.stock : null,
    updated_at: row.updated_at,
  }))

  if (params.get("format") === "csv") {
    const header = csvRow(["product_number", "title", "author", "handle", "status", "type", "categories", "price_kes_min", "price_kes_max", "stock", "updated_at"])
    const lines = all.map((p) =>
      csvRow([
        p.product_number,
        p.title,
        p.author,
        p.handle,
        p.status,
        p.product_type,
        p.categories.join("; "),
        p.price_min,
        p.price_max,
        p.stock ?? "",
        p.updated_at,
      ])
    )
    return new NextResponse([header, ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const counts = {
    all: all.length,
    published: all.filter((p) => p.status === "published").length,
    draft: all.filter((p) => p.status !== "published").length,
    bundle: all.filter((p) => p.product_type === "bundle").length,
  }

  const rows = all
    .filter((p) =>
      view === "bundle"
        ? p.product_type === "bundle"
        : view === "published"
          ? p.status === "published"
          : view === "draft"
            ? p.status !== "published"
            : true
    )
    .filter((p) =>
      q
        ? [p.title, p.handle, p.author, String(p.product_number ?? "")]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(q))
        : true
    )

  return NextResponse.json({
    products: rows.slice(offset, offset + limit),
    count: rows.length,
    counts,
    limit,
    offset,
  })
}

/** POST /api/catalog — creates a product from the editor. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as CatalogProductInput
  try {
    const id = await saveCatalogProduct(await db(), { ...body, id: undefined })
    return NextResponse.json({ id }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 })
  }
}

/** DELETE /api/catalog — bulk-deletes products by id. */
export async function DELETE(request: NextRequest) {
  const { ids } = (await request.json()) as { ids: string[] }
  if (!Array.isArray(ids) || !ids.length) {
    return NextResponse.json({ message: "ids is required" }, { status: 400 })
  }
  const database = await db()

  const owned = await database
    .prepare(
      `SELECT url FROM product_image WHERE product_id IN (${ids.map(() => "?").join(",")})
        UNION SELECT thumbnail FROM product WHERE id IN (${ids.map(() => "?").join(",")}) AND thumbnail IS NOT NULL`
    )
    .bind(...ids, ...ids)
    .all<{ url: string }>()

  const stmts = ids.flatMap((id) => [
    database
      .prepare(
        `UPDATE inventory_level SET reserved_quantity = 0, version = version + 1
          WHERE variant_id IN (SELECT id FROM variant WHERE product_id = ?1)`
      )
      .bind(id),
    database.prepare(`DELETE FROM product WHERE id = ?1`).bind(id),
  ])
  await database.batch(stmts)

  await deleteUnusedMedia(
    database,
    owned.results.map((row) => row.url).filter(Boolean)
  )
  return NextResponse.json({ deleted: ids.length })
}
