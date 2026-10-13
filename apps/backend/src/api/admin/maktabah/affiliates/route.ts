import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { convertAmount } from "../../../../lib/fx-rates"
import { ordersInRange } from "../../../../lib/reports"
import { AFFILIATE_MODULE } from "../../../../modules/affiliate"
import type AffiliateModuleService from "../../../../modules/affiliate/service"
import { STORE_SETTINGS_MODULE } from "../../../../modules/store-settings"
import type StoreSettingsModuleService from "../../../../modules/store-settings/service"
import { manageAffiliateWorkflow, type AffiliateInputBody } from "./types"

/** GET /admin/maktabah/affiliates: partners with orders and commission (last 365 days). */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const affiliates: AffiliateModuleService = req.scope.resolve(AFFILIATE_MODULE)
  const settings: StoreSettingsModuleService = req.scope.resolve(STORE_SETTINGS_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const reporting = (await settings.getSection("reporting")).currency

  const rows = await affiliates.listAffiliates({}, { order: { created_at: "DESC" } })
  const to = new Date()
  const orders = await ordersInRange(query, { from: new Date(to.getTime() - 365 * 86400000), to })

  const stats: Record<string, { orders: number; sales: number }> = {}
  for (const o of orders) {
    const code = String(o.metadata?.affiliate_code || "").toUpperCase()
    if (!code || o.status === "canceled") {
      continue
    }
    stats[code] ??= { orders: 0, sales: 0 }
    stats[code].orders += 1
    stats[code].sales += (await convertAmount(Number(o.total), o.currency_code, reporting)) ?? 0
  }

  res.json({
    currency: reporting,
    storefront_url: (process.env.STOREFRONT_URL || "http://localhost:3000").replace(/\/$/, ""),
    affiliates: rows.map((a) => {
      const s = stats[a.code] || { orders: 0, sales: 0 }
      return { ...a, orders: s.orders, sales: Math.round(s.sales * 100) / 100, commission: Math.round(s.sales * a.commission_percent) / 100 }
    }),
  })
}

/** POST /admin/maktabah/affiliates */
export async function POST(req: MedusaRequest<AffiliateInputBody>, res: MedusaResponse) {
  const { result } = await manageAffiliateWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ affiliate: result })
}
