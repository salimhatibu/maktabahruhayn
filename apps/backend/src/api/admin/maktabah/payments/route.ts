import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ordersInRange } from "../../../../lib/reports"

/** GET /admin/maktabah/payments?from=&to=: payments across orders. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const to = req.query.to ? new Date(String(req.query.to)) : new Date()
  to.setHours(23, 59, 59, 999)
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(to.getTime() - 29 * 86400000)
  from.setHours(0, 0, 0, 0)

  const orders = await ordersInRange(query, { from, to })
  const payments = orders.flatMap((o) =>
    (o.payment_collections || []).flatMap((pc) =>
      (pc.payments || []).map((p) => ({
        order_id: o.id,
        display_id: o.display_id,
        email: o.email,
        created_at: o.created_at,
        provider_id: p.provider_id,
        amount: Number(p.amount),
        currency_code: p.currency_code,
        captured: Boolean(p.captured_at),
        refunded: (p.refunds || []).reduce((n, r) => n + Number(r.amount), 0),
        order_payment_status: o.payment_status,
      }))
    )
  )
  const totals: Record<string, { provider_id: string; currency_code: string; captured: number; pending: number; refunded: number; count: number }> = {}
  for (const p of payments) {
    const key = `${p.provider_id}|${p.currency_code}`
    totals[key] ??= { provider_id: p.provider_id, currency_code: p.currency_code, captured: 0, pending: 0, refunded: 0, count: 0 }
    totals[key].count += 1
    totals[key].refunded += p.refunded
    if (p.captured) {
      totals[key].captured += p.amount
    } else {
      totals[key].pending += p.amount
    }
  }
  res.json({
    payments,
    totals: Object.values(totals),
    providers: {
      stripe: Boolean(process.env.STRIPE_API_KEY),
      mpesa: Boolean(process.env.DARAJA_CONSUMER_KEY && process.env.DARAJA_SHORTCODE),
    },
  })
}
