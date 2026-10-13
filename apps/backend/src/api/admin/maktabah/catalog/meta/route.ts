import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MERCHANDISING_TAGS, SHIPPING_SIZES } from "../../../../../lib/catalog-editor"
import { STORE_SETTINGS_MODULE } from "../../../../../modules/store-settings"
import type StoreSettingsModuleService from "../../../../../modules/store-settings/service"

/** GET /admin/maktabah/catalog/meta: locations, categories, units, presets, bundle candidates. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const settings: StoreSettingsModuleService = req.scope.resolve(STORE_SETTINGS_MODULE)
  const [{ data: locations }, { data: categories }, { data: products }, catalog] = await Promise.all([
    query.graph({ entity: "stock_location", fields: ["id", "name"] }),
    query.graph({ entity: "product_category", fields: ["id", "name", "handle", "parent_category_id"] }),
    query.graph({ entity: "product", fields: ["id", "title", "thumbnail"], pagination: { take: 1000 } }),
    settings.getSection("catalog"),
  ])
  res.json({
    locations,
    categories: (categories as { name: string }[]).sort((a, b) => a.name.localeCompare(b.name)),
    products: (products as { title: string }[]).sort((a, b) => a.title.localeCompare(b.title)),
    catalog,
    tags: MERCHANDISING_TAGS,
    shipping_sizes: Object.entries(SHIPPING_SIZES).map(([value, s]) => ({ value, ...s })),
    storefront_url: (process.env.STOREFRONT_URL || "http://localhost:3000").replace(/\/$/, ""),
  })
}
