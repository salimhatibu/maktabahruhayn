import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { AFFILIATE_COOKIE, LOCALE_COOKIE, REGION_COOKIE } from "./lib/config"
import { manualRegion, parseRegionCookie, regionFromCountry } from "./lib/region"

const SUPPORTED_LOCALES = ["en", "ar", "fr"]

function detectLocale(accept: string | null): string {
  if (!accept) return "en"
  const langs = accept
    .split(",")
    .slice(0, 20)
    .map((part) => {
      const [lang, q] = part.trim().split(";q=")
      return { lang: lang.split("-")[0].toLowerCase(), q: q ? parseFloat(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)
  for (const { lang } of langs) {
    if (SUPPORTED_LOCALES.includes(lang)) return lang
  }
  return "en"
}

/**
 * Content Security Policy with a fresh nonce per request. Next.js reads the
 * nonce from this request header and stamps it on its own scripts; with
 * 'strict-dynamic' those may load what they need (Stripe.js), and nothing
 * else runs. Development skips it: hot reload relies on eval.
 */
function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://*.stripe.com",
    "frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join("; ")
}

type CookieWrite = { name: string; value: string; httpOnly?: boolean; maxAge: number }

/**
 * Locale, affiliate attribution and region (from CF-IPCountry), set on the
 * request as well as the response so the page being rendered already uses
 * them - a first visit is priced in the visitor's currency, not USD.
 */
export function middleware(request: NextRequest) {
  const writes: CookieWrite[] = []

  if (!request.cookies.get(LOCALE_COOKIE)?.value) {
    const langOverride = request.nextUrl.searchParams.get("lang")
    const locale =
      langOverride && SUPPORTED_LOCALES.includes(langOverride)
        ? langOverride
        : detectLocale(request.headers.get("accept-language"))
    writes.push({ name: LOCALE_COOKIE, value: locale, maxAge: 60 * 60 * 24 * 365 })
  }

  // Affiliate links (?ref=CODE) attribute the next order for 30 days.
  const ref = request.nextUrl.searchParams.get("ref")
  if (ref && /^[A-Za-z0-9_-]{3,24}$/.test(ref)) {
    writes.push({ name: AFFILIATE_COOKIE, value: ref.toUpperCase(), httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
  }

  // A country the shopper chose (picker, delivery address or ?country=) is
  // kept. Only a detected one follows the visitor when their IP country
  // changes, e.g. they travel.
  const existing = request.cookies.get(REGION_COOKIE)?.value
  const previous = existing ? parseRegionCookie(existing) : null
  const override = request.nextUrl.searchParams.get("country")
  const detected = request.headers.get("cf-ipcountry") || request.headers.get("x-vercel-ip-country") || null
  let next: { country: string; manual?: boolean } | null = null
  if (override) {
    next = manualRegion(override)
  } else if (!previous) {
    next = regionFromCountry(detected || "US")
  } else if (!previous.manual && detected && regionFromCountry(detected).country !== previous.country) {
    next = regionFromCountry(detected)
  }
  if (next && (!previous || next.country !== previous.country || Boolean(next.manual) !== Boolean(previous.manual))) {
    writes.push({ name: REGION_COOKIE, value: JSON.stringify(next), maxAge: 60 * 60 * 24 * 30 })
  }

  for (const write of writes) {
    // nosemgrep: cookies-default-koa — request-forwarding only; response cookie at line 108 sets sameSite:"lax"
    request.cookies.set(write.name, write.value)
  }
  const requestHeaders = new Headers(request.headers)

  const production = process.env.NODE_ENV === "production"
  let csp: string | null = null
  if (production) {
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    csp = contentSecurityPolicy(nonce)
    requestHeaders.set("x-nonce", nonce)
    requestHeaders.set("content-security-policy", csp)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  for (const write of writes) {
    response.cookies.set(write.name, write.value, {
      path: "/",
      sameSite: "lax",
      secure: production,
      httpOnly: Boolean(write.httpOnly),
      maxAge: write.maxAge,
    })
  }
  if (next) {
    response.headers.set("x-maktabah-country", next.country)
  }
  if (csp) {
    response.headers.set("Content-Security-Policy", csp)
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|static|favicon.ico).*)"],
}
