/**
 * Next.js replaces every `process.env.NEXT_PUBLIC_*` reference with its value
 * while building, so a NEXT_PUBLIC_ setting can never be changed after the
 * bundle is built. The server-side settings below therefore read an unprefixed
 * variable first - the Cloudflare Worker copies its `vars` and secrets into
 * `process.env` on each cold start - and fall back to the build-time default
 * from .env.production. One build can then serve any environment, and the
 * publishable key need not be committed.
 *
 * They are functions because the Worker populates `process.env` after the
 * module graph is loaded, so a module-level constant would capture nothing.
 */
export function backendUrl() {
  return (
    process.env.MEDUSA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    "http://localhost:9000"
  ).replace(/\/+$/, "")
}

export function publishableKey() {
  return process.env.MEDUSA_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
}

/** Canonical public origin, used for metadata and product URLs. */
export function siteUrl() {
  return (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/+$/,
    ""
  )
}

/** Read in the browser by the Stripe Elements form, so it stays build-time. */
export const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""

export const REGION_COOKIE = "mr_region"
export const CART_COOKIE = "mr_cart"
export const AUTH_COOKIE = "mr_jwt"
export const AFFILIATE_COOKIE = "mr_ref"

/**
 * Backend-hosted media (the local file provider's /static) is proxied through
 * the storefront so it loads on any device that can reach the storefront.
 * Absolute URLs elsewhere (e.g. Cloudflare R2) are left as they are.
 */
export function mediaUrl(url?: string | null): string | null {
  if (!url) {
    return null
  }
  const prefix = `${backendUrl()}/static/`
  return url.startsWith(prefix) ? `/static/${url.slice(prefix.length)}` : url
}
