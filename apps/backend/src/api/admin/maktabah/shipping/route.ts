import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** GET /admin/maktabah/shipping: recent shipments, tracking, and options. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: fulfillments }, { data: options }, { data: zones }] = await Promise.all([
    query.graph({
      entity: "fulfillment",
      fields: [
        "id",
        "created_at",
        "shipped_at",
        "delivered_at",
        "canceled_at",
        "provider_id",
        "data",
        "metadata",
        "labels.*",
        "order.id",
        "order.display_id",
        "order.email",
        "delivery_address.country_code",
        "delivery_address.city",
      ],
      pagination: { take: 100, order: { created_at: "DESC" } },
    }),
    query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "price_type", "provider_id", "service_zone.name"],
    }),
    query.graph({ entity: "service_zone", fields: ["id", "name", "geo_zones.country_code"] }),
  ])

  res.json({
    shippo_configured: Boolean(process.env.SHIPPO_API_KEY),
    webhook_configured: Boolean(process.env.SHIPPO_WEBHOOK_SECRET),
    fulfillments,
    options,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      countries: ((z.geo_zones || []) as { country_code: string }[]).map((g) => g.country_code),
    })),
  })
}
