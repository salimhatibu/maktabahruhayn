import { NextResponse, type NextRequest } from "next/server"
import { toMajor } from "@maktabah/db"
import { db } from "@/lib/db"

/**
 * GET /api/stock?q=&max=   the Stock view's inline list
 * POST /api/stock          { variant_id, location_id, stocked_quantity }
 *
 * Editing stock here writes the shelf count directly, which is what a stock
 * take is. Reservations are left alone: they belong to orders in flight.
 */
type StockRow = {
  variant_id: string
  variant_title: string
  system_sku: string
  custom_sku: string | null
  low_stock_threshold: number | null
  manage_inventory: number
  product_id: string
  product_title: string
  thumbnail: string | null
  location_id: string | null
  location_name: string | null
  stocked_quantity: number | null
  reserved_quantity: number | null
  price: number | null
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const q = (params.get("q") || "").trim().toLowerCase()
  const max = params.get("max") ? Number(params.get("max")) : null
  const lowOnly = params.get("low") === "1"
  const database = await db()

  const { results } = await database
    .prepare(
      `SELECT v.id AS variant_id, v.title AS variant_title, v.system_sku, v.custom_sku,
              v.low_stock_threshold, v.manage_inventory,
              p.id AS product_id, p.title AS product_title, p.thumbnail,
              il.location_id, il.stocked_quantity, il.reserved_quantity,
              (SELECT name FROM stock_location WHERE id = il.location_id) AS location_name,
              (SELECT amount_minor FROM variant_price WHERE variant_id = v.id AND kind = 'base' AND currency_code = 'kes') AS price
         FROM variant v
         JOIN product p ON p.id = v.product_id
         LEFT JOIN inventory_level il ON il.variant_id = v.id
        WHERE p.deleted_at IS NULL AND v.manage_inventory = 1
        ORDER BY p.product_number DESC, v.rank`
    )
    .all<StockRow>()

  const rows = results
    .filter((row) => (q ? `${row.product_title} ${row.variant_title} ${row.custom_sku || row.system_sku}`.toLowerCase().includes(q) : true))
    .filter((row) => (max === null ? true : Number(row.stocked_quantity || 0) <= max))
    .filter((row) => {
      if (!lowOnly) return true
      const available = Number(row.stocked_quantity || 0) - Number(row.reserved_quantity || 0)
      const threshold = row.low_stock_threshold ?? 5
      return available <= threshold
    })
    .map((row) => ({
      variant_id: row.variant_id,
      product_id: row.product_id,
      product_title: row.product_title,
      variant_title: row.variant_title,
      sku: row.custom_sku || row.system_sku,
      thumbnail: row.thumbnail,
      location_id: row.location_id,
      location_name: row.location_name,
      stocked_quantity: Number(row.stocked_quantity || 0),
      reserved_quantity: Number(row.reserved_quantity || 0),
      low_stock_threshold: row.low_stock_threshold,
      price: row.price === null ? null : toMajor(row.price),
    }))

  return NextResponse.json({ stock: rows, count: rows.length })
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    variant_id?: string
    location_id?: string
    stocked_quantity?: number
  }
  if (!body.variant_id || !body.location_id || typeof body.stocked_quantity !== "number") {
    return NextResponse.json({ message: "variant_id, location_id and stocked_quantity are required." }, { status: 400 })
  }
  const quantity = Math.max(0, Math.round(body.stocked_quantity))

  await (await db())
    .prepare(
      `INSERT INTO inventory_level (variant_id, location_id, stocked_quantity)
       VALUES (?1, ?2, ?3)
       ON CONFLICT (variant_id, location_id) DO UPDATE SET
         stocked_quantity = excluded.stocked_quantity,
         version = version + 1`
    )
    .bind(body.variant_id, body.location_id, quantity)
    .run()

  return NextResponse.json({ variant_id: body.variant_id, stocked_quantity: quantity })
}
