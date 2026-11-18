import { NextResponse, type NextRequest } from "next/server"
import { finalizeMpesaCheckout, getMpesaCheckout, notifyOrder } from "@maktabah/db"
import { db } from "@/lib/db"
import { orderNotificationConfig } from "@/lib/order-notifications"

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
  const config = orderNotificationConfig()
  const notification = await notifyOrder(database, result.orderId, "order_placed", config)
  const digital = await notifyOrder(database, result.orderId, "digital_delivery", config)
  return NextResponse.json({ orderId: result.orderId, notificationError: notification.error || digital.error })
}
