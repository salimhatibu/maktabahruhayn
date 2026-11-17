import { NextResponse, type NextRequest } from "next/server"
import { finalizeMpesaCheckout, getMpesaCheckout, notifyOrder } from "@maktabah/db"
import { db } from "@/lib/db"

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const database = await db()
  const attempt = await getMpesaCheckout(database, id)
  if (!attempt || attempt.status !== "confirmed") {
    return NextResponse.json({ message: "Only a callback-confirmed payment can be retried." }, { status: 409 })
  }
  const result = await finalizeMpesaCheckout(database, id)
  if (!result.ok) {
    return NextResponse.json({ message: `Order creation still needs review: ${result.reason}.` }, { status: 409 })
  }
  const notification = await notifyOrder(database, result.orderId, "order_placed", {
    endpoint: process.env.EMAIL_API_URL,
    token: process.env.EMAIL_API_KEY,
    from: process.env.SMTP_FROM,
    storeUrl: process.env.STOREFRONT_URL,
  })
  return NextResponse.json({ orderId: result.orderId, notificationError: notification.error })
}
