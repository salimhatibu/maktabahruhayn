import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { AFFILIATE_COOKIE, REGION_COOKIE } from "./lib/config"
import { regionFromCountry } from "./lib/region"

/**
 * Edge region detection. On Cloudflare, CF-IPCountry carries the visitor's
 * country; the region (and currency) is resolved from it on the server.
 * `?country=KE` overrides detection, which is handy for testing.
 */
export function middleware(request: NextRequest) {
  const override = request.nextUrl.searchParams.get("country")
  const existing = request.cookies.get(REGION_COOKIE)?.value
  const response = NextResponse.next()

  // Affiliate links (?ref=CODE) attribute the next order for 30 days.
  const ref = request.nextUrl.searchParams.get("ref")
  if (ref && /^[A-Za-z0-9_-]{3,24}$/.test(ref)) {
    response.cookies.set(AFFILIATE_COOKIE, ref.toUpperCase(), {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
    })
  }

  if (existing && !override) {
    return response
  }

  const detected =
    override ||
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-vercel-ip-country") ||
    "US"
  const region = regionFromCountry(detected)

  response.cookies.set(REGION_COOKIE, JSON.stringify(region), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })
  response.headers.set("x-maktabah-country", region.country)
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|static|favicon.ico).*)"],
}
