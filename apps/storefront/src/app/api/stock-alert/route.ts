import { NextResponse, type NextRequest } from "next/server"
import { newId } from "@maktabah/db"
import { db } from "@/lib/db"
import { LIMITS, throttle } from "@/lib/rate-limit"

const EMAIL = /^[^@\s<>"]{1,64}@[^@\s<>"]{1,190}\.[^@\s<>".]{2,}$/

export async function POST(request: NextRequest) {
  let body: { product_id?: unknown; variant_id?: unknown; email?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: "Send a JSON body." }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const productId = typeof body.product_id === "string" ? body.product_id.slice(0, 100) : ""
  const variantId = typeof body.variant_id === "string" && body.variant_id ? body.variant_id.slice(0, 100) : null
  if (!productId || !EMAIL.test(email)) {
    return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 })
  }

  const limited = await throttle("stock_alert", LIMITS.stockAlert.ip)
  if (limited) {
    return NextResponse.json({ message: limited }, { status: 429 })
  }

  const d1 = await db()
  // Only a book that is on the shelf, and one of its own editions.
  const product = await d1
    .prepare(
      `SELECT p.id FROM product p
        WHERE p.id = ?1 AND p.status = 'published' AND p.deleted_at IS NULL
          AND (?2 IS NULL OR EXISTS (SELECT 1 FROM variant v WHERE v.id = ?2 AND v.product_id = p.id))`
    )
    .bind(productId, variantId)
    .first()
  if (!product) {
    return NextResponse.json({ message: "That book is not available." }, { status: 404 })
  }

  const existing = await d1
    .prepare(
      `SELECT id FROM stock_alert
       WHERE product_id = ?1 AND COALESCE(variant_id,'') = COALESCE(?2,'')
         AND email = ?3 COLLATE NOCASE AND status = 'waiting'`
    )
    .bind(productId, variantId, email)
    .first()

  if (existing) {
    return NextResponse.json({ subscribed: true, message: "You're already on the list." })
  }

  await d1
    .prepare(
      `INSERT INTO stock_alert (id, product_id, variant_id, email)
       VALUES (?1, ?2, ?3, ?4)`
    )
    .bind(newId("sa"), productId, variantId, email)
    .run()

  return NextResponse.json({ subscribed: true, message: "We'll email you when it's back in stock." })
}
