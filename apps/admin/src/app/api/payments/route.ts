import { NextResponse, type NextRequest } from "next/server"
import { toMajor } from "@maktabah/db"
import { db } from "@/lib/db"
import { mpesaConfig } from "@/lib/payments"

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

type ManualSubmissionRow = {
  id: string
  reference: string
  amount_minor: number
  currency_code: string
  status: string
  created_at: string
  email: string | null
  raw: string | null
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

  const database = await db()
  const [paymentRows, submissionRows, checkoutRows] = await Promise.all([
    database.prepare(
      `SELECT p.id, p.order_id, p.provider, p.status, p.amount_minor, p.currency_code,
              p.reference, p.created_at,
              o.display_id, o.email, o.payment_status AS order_payment_status
         FROM payment p LEFT JOIN "order" o ON o.id = p.order_id
        WHERE p.created_at >= ?1 AND p.created_at <= ?2
          AND NOT (p.provider = 'manual' AND p.order_id IS NULL)
        ORDER BY p.created_at DESC`
    )
    .bind(from.toISOString(), to.toISOString())
    .all<PaymentRow>(),
    database
      .prepare(
        `SELECT p.id, p.reference, p.amount_minor, p.currency_code, p.status, p.created_at, p.raw, c.email
           FROM payment p LEFT JOIN cart c ON c.id = p.cart_id
          WHERE p.provider = 'manual' AND p.status IN ('pending', 'captured') AND p.order_id IS NULL
          ORDER BY p.created_at ASC LIMIT 100`
      )
      .all<ManualSubmissionRow>(),
    database.prepare(
      `SELECT m.id, m.phone, m.amount_minor, m.checkout_id, m.status, m.review_reason,
              m.result_description, m.created_at, c.email
         FROM mpesa_checkout m JOIN cart c ON c.id = m.cart_id
        WHERE c.completed_order_id IS NULL AND m.status IN ('starting', 'pending', 'confirmed', 'review')
        ORDER BY m.created_at ASC LIMIT 100`
    ).all<{
      id: string; phone: string; amount_minor: number | null; checkout_id: string | null;
      status: string; review_reason: string | null; result_description: string | null;
      created_at: string; email: string | null
    }>(),
  ])
  const { results } = paymentRows

  const payments = results.map((row) => ({
    order_id: row.order_id,
    display_id: row.display_id,
    email: row.email,
    created_at: row.created_at,
    provider_id: row.provider,
    amount: toMajor(row.amount_minor),
    currency_code: row.currency_code,
    status: row.status,
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

  const manualSubmissions = submissionRows.results.map((row) => {
    let message = ""
    if (row.raw) {
      try {
        const raw = JSON.parse(row.raw) as { message?: unknown }
        message = typeof raw.message === "string" ? raw.message : ""
      } catch {
        message = ""
      }
    }
    return {
      id: row.id,
      reference: row.reference,
      amount: toMajor(row.amount_minor),
      currency_code: row.currency_code,
      status: row.status,
      created_at: row.created_at,
      email: row.email,
      message,
    }
  })

  return NextResponse.json({
    payments,
    totals: Object.values(totals),
    manualSubmissions,
    mpesaCheckouts: checkoutRows.results.map((row) => ({
      ...row,
      amount: row.amount_minor === null ? null : toMajor(row.amount_minor),
    })),
    providers: {
      mpesa: Boolean(mpesaConfig()),
    },
  })
}
