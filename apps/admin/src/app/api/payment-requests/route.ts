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
      `SELECT id, phone, amount_minor, reference, description, status, receipt, created_at, mpesa_review
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
      status: row.status === "pending" && row.mpesa_review ? "review" : row.status,
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
  if (!Number.isSafeInteger(amount) || amount < 1) {
    return NextResponse.json({ message: "Enter an amount in whole Kenyan shillings." }, { status: 400 })
  }

  const id = newId("preq")
  const reference = (body.reference || id.slice(-8)).slice(0, 12)
  const database = await db()
  await database
    .prepare(
      `INSERT INTO payment_request (id, phone, amount_minor, reference, description, status)
       VALUES (?1, ?2, ?3, ?4, ?5, 'pending')`
    )
    .bind(id, mpesa.normalizePhone(body.phone), toMinor(amount), reference, body.description || null)
    .run()

  try {
    const callbackUrl = new URL(config.callbackUrl)
    callbackUrl.searchParams.set("payment_request", id)
    const push = await mpesa.stkPush(config, {
      phone: body.phone,
      amount,
      accountReference: reference,
      description: body.description || "Maktabah Ruhayn",
      callbackUrl: callbackUrl.toString(),
    })
    const saved = await database
      .prepare(
        `UPDATE payment_request SET checkout_id = ?2
          WHERE id = ?1 AND (checkout_id IS NULL OR checkout_id = ?2)`
      )
      .bind(id, push.checkoutRequestId)
      .run()
    if (!push.checkoutRequestId || !saved.meta?.changes) {
      throw new Error("The M-Pesa request ID could not be matched.")
    }
    return NextResponse.json({ id, message: push.customerMessage })
  } catch (error) {
    console.error("M-Pesa admin request failed or has an uncertain outcome", id, error)
    if (error instanceof mpesa.MpesaRequestNotSentError) {
      await database.prepare(`UPDATE payment_request SET status = 'failed' WHERE id = ?1 AND checkout_id IS NULL`).bind(id).run()
      return NextResponse.json({ message: "M-Pesa is unavailable. The prompt was not sent." }, { status: 502 })
    }
    return NextResponse.json({
      id,
      message: "The outcome is uncertain. Check the request and M-Pesa records before sending another prompt.",
    }, { status: 202 })
  }
}
