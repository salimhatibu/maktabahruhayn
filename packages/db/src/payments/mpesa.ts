/**
 * M-Pesa (Safaricom Daraja) STK push, for the Workers runtime.
 *
 * Ported from the Medusa provider module: same endpoints and payload shape,
 * with base64 through the Web APIs rather than Node's Buffer, and no
 * in-process token cache - a Worker isolate is too short-lived for one to pay
 * off, and Daraja tokens are cheap to mint.
 */
export type MpesaConfig = {
  consumerKey: string
  consumerSecret: string
  passkey: string
  shortcode: string
  callbackUrl: string
  environment?: string
}

export type StkPushResult = {
  merchantRequestId: string
  checkoutRequestId: string
  customerMessage: string
}

export type StkStatus = {
  resultCode: number
  resultDesc: string
  /** Set once Safaricom confirms the payment. */
  receipt?: string
}

const base64 = (value: string) => btoa(value)

/** Safaricom wants 2547XXXXXXXX; shoppers type 07…, +2547… or 7…. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.startsWith("0") && digits.length === 10) {
    return `254${digits.slice(1)}`
  }
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) {
    return `254${digits}`
  }
  return digits
}

export function isKenyanMobile(phone: string): boolean {
  return /^254[17]\d{8}$/.test(normalizePhone(phone))
}

/**
 * The callback URL Daraja is given, carrying the shared secret the callback
 * route checks. Returns "" without a usable secret (16+ characters), which
 * leaves M-Pesa unconfigured: a payment whose confirmation would be refused
 * must not be offered at all.
 */
export function callbackUrlWithToken(url: string, token: string): string {
  if (!url || !token || token.length < 16) {
    return ""
  }
  try {
    const parsed = new URL(url)
    parsed.searchParams.set("token", token)
    return parsed.toString()
  } catch {
    return ""
  }
}

export function mpesaConfigured(config: Partial<MpesaConfig>): config is MpesaConfig {
  return Boolean(
    config.consumerKey && config.consumerSecret && config.passkey && config.shortcode && config.callbackUrl
  )
}

function baseUrl(config: MpesaConfig) {
  return config.environment === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke"
}

/** Daraja's timestamp is Nairobi local time, which is UTC+3 all year. */
function timestamp(): string {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  )
}

async function accessToken(config: MpesaConfig): Promise<string> {
  const credentials = base64(`${config.consumerKey}:${config.consumerSecret}`)
  const response = await fetch(`${baseUrl(config)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!response.ok) {
    throw new Error(`M-Pesa authentication failed (${response.status})`)
  }
  const data = (await response.json()) as { access_token?: string }
  if (!data.access_token) {
    throw new Error("M-Pesa authentication returned no token")
  }
  return data.access_token
}

export async function stkPush(
  config: MpesaConfig,
  input: {
    phone: string
    /** Whole shillings: Daraja rejects decimals. */
    amount: number
    accountReference: string
    description: string
    callbackUrl?: string
  }
): Promise<StkPushResult> {
  const stamp = timestamp()
  const token = await accessToken(config)
  const phone = normalizePhone(input.phone)

  const response = await fetch(`${baseUrl(config)}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: base64(`${config.shortcode}${config.passkey}${stamp}`),
      Timestamp: stamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.max(1, Math.round(input.amount)),
      PartyA: phone,
      PartyB: config.shortcode,
      PhoneNumber: phone,
      CallBackURL: input.callbackUrl || config.callbackUrl,
      AccountReference: input.accountReference.slice(0, 12),
      TransactionDesc: input.description.slice(0, 100),
    }),
  })

  const data = (await response.json()) as Record<string, string>
  if (!response.ok || data.ResponseCode !== "0") {
    throw new Error(data.errorMessage || data.ResponseDescription || "We could not reach M-Pesa.")
  }
  return {
    merchantRequestId: data.MerchantRequestID,
    checkoutRequestId: data.CheckoutRequestID,
    customerMessage: data.CustomerMessage,
  }
}

/** Asks Safaricom where a push got to, for polling while the shopper waits. */
export async function queryStk(config: MpesaConfig, checkoutRequestId: string): Promise<StkStatus> {
  const stamp = timestamp()
  const token = await accessToken(config)
  const response = await fetch(`${baseUrl(config)}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: base64(`${config.shortcode}${config.passkey}${stamp}`),
      Timestamp: stamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  })
  const data = (await response.json()) as Record<string, string>
  // While the shopper has not acted yet Daraja answers with an error body,
  // which is a pending state rather than a failure.
  if (!response.ok) {
    return { resultCode: 1032, resultDesc: data.errorMessage || "Waiting for the customer." }
  }
  return { resultCode: Number(data.ResultCode ?? -1), resultDesc: data.ResultDesc || "" }
}

export type MpesaCallback = {
  checkoutRequestId: string
  merchantRequestId: string
  resultCode: number
  resultDesc: string
  receipt?: string
  phone?: string
  amount?: number
}

/** Reads the STK callback body Safaricom POSTs, which nests its values. */
export function parseCallback(body: unknown): MpesaCallback | null {
  const callback = (body as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback
  if (!callback) {
    return null
  }
  const items =
    ((callback.CallbackMetadata as { Item?: { Name: string; Value: unknown }[] })?.Item || []) as {
      Name: string
      Value: unknown
    }[]
  const value = (name: string) => items.find((item) => item.Name === name)?.Value

  return {
    checkoutRequestId: String(callback.CheckoutRequestID || ""),
    merchantRequestId: String(callback.MerchantRequestID || ""),
    resultCode: Number(callback.ResultCode ?? -1),
    resultDesc: String(callback.ResultDesc || ""),
    receipt: value("MpesaReceiptNumber") ? String(value("MpesaReceiptNumber")) : undefined,
    phone: value("PhoneNumber") ? String(value("PhoneNumber")) : undefined,
    amount: value("Amount") !== undefined ? Number(value("Amount")) : undefined,
  }
}
