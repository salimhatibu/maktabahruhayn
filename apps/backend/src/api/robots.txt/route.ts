import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * GET /robots.txt
 *
 * This origin serves the API and the admin dashboard (/app), neither of which
 * belongs in a search index. The public storefront is a separate origin with
 * its own robots.txt, so nothing here points crawlers at the admin.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.setHeader("Cache-Control", "public, max-age=3600")
  res.send("User-agent: *\nDisallow: /\n")
}
