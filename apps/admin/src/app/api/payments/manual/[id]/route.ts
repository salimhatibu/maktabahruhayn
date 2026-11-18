import { NextResponse, type NextRequest } from "next/server"
import { finalizePaidCart, notifyOrder } from "@maktabah/db"
import { db } from "@/lib/db"
import { orderNotificationConfig } from "@/lib/order-notifications"

type ManualPayment = {
  id: string
  cart_id: string | null
  reference: string | null
  status: string
  amount_minor: number
  currency_code: string
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let action: unknown
  try {
    action = (await request.json()).action
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 })
  }
  if (action !== "verify" && action !== "reject") {
    return NextResponse.json({ message: "Choose whether to verify or reject this payment." }, { status: 400 })
  }

  const database = await db()
  const payment = await database
    .prepare(
      `SELECT id, cart_id, reference, status, amount_minor, currency_code
         FROM payment
        WHERE id = ?1 AND provider = 'manual' AND order_id IS NULL`
    )
    .bind(id)
    .first<ManualPayment>()
  if (!payment || !payment.cart_id || !payment.reference) {
    return NextResponse.json({ message: "Manual payment submission not found." }, { status: 404 })
  }

  if (action === "reject") {
    if (payment.status !== "pending") {
      return NextResponse.json({ message: "This submission has already been reviewed." }, { status: 409 })
    }
    const updated = await database
      .prepare(
        `UPDATE payment
            SET status = 'failed',
                raw = json_set(COALESCE(raw, '{}'), '$.reviewStatus', 'rejected',
                               '$.reviewedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?1 AND status = 'pending'`
      )
      .bind(id)
      .run()
    if (!updated.meta?.changes) {
      return NextResponse.json({ message: "This submission was reviewed by another admin." }, { status: 409 })
    }
    return NextResponse.json({ id, status: "rejected" })
  }

  if (payment.status === "pending") {
    const updated = await database
      .prepare(
        `UPDATE payment
            SET status = 'captured',
                raw = json_set(COALESCE(raw, '{}'), '$.reviewStatus', 'verified',
                               '$.reviewedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?1 AND status = 'pending' AND order_id IS NULL`
      )
      .bind(id)
      .run()
    if (!updated.meta?.changes) {
      return NextResponse.json({ message: "This submission was reviewed by another admin." }, { status: 409 })
    }
  } else if (payment.status !== "captured") {
    return NextResponse.json({ message: "This submission is no longer awaiting verification." }, { status: 409 })
  }

  const releaseReview = () =>
    database
      .prepare(
        `UPDATE payment
            SET status = 'pending',
                raw = json_remove(COALESCE(raw, '{}'), '$.reviewStatus', '$.reviewedAt'),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ?1 AND status = 'captured' AND order_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM cart WHERE id = ?2 AND completed_order_id IS NOT NULL)`
      )
      .bind(id, payment.cart_id)
      .run()

  let result: Awaited<ReturnType<typeof finalizePaidCart>>
  try {
    result = await finalizePaidCart(database, {
      cartId: payment.cart_id,
      provider: "manual",
      reference: payment.reference,
      paidMinor: Number(payment.amount_minor),
      currency: payment.currency_code,
    })
  } catch (error) {
    await releaseReview()
    throw error
  }
  if (!result.ok) {
    await releaseReview()
    return NextResponse.json(
      {
        message: "The order could not be created, so the submission remains available for review. Check that the cart still matches the submitted amount.",
        reason: result.reason,
      },
      { status: 409 }
    )
  }
  const config = orderNotificationConfig()
  const notification = await notifyOrder(database, result.orderId, "order_placed", config)
  const digital = await notifyOrder(database, result.orderId, "digital_delivery", config)
  return NextResponse.json({ id, status: "verified", orderId: result.orderId, displayId: result.displayId, notificationError: notification.error || digital.error })
}
