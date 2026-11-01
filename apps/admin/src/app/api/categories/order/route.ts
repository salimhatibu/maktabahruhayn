import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"

/**
 * POST /api/categories/order { ids } — writes the running order.
 *
 * Ranks are renumbered from zero across the whole list rather than swapped
 * pairwise, so an order stays correct even where several categories were
 * sharing a rank of 0, which is what every one of them starts at.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { ids?: unknown }
  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === "string") : []
  if (!ids.length) {
    return NextResponse.json({ message: "Send the categories in their new order." }, { status: 400 })
  }
  if (ids.length > 500) {
    return NextResponse.json({ message: "Too many categories in one go." }, { status: 400 })
  }

  const d = await db()
  const stmts = ids.map((id, index) =>
    d.prepare(`UPDATE category SET rank = ?1 WHERE id = ?2`).bind(index, id)
  )
  for (let i = 0; i < stmts.length; i += 50) {
    await d.batch(stmts.slice(i, i + 50))
  }

  return NextResponse.json({ ok: true, ordered: ids.length })
}
