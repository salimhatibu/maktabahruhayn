import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"

/** POST /api/reviews/:id { status } — approve or reject. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json()) as { status?: string }
  if (!["approved", "rejected", "pending"].includes(String(body.status))) {
    return NextResponse.json({ message: "status must be approved, rejected or pending." }, { status: 400 })
  }
  await (await db()).prepare(`UPDATE review SET status = ?2 WHERE id = ?1`).bind(id, body.status).run()
  return NextResponse.json({ id, status: body.status })
}

/** DELETE /api/reviews/:id */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  await (await db()).prepare(`DELETE FROM review WHERE id = ?1`).bind(id).run()
  return NextResponse.json({ id, deleted: true })
}
