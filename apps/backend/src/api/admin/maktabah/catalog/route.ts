import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { CatalogProductInput } from "../../../../lib/catalog-editor"
import { saveCatalogProductWorkflow } from "../../../../workflows/save-catalog-product"
import type { CatalogProductBodyType } from "./validators"

/** GET /admin/maktabah/catalog?q=&view=all|published|draft|bundle&limit=&offset= */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const q = String(req.query.q || "").trim().toLowerCase()
  const view = String(req.query.view || req.query.type || "all")
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "status",
      "thumbnail",
      "metadata",
      "updated_at",
      "categories.name",
      "variants.id",
      "variants.manage_inventory",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.prices.price_list_id",
      "variants.inventory_items.inventory.location_levels.stocked_quantity",
      "book.author",
    ],
    pagination: { take: 1000, order: { updated_at: "DESC" } },
  })

  const all = data as Record<string, any>[]
  const counts = {
    all: all.length,
    published: all.filter((p) => p.status === "published").length,
    draft: all.filter((p) => p.status !== "published").length,
    bundle: all.filter((p) => p.metadata?.product_type === "bundle").length,
  }
  const rows = all
    .filter((p) =>
      view === "bundle"
        ? p.metadata?.product_type === "bundle"
        : view === "published"
          ? p.status === "published"
          : view === "draft"
            ? p.status !== "published"
            : true
    )
    .filter((p) =>
      q
        ? [p.title, p.handle, p.book?.author, String(p.metadata?.product_number || "")]
            .filter(Boolean)
            .some((s: string) => s.toLowerCase().includes(q))
        : true
    )
    .map((p) => {
      const kes = (p.variants || [])
        .flatMap((v: Record<string, any>) => v.prices || [])
        .filter((pr: { currency_code: string; price_list_id: string | null }) => pr.currency_code === "kes" && !pr.price_list_id)
        .map((pr: { amount: number }) => Number(pr.amount))
      const managed = (p.variants || []).some((v: { manage_inventory: boolean }) => v.manage_inventory)
      const stock = (p.variants || []).reduce(
        (n: number, v: Record<string, any>) =>
          n +
          (v.inventory_items?.[0]?.inventory?.location_levels || []).reduce(
            (m: number, l: { stocked_quantity: number }) => m + Number(l.stocked_quantity),
            0
          ),
        0
      )
      return {
        id: p.id,
        product_number: p.metadata?.product_number ?? null,
        title: p.title,
        author: p.book?.author || null,
        status: p.status,
        publish_at: p.metadata?.publish_at || null,
        thumbnail: p.thumbnail,
        product_type: p.metadata?.product_type || "standard",
        categories: (p.categories || []).map((c: { name: string }) => c.name),
        price_min: kes.length ? Math.min(...kes) : null,
        price_max: kes.length ? Math.max(...kes) : null,
        variants: (p.variants || []).length,
        stock: managed ? stock : null,
        updated_at: p.updated_at,
      }
    })

  rows.sort((a, b) => (Number(b.product_number) || 0) - (Number(a.product_number) || 0))
  res.json({ products: rows.slice(offset, offset + limit), count: rows.length, counts, limit, offset })
}

/** POST /admin/maktabah/catalog: create a product from the editor. */
export async function POST(req: MedusaRequest<CatalogProductBodyType>, res: MedusaResponse) {
  const { result } = await saveCatalogProductWorkflow(req.scope).run({
    input: req.validatedBody as CatalogProductInput,
  })
  res.status(201).json({ id: result.product_id })
}
