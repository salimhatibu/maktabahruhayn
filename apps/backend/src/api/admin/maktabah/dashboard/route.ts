import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { buildDashboard } from "../../../../lib/reports"
import { STORE_SETTINGS_MODULE } from "../../../../modules/store-settings"
import type StoreSettingsModuleService from "../../../../modules/store-settings/service"

function parseDate(value: unknown, fallback: Date) {
  const d = typeof value === "string" ? new Date(value) : fallback
  return Number.isNaN(d.getTime()) ? fallback : d
}

/** GET /admin/maktabah/dashboard?from=2026-09-11&to=2026-10-10&currency=kes */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const settings: StoreSettingsModuleService = req.scope.resolve(STORE_SETTINGS_MODULE)
  const reporting = (await settings.getSection("reporting")).currency

  const to = parseDate(req.query.to, new Date())
  to.setHours(23, 59, 59, 999)
  const from = parseDate(req.query.from, new Date(to.getTime() - 29 * 86400000))
  from.setHours(0, 0, 0, 0)
  const currency = typeof req.query.currency === "string" ? req.query.currency.toLowerCase().slice(0, 3) : reporting

  res.json(await buildDashboard(query, { from, to }, currency))
}
