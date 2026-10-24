import { NextResponse, type NextRequest } from "next/server"
import { finalizePaidCart, mpesa, settlePayment } from "@maktabah/db"
import { db } from "@/lib/db"

/**
 * Safaricom's STK callback.
 *
 * Daraja cannot sign its callbacks, so the URL carries a shared secret
 * (DARAJA_CALLBACK_TOKEN) and nothing is accepted without it: otherwise anyone
 * could post a "paid" result for a checkout request. Past that check it
 * always answers 200, since a non-200 makes Safaricom resend a payment that
 * was already recorded; the row is keyed by the checkout request id, so a
 * replay updates the same row.
 *
 * A successful payment places the order here, so a shopper who closes the
 * page after entering their PIN still gets one.
 */
const accepted = () => NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" })

function sameSecret(a: string, b: string) {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  let diff = left.length ^ right.length
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return diff === 0
}

export async function POST(request: NextRequest) {
  const expected = process.env.DARAJA_CALLBACK_TOKEN || ""
  if (expected.length < 16) {
    console.error("M-Pesa callback refused: DARAJA_CALLBACK_TOKEN is not set (16+ characters).")
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Not configured" }, { status: 503 })
  }
  if (!sameSecret(request.nextUrl.searchParams.get("token") || "", expected)) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return accepted()
  }

  const callback = mpesa.parseCallback(body)
  if (!callback?.checkoutRequestId) {
    return accepted()
  }

  try {
    const database = await db()
    const paidMinor = Math.round(Number(callback.amount ?? 0) * 100)
    // Prompts the admin sent for phone and WhatsApp orders share this URL.
    await database
      .prepare(
        `UPDATE payment_request
            SET status = ?2, receipt = COALESCE(?3, receipt),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE checkout_id = ?1 AND status = 'pending'`
      )
      .bind(callback.checkoutRequestId, callback.resultCode === 0 ? "paid" : "failed", callback.receipt ?? null)
      .run()
    const pending = await settlePayment(database, {
      provider: "mpesa",
      reference: callback.checkoutRequestId,
      // Daraja uses 0 for success; everything else is a decline or timeout.
      status: callback.resultCode === 0 ? "captured" : "failed",
      raw: callback,
    })
    if (callback.resultCode === 0 && pending?.cartId) {
      const result = await finalizePaidCart(database, {
        cartId: pending.cartId,
        provider: "mpesa",
        reference: callback.checkoutRequestId,
        // What Safaricom says was paid, never more than what was asked for.
        paidMinor: Math.min(paidMinor, pending.amountMinor),
        currency: "kes",
      })
      if (!result.ok) {
        console.error("M-Pesa payment could not become an order", callback.checkoutRequestId, result)
      }
    }
  } catch (error) {
    console.error("M-Pesa callback could not be recorded", error)
  }

  return accepted()
}
