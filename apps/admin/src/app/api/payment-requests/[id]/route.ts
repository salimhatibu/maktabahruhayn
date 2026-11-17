import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"

/** DELETE /api/payment-requests/:id — remove an M-Pesa request from the list. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const result = await (await db()).prepare(`DELETE FROM payment_request WHERE id = ?1`).bind(id).run()
  if (!result.meta?.changes) {
    return NextResponse.json({ message: "Request not found." }, { status: 404 })
  }
  return NextResponse.json({ id, deleted: true })
}
