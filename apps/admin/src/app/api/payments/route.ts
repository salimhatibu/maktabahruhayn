import { NextResponse, type NextRequest } from "next/server"
import { toMajor } from "@maktabah/db"
import { db } from "@/lib/db"

type PaymentRow = {
  id: string
  order_id: string | null
  display_id: number | null
  email: string | null
  created_at: string
  provider: string
  status: string
  amount_minor: number
  currency_code: string
  reference: string | null
  order_payment_status: string | null
}

/**
 * GET /api/payments?from=&to= — payments across orders, with totals per
 * provider and currency, and which gateways are actually configured.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const to = params.get("to") ? new Date(`${params.get("to")}T23:59:59.999Z`) : new Date()
  const from = params.get("from")
    ? new Date(`${params.get("from")}T00:00:00.000Z`)
    : new Date(to.getTime() - 29 * 86_400_000)

  const { results } = await (await db())
    .prepare(
      `SELECT p.id, p.order_id, p.provider, p.status, p.amount_minor, p.currency_code,
              p.reference, p.created_at,
              o.display_id, o.email, o.payment_status AS order_payment_status
         FROM payment p LEFT JOIN "order" o ON o.id = p.order_id
        WHERE p.created_at >= ?1 AND p.created_at <= ?2
        ORDER BY p.created_at DESC`
    )
    .bind(from.toISOString(), to.toISOString())
    .all<PaymentRow>()

  const payments = results.map((row) => ({
    order_id: row.order_id,
    display_id: row.display_id,
    email: row.email,
    created_at: row.created_at,
    provider_id: row.provider,
    amount: toMajor(row.amount_minor),
    currency_code: row.currency_code,
    captured: row.status === "captured",
    refunded: row.status === "refunded" ? toMajor(row.amount_minor) : 0,
    order_payment_status: row.order_payment_status,
    reference: row.reference,
  }))

  const totals: Record<
    string,
    { provider_id: string; currency_code: string; captured: number; pending: number; refunded: number; count: number }
  > = {}
  for (const payment of payments) {
    const key = `${payment.provider_id}|${payment.currency_code}`
    totals[key] ??= {
      provider_id: payment.provider_id,
      currency_code: payment.currency_code,
      captured: 0,
      pending: 0,
      refunded: 0,
      count: 0,
    }
    totals[key].count += 1
    totals[key].refunded += payment.refunded
    if (payment.captured) {
      totals[key].captured += payment.amount
    } else {
      totals[key].pending += payment.amount
    }
  }

  return NextResponse.json({
    payments,
    totals: Object.values(totals),
    providers: {
      stripe: Boolean(process.env.STRIPE_API_KEY),
      mpesa: Boolean(process.env.DARAJA_CONSUMER_KEY && process.env.DARAJA_SHORTCODE),
    },
  })
}
