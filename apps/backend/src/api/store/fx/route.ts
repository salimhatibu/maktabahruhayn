import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { FX_MODULE } from "../../../modules/fx"
import type FxModuleService from "../../../modules/fx/service"

/**
 * GET /store/fx?amount=10&from=USD&to=KES
 * Returns the USD-based rate snapshot and, when asked, one conversion.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const fx: FxModuleService = req.scope.resolve(FX_MODULE)
  const rates = await fx.getRates()

  const amount = req.query.amount ? Number(req.query.amount) : undefined
  const from = String(req.query.from || rates.base).toUpperCase().slice(0, 3)
  const to = String(req.query.to || "KES").toUpperCase().slice(0, 3)

  let converted: number | null = null
  if (typeof amount === "number" && Number.isFinite(amount)) {
    converted = await fx.convert(amount, from, to)
  }

  res.json({
    ...rates,
    conversion: converted === null ? null : { amount, from, to, converted },
  })
}
