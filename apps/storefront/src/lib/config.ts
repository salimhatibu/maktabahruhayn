export const backendUrl =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

export const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

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
  const prefix = `${backendUrl.replace(/\/$/, "")}/static/`
  return url.startsWith(prefix) ? `/static/${url.slice(prefix.length)}` : url
}
