import { NextResponse, type NextRequest } from "next/server"
import { applyPromotion } from "@/lib/cart"
import { LIMITS, throttle } from "@/lib/rate-limit"

/** A shareable link: /promo/CODE puts the code on the shopper's cart and opens it. */
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params
  const target = new URL("/cart", request.url)
  const clean = decodeURIComponent(code).trim().slice(0, 40)
  if (clean && !(await throttle("promo", LIMITS.promo.ip))) {
    try {
      const { applied } = await applyPromotion(clean)
      target.searchParams.set("promo", applied ? "applied" : "invalid")
    } catch (error) {
      console.error(error)
    }
  }
  return NextResponse.redirect(target)
}
