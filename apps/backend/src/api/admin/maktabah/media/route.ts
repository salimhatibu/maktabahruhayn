import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** GET /admin/maktabah/media: images already used by products (the "Browse existing" library). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["title", "images.url", "updated_at"],
    pagination: { take: 1000, order: { updated_at: "DESC" } },
  })
  const seen = new Set<string>()
  const images: { url: string; product: string }[] = []
  for (const p of data as { title: string; images?: { url: string }[] }[]) {
    for (const i of p.images || []) {
      if (!seen.has(i.url)) {
        seen.add(i.url)
        images.push({ url: i.url, product: p.title })
      }
    }
  }
  res.json({ images })
}
