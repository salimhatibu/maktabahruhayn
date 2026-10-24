import { NextResponse, type NextRequest } from "next/server"
import { finalizePaidCart, settlePayment, stripe } from "@maktabah/db"
import { db } from "@/lib/db"
import { stripeConfig } from "@/lib/payments"

/**
 * Stripe webhook.
 *
 * The signature is checked against the raw body: parsing it first and
 * re-serialising would change the bytes and fail every time. An unsigned or
 * stale request is refused outright, since anyone can POST here.
 *
 * A succeeded intent places the order here, so a shopper who closes the tab
 * after paying still gets one. The amount comes from the signed event.
 */
type IntentEvent = {
  type: string
  data: { object: { id: string; amount?: number; amount_received?: number; currency?: string } }
}

export async function POST(request: NextRequest) {
  const config = stripeConfig()
  if (!config?.webhookSecret) {
    return NextResponse.json({ error: "Stripe webhooks are not configured." }, { status: 503 })
  }

  const raw = await request.text()
  const valid = await stripe.verifyWebhook(config.webhookSecret, raw, request.headers.get("stripe-signature"))
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 })
  }

  let event: IntentEvent
  try {
    event = JSON.parse(raw) as IntentEvent
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 })
  }
  const intent = event.data?.object
  const succeeded = event.type === "payment_intent.succeeded"

  if (intent?.id && (succeeded || event.type === "payment_intent.payment_failed")) {
    const database = await db()
    const pending = await settlePayment(database, {
      provider: "stripe",
      reference: intent.id,
      status: succeeded ? "captured" : "failed",
      raw: event,
    })
    if (succeeded && pending?.cartId && intent.currency) {
      const result = await finalizePaidCart(database, {
        cartId: pending.cartId,
        provider: "stripe",
        reference: intent.id,
        paidMinor: stripe.fromStripeAmount(Number(intent.amount_received ?? intent.amount ?? 0), intent.currency),
        currency: intent.currency,
      })
      if (!result.ok) {
        console.error("Stripe payment could not become an order", intent.id, result)
        // Another request is placing this order right now: let Stripe retry.
        if (result.reason === "conflict") {
          return NextResponse.json({ error: "Busy, retry." }, { status: 500 })
        }
      }
    }
  }

  // Anything else is acknowledged so Stripe stops retrying it.
  return NextResponse.json({ received: true })
}
