export type DarajaOptions = {
  consumerKey?: string
  consumerSecret?: string
  passkey?: string
  shortcode?: string
  callbackUrl?: string
  environment?: string
}

type TokenResponse = {
  access_token: string
  expires_in: string
}

type StkPushResponse = {
  MerchantRequestID: string
  CheckoutRequestID: string
  ResponseCode: string
  ResponseDescription: string
  CustomerMessage: string
}

type StkQueryResponse = {
  ResponseCode: string
  ResponseDescription: string
  MerchantRequestID: string
  CheckoutRequestID: string
  ResultCode: string
  ResultDesc: string
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.startsWith("0") && digits.length === 10) {
    return `254${digits.slice(1)}`
  }
  if (digits.startsWith("7") && digits.length === 9) {
    return `254${digits}`
  }
  return digits
}

export class DarajaClient {
  protected options_: DarajaOptions
  protected cachedToken_?: { token: string; expiresAt: number }

  constructor(options: DarajaOptions) {
    this.options_ = options
  }

  isConfigured() {
    return Boolean(
      this.options_.consumerKey &&
        this.options_.consumerSecret &&
        this.options_.passkey &&
        this.options_.shortcode &&
        this.options_.callbackUrl
    )
  }

  protected baseUrl() {
    return this.options_.environment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke"
  }

  async getAccessToken(): Promise<string> {
    if (this.cachedToken_ && this.cachedToken_.expiresAt > Date.now()) {
      return this.cachedToken_.token
    }

    const credentials = Buffer.from(
      `${this.options_.consumerKey}:${this.options_.consumerSecret}`
    ).toString("base64")

    const response = await fetch(
      `${this.baseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Daraja OAuth failed: ${response.status}`)
    }

    const data = (await response.json()) as TokenResponse
    this.cachedToken_ = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000,
    }
    return data.access_token
  }

  protected password(timestamp: string) {
    return Buffer.from(
      `${this.options_.shortcode}${this.options_.passkey}${timestamp}`
    ).toString("base64")
  }

  protected timestamp() {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    return (
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    )
  }

  async stkPush(input: {
    phone: string
    amount: number
    /** Overrides the configured callback URL (e.g. to carry the session id). */
    callbackUrl?: string
    accountReference: string
    transactionDesc: string
  }): Promise<StkPushResponse> {
    const token = await this.getAccessToken()
    const timestamp = this.timestamp()

    const response = await fetch(
      `${this.baseUrl()}/mpesa/stkpush/v1/processrequest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: this.options_.shortcode,
          Password: this.password(timestamp),
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: input.amount,
          PartyA: normalizePhone(input.phone),
          PartyB: this.options_.shortcode,
          PhoneNumber: normalizePhone(input.phone),
          CallBackURL: input.callbackUrl || this.options_.callbackUrl,
          AccountReference: input.accountReference,
          TransactionDesc: input.transactionDesc,
        }),
      }
    )

    const data = (await response.json()) as StkPushResponse & {
      errorMessage?: string
    }

    if (!response.ok || data.ResponseCode !== "0") {
      throw new Error(data.errorMessage || data.ResponseDescription || "STK Push failed")
    }

    return data
  }

  async queryStkStatus(checkoutRequestId: string): Promise<StkQueryResponse> {
    const token = await this.getAccessToken()
    const timestamp = this.timestamp()

    const response = await fetch(
      `${this.baseUrl()}/mpesa/stkpushquery/v1/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: this.options_.shortcode,
          Password: this.password(timestamp),
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId,
        }),
      }
    )

    const data = (await response.json()) as StkQueryResponse
    if (!response.ok) {
      throw new Error(data.ResponseDescription || "STK query failed")
    }
    return data
  }
}
