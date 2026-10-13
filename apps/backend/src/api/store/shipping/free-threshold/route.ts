import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRICED_CURRENCIES } from "../../../../lib/currency-regions"
import { getFreeShippingThreshold } from "../../../../modules/shippo/free-shipping"

/**
 * GET /store/shipping/free-threshold[?currency=gbp]
 * Free standard shipping thresholds per currency (major units). The Shippo
 * provider prices the postal option at zero once the item subtotal reaches it.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const requested = typeof req.query.currency === "string" ? [req.query.currency.toLowerCase()] : PRICED_CURRENCIES
  const entries = await Promise.all(
    requested.map(async (c) => [c, await getFreeShippingThreshold(c)] as const)
  )
  res.json({ thresholds: Object.fromEntries(entries) })
}
