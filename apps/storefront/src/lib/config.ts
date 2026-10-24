/**
 * Next.js compiles every `process.env.NEXT_PUBLIC_*` reference into the bundle
 * while building, so such a value can never be changed afterwards. Settings
 * that must stay changeable read an unprefixed variable first - the Worker
 * copies its vars and secrets into `process.env` on each cold start - and fall
 * back to the build-time default in .env.production.
 *
 * They are functions because the Worker populates `process.env` after the
 * module graph is loaded, so a module-level constant would capture nothing.
 */

/** Canonical public origin, used for metadata and product URLs. */
export function siteUrl() {
  return (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/+$/,
    ""
  )
}

/** Read in the browser by the Stripe Elements form, so it stays build-time. */
export const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""

export const LOCALE_COOKIE = "mr_locale"
export const REGION_COOKIE = "mr_region"
export const CART_COOKIE = "mr_cart"
export const AUTH_COOKIE = "mr_jwt"
export const AFFILIATE_COOKIE = "mr_ref"
/** The order this browser just placed, so its confirmation page may show the details. */
export const LAST_ORDER_COOKIE = "mr_last_order"

/**
 * Images are served from the Worker's own static assets (`/catalog/...`) or
 * from R2, both already absolute or root-relative. Anything else is passed
 * through untouched.
 */
export function mediaUrl(url?: string | null): string | null {
  return url || null
}
