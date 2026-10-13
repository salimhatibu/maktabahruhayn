import {
  AbstractPaymentProvider,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { DarajaClient, type DarajaOptions } from "./client"

type InjectedDependencies = {
  logger: {
    info: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
  }
}

class DarajaPaymentProviderService extends AbstractPaymentProvider<DarajaOptions> {
  static identifier = "daraja"

  protected logger_: InjectedDependencies["logger"]
  protected options_: DarajaOptions
  protected client_: DarajaClient

  constructor(container: InjectedDependencies, options: DarajaOptions) {
    super(container, options)
    this.logger_ = container.logger
    this.options_ = options
    this.client_ = new DarajaClient(options)
  }

  static validateOptions(options: Record<string, unknown>) {
    // Allow empty credentials in local/dev so the module can register;
    // live STK Push requires all secrets.
    if (options.environment === "production") {
      for (const key of [
        "consumerKey",
        "consumerSecret",
        "passkey",
        "shortcode",
        "callbackUrl",
      ]) {
        if (!options[key]) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Daraja option "${key}" is required in production`
          )
        }
      }
    }
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const phone =
      (input.data?.phone as string | undefined) ||
      (input.context?.customer?.phone as string | undefined)

    const amount = Number(input.amount)
    // Medusa passes its payment session id; webhooks must report it back.
    const sessionId = String(input.data?.session_id || crypto.randomUUID())

    if (!phone) {
      return {
        id: String(sessionId),
        data: {
          status: "requires_phone",
          session_id: sessionId,
          message: "Provide an M-Pesa phone number (2547XXXXXXXX) in payment session data.phone",
        },
        status: PaymentSessionStatus.REQUIRES_MORE,
      }
    }

    if (!this.client_.isConfigured()) {
      this.logger_.warn(
        "Daraja credentials missing — creating sandbox placeholder payment session"
      )
      return {
        id: String(sessionId),
        data: {
          status: "pending_authorization",
          session_id: sessionId,
          phone,
          amount,
          currency_code: input.currency_code,
          CheckoutRequestID: `MOCK-${sessionId}`,
          MerchantRequestID: `MOCK-MR-${sessionId}`,
        },
        status: PaymentSessionStatus.PENDING_AUTHORIZATION,
      }
    }

    if (String(input.currency_code).toLowerCase() !== "kes") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "M-Pesa payments must be in KES"
      )
    }

    const stk = await this.client_.stkPush({
      phone,
      amount: Math.ceil(amount),
      callbackUrl: this.callbackUrlFor(sessionId),
      accountReference: String(sessionId).slice(0, 12),
      transactionDesc: "Maktabah Ruhayn order",
    })

    return {
      id: stk.CheckoutRequestID,
      data: {
        status: "pending_authorization",
        session_id: sessionId,
        phone,
        amount,
        currency_code: input.currency_code,
        CheckoutRequestID: stk.CheckoutRequestID,
        MerchantRequestID: stk.MerchantRequestID,
        CustomerMessage: stk.CustomerMessage,
      },
      status: PaymentSessionStatus.PENDING_AUTHORIZATION,
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const checkoutRequestId = String(input.data?.CheckoutRequestID || "")

    if (!checkoutRequestId) {
      return { status: PaymentSessionStatus.ERROR, data: input.data || {} }
    }

    if (checkoutRequestId.startsWith("MOCK-")) {
      return {
        status: PaymentSessionStatus.AUTHORIZED,
        data: { ...input.data, status: "authorized" },
      }
    }

    // STK is async — stay pending until webhook/callback confirms
    if (input.data?.ResultCode === 0 || input.data?.status === "captured") {
      return {
        status: PaymentSessionStatus.CAPTURED,
        data: { ...input.data, status: "captured" },
      }
    }

    if (this.client_.isConfigured()) {
      try {
        const query = await this.client_.queryStkStatus(checkoutRequestId)
        if (String(query.ResultCode) === "0") {
          return {
            status: PaymentSessionStatus.CAPTURED,
            data: {
              ...input.data,
              ...query,
              status: "captured",
            },
          }
        }
      } catch (error) {
        this.logger_.warn("Daraja STK query failed", error)
      }
    }

    return {
      status: PaymentSessionStatus.PENDING_AUTHORIZATION,
      data: { ...input.data, status: "pending_authorization" },
    }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return {
      data: {
        ...input.data,
        status: "captured",
        captured_at: new Date().toISOString(),
      },
    }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: { ...input.data, status: "canceled" } }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data || {} }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const status = String(input.data?.status || "pending")
    if (status === "captured") {
      return { status: PaymentSessionStatus.CAPTURED }
    }
    if (status === "authorized") {
      return { status: PaymentSessionStatus.AUTHORIZED }
    }
    if (status === "canceled") {
      return { status: PaymentSessionStatus.CANCELED }
    }
    return { status: PaymentSessionStatus.PENDING }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    this.logger_.warn(
      "Daraja refunds must be processed manually via Safaricom portal",
      input.data
    )
    return { data: { ...input.data, refund_status: "manual_required" } }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return { data: input.data || {} }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return this.initiatePayment(input)
  }

  /** Appends the Medusa session id so the callback can be matched to it. */
  protected callbackUrlFor(sessionId: string) {
    const base = this.options_.callbackUrl || ""
    if (!base) {
      return base
    }
    const url = new URL(base)
    url.searchParams.set("sid", sessionId)
    return url.toString()
  }

  /**
   * Daraja callbacks are unsigned. A success is only trusted after the STK
   * status query confirms it with Safaricom; the session id comes from the
   * callback URL we issued (injected by the callback route as data.sid).
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const body = (payload.data || {}) as Record<string, unknown>
    const stkCallback = (body.Body as Record<string, unknown> | undefined)
      ?.stkCallback as Record<string, unknown> | undefined

    const callback = stkCallback || body
    const resultCode = Number(callback.ResultCode ?? -1)
    const checkoutRequestId = String(callback.CheckoutRequestID || "")
    const sessionId = String(body.sid || "")

    if (!checkoutRequestId || !sessionId) {
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    const amount = Number(
      (callback.CallbackMetadata as { Item?: { Name: string; Value: number }[] })?.Item?.find(
        (i) => i.Name === "Amount"
      )?.Value || 0
    )

    if (resultCode !== 0) {
      return { action: PaymentActions.FAILED, data: { session_id: sessionId, amount: 0 } }
    }

    if (this.client_.isConfigured()) {
      try {
        const query = await this.client_.queryStkStatus(checkoutRequestId)
        if (String(query.ResultCode) !== "0") {
          this.logger_.warn(`M-Pesa callback for ${checkoutRequestId} not confirmed by STK query`)
          return { action: PaymentActions.NOT_SUPPORTED }
        }
      } catch (error) {
        // Leave the session pending; authorizePayment re-queries on retry.
        this.logger_.warn("Daraja STK query failed during webhook verification", error)
        return { action: PaymentActions.NOT_SUPPORTED }
      }
    }

    return {
      action: PaymentActions.SUCCESSFUL,
      data: { session_id: sessionId, amount },
    }
  }
}

export default DarajaPaymentProviderService
