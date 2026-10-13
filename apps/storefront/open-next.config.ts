import { defineCloudflareConfig } from "@opennextjs/cloudflare"
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"

/**
 * Builds the storefront for Cloudflare Workers via OpenNext. Revalidated
 * pages (product listings, book pages) are cached in R2 through the
 * NEXT_INC_CACHE_R2_BUCKET binding declared in wrangler.jsonc.
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
