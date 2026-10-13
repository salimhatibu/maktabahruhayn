import { NextResponse, type NextRequest } from "next/server"
import { completeCart } from "@/lib/cart"

/**
 * Stripe sends shoppers here after redirect-based confirmation (some 3D
 * Secure flows, bank redirects). The webhook also completes the cart, so this
 * simply tries to finish and routes the shopper to the right page.
 */
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("redirect_status")
  if (status && status !== "succeeded" && status !== "processing") {
    return NextResponse.redirect(new URL("/checkout?step=delivery&payment=failed", request.url))
  }
  const result = await completeCart()
  if (result.type === "order") {
    return NextResponse.redirect(new URL(`/checkout/complete?order=${result.orderId}`, request.url))
  }
  return NextResponse.redirect(new URL("/checkout?step=delivery&payment=pending", request.url))
}
