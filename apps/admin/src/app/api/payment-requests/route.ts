import { NextResponse, type NextRequest } from "next/server"
import { mpesa, newId, toMajor, toMinor } from "@maktabah/db"
import { db } from "@/lib/db"
import { mpesaConfig } from "@/lib/payments"

/**
 * The M-Pesa STK tool for phone and WhatsApp orders: push a payment request
 * to a customer's phone and watch it land.
 *
 * GET  /api/payment-requests
 * POST /api/payment-requests { phone, amount, reference, description }
 */
export async function GET() {
  const { results } = await (await db())
    .prepare(
      `SELECT id, phone, amount_minor, reference, description, status, receipt, created_at
         FROM payment_request ORDER BY created_at DESC LIMIT 100`
    )
    .all<Record<string, string | number | null>>()

  return NextResponse.json({
    // Shaped as the page reads it: the receipt and the reason it failed.
    requests: results.map((row) => ({
      id: row.id,
      phone: row.phone,
      amount: toMajor(Number(row.amount_minor || 0)),
      reference: row.reference,
      status: row.status,
      mpesa_receipt: row.receipt ?? null,
      result_description: row.description ?? null,
      created_at: row.created_at,
    })),
    configured: Boolean(mpesaConfig()),
  })
}

export async function POST(request: NextRequest) {
  const config = mpesaConfig()
  if (!config) {
    return NextResponse.json({ message: "M-Pesa is not configured." }, { status: 503 })
  }
  const body = (await request.json()) as {
    phone?: string
    amount?: number
    reference?: string
    description?: string
  }
  if (!body.phone || !mpesa.isKenyanMobile(body.phone)) {
    return NextResponse.json({ message: "Enter a Safaricom number, e.g. 0712345678." }, { status: 400 })
  }
  const amount = Number(body.amount || 0)
  if (!(amount > 0)) {
    return NextResponse.json({ message: "Enter the amount to request." }, { status: 400 })
  }

  const id = newId("preq")
  const reference = (body.reference || id.slice(-8)).slice(0, 12)
  const database = await db()

  try {
    const push = await mpesa.stkPush(config, {
      phone: body.phone,
      amount: Math.ceil(amount),
      accountReference: reference,
      description: body.description || "Maktabah Ruhayn",
    })
    await database
      .prepare(
        `INSERT INTO payment_request (id, phone, amount_minor, reference, description, status, checkout_id)
         VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)`
      )
      .bind(id, mpesa.normalizePhone(body.phone), toMinor(amount), reference, body.description || null, push.checkoutRequestId)
      .run()
    return NextResponse.json({ id, message: push.customerMessage })
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 502 })
  }
}
