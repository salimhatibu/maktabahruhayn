import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { darajaFromEnv } from "../../../lib/daraja-env"
import { PAYMENT_REQUEST_MODULE } from "../../../modules/payment-request"
import type PaymentRequestModuleService from "../../../modules/payment-request/service"

export type StkRequestInput = {
  phone: string
  amount: number
  reference: string
  description?: string
  order_id?: string
  created_by?: string
}

/** Records an admin payment request and sends the M-Pesa STK push. */
export const createStkRequestStep = createStep(
  "create-stk-request",
  async (input: StkRequestInput, { container }) => {
    const requests: PaymentRequestModuleService = container.resolve(PAYMENT_REQUEST_MODULE)
    const phone = input.phone.replace(/\D/g, "").replace(/^0/, "254")
    if (!/^254[17]\d{8}$/.test(phone)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Use a Safaricom number like 2547XXXXXXXX")
    }
    if (!(input.amount >= 1)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Amount must be at least KES 1")
    }

    const request = await requests.createPaymentRequests({
      phone,
      amount: Math.ceil(input.amount),
      currency_code: "kes",
      reference: input.reference.slice(0, 12) || "Maktabah",
      description: input.description || null,
      order_id: input.order_id || null,
      created_by: input.created_by || null,
    })

    const client = darajaFromEnv()
    if (!client.isConfigured()) {
      const failed = await requests.updatePaymentRequests({
        id: request.id,
        status: "failed",
        result_description: "M-Pesa (Daraja) credentials are not configured on the server",
      })
      return new StepResponse(failed, request.id)
    }

    const base = new URL(process.env.DARAJA_CALLBACK_URL || "http://localhost:9000/api/payment/mpesa/callback")
    base.searchParams.set("rid", request.id)
    try {
      const stk = await client.stkPush({
        phone,
        amount: Math.ceil(input.amount),
        callbackUrl: base.toString(),
        accountReference: request.reference,
        transactionDesc: (input.description || "Maktabah Ruhayn").slice(0, 13),
      })
      const updated = await requests.updatePaymentRequests({
        id: request.id,
        checkout_request_id: stk.CheckoutRequestID,
        result_description: stk.CustomerMessage || "Request sent",
      })
      return new StepResponse(updated, request.id)
    } catch (error) {
      const failed = await requests.updatePaymentRequests({
        id: request.id,
        status: "failed",
        result_description: String(error).slice(0, 250),
      })
      return new StepResponse(failed, request.id)
    }
  }
)

export type StkResultInput = {
  request_id: string
  checkout_request_id: string
  result_code: number
  result_description?: string
  receipt?: string
}

/**
 * Applies an STK callback to an admin payment request. Successes are
 * confirmed with Safaricom's status query first; already-settled requests are
 * left untouched, so repeated callbacks are harmless.
 */
export const applyStkResultStep = createStep(
  "apply-stk-result",
  async (input: StkResultInput, { container }) => {
    const requests: PaymentRequestModuleService = container.resolve(PAYMENT_REQUEST_MODULE)
    const request = await requests.retrievePaymentRequest(input.request_id)
    if (request.status !== "pending" || request.checkout_request_id !== input.checkout_request_id) {
      return new StepResponse({ updated: false, status: request.status }, null)
    }

    let paid = input.result_code === 0
    if (paid) {
      const client = darajaFromEnv()
      if (client.isConfigured()) {
        const status = await client.queryStkStatus(input.checkout_request_id).catch(() => null)
        paid = String(status?.ResultCode) === "0"
      }
    }
    await requests.updatePaymentRequests({
      id: request.id,
      status: paid ? "paid" : "failed",
      mpesa_receipt: paid ? input.receipt || null : null,
      result_description: input.result_description || null,
    })
    return new StepResponse({ updated: true, status: paid ? "paid" : "failed" }, request.id)
  },
  async (id, { container }) => {
    if (!id) {
      return
    }
    const requests: PaymentRequestModuleService = container.resolve(PAYMENT_REQUEST_MODULE)
    await requests.updatePaymentRequests({ id, status: "pending", mpesa_receipt: null })
  }
)
