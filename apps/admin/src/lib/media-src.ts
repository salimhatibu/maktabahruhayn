/**
 * Resolves a stored media URL for display in the admin.
 *
 * Covers that came with the catalogue are stored as storefront-relative paths
 * ("/catalog/03-1.webp"), which only the storefront serves - the admin runs on
 * its own hostname, so rendering them as-is gives a broken image. Uploads go to
 * R2 and are already absolute, as are external images, and those are untouched.
 *
 * The stored value is never rewritten: this is for the `src` attribute only, so
 * a product saved from the editor keeps the relative path it came with.
 */
export function mediaSrc(url: string | null | undefined): string {
  if (!url) {
    return ""
  }
  if (!url.startsWith("/") || url.startsWith("//")) {
    return url
  }
  const base = storefrontBase()
  return base ? `${base}${url}` : url
}

function storefrontBase(): string {
  if (typeof document === "undefined") {
    return (process.env.STOREFRONT_URL || "").replace(/\/+$/, "")
  }
  const tag = document.querySelector('meta[name="storefront-url"]')
  return (tag?.getAttribute("content") || "").replace(/\/+$/, "")
}
