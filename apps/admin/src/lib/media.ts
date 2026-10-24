import { getCloudflareContext } from "@opennextjs/cloudflare"
import type { D1 } from "@maktabah/db"

type MediaBucket = { delete(keys: string | string[]): Promise<unknown> }

/**
 * The key an uploaded file has in the bucket. Anything not served from
 * R2_PUBLIC_URL was not uploaded here - a seeded cover under /catalog, or an
 * external image - and is left alone.
 */
export function mediaKey(url: string): string | null {
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "")
  if (!base || !url.startsWith(`${base}/`)) {
    return null
  }
  const key = url.slice(base.length + 1).split("?")[0]
  return key ? decodeURIComponent(key) : null
}

/**
 * Removes a deleted product's images from the bucket, keeping any that
 * another product still shows. Returns how many were deleted.
 */
export async function deleteUnusedMedia(db: D1, urls: string[]): Promise<number> {
  const keyed = new Map<string, string>()
  for (const url of new Set(urls)) {
    const key = mediaKey(url)
    if (key) {
      keyed.set(url, key)
    }
  }
  if (!keyed.size) {
    return 0
  }

  const { results } = await db
    .prepare(
      `SELECT url FROM product_image
        UNION SELECT thumbnail FROM product WHERE thumbnail IS NOT NULL
        UNION SELECT sample_pdf_url FROM book WHERE sample_pdf_url IS NOT NULL`
    )
    .all<{ url: string }>()
  const stillUsed = new Set(results.map((row) => row.url))

  const orphans = [...keyed.entries()].filter(([url]) => !stillUsed.has(url))
  if (!orphans.length) {
    return 0
  }

  const { env } = await getCloudflareContext({ async: true })
  const bucket = (env as unknown as { MEDIA?: MediaBucket }).MEDIA
  if (!bucket) {
    return 0
  }
  await bucket.delete(orphans.map(([, key]) => key))
  return orphans.length
}
