/**
 * Stripe PaymentIntents over the REST API.
 *
 * The official SDK is not used: it is heavy for a Worker and its signature
 * verification is Node-only. These calls are form-encoded as Stripe's API
 * expects, and the webhook signature is checked with Web Crypto.
 */
export type StripeConfig = { secretKey: string; webhookSecret?: string }

export type PaymentIntent = {
  id: string
  clientSecret: string
  status: string
  amount: number
  currency: string
}

/** Currencies Stripe quotes in whole units, where amounts are not multiplied. */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
])

/**
 * Our minor units are always hundredths; Stripe's depend on the currency.
 * For a zero-decimal currency it wants whole units, so the hundredths have to
 * come back off before sending.
 */
export function toStripeAmount(minorUnits: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? Math.round(minorUnits / 100) : Math.round(minorUnits)
}

export function fromStripeAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount * 100 : amount
}

function form(params: Record<string, string | number | undefined>): string {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      body.set(key, String(value))
    }
  }
  return body.toString()
}

async function stripeFetch<T>(
  config: StripeConfig,
  path: string,
  init?: { method?: string; body?: string; idempotencyKey?: string }
): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init?.method || "GET",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Stripe retries are safe to replay with this set.
      ...(init?.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init?.body,
  })
  const data = (await response.json()) as T & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe request failed (${response.status})`)
  }
  return data
}

type RawIntent = { id: string; client_secret: string; status: string; amount: number; currency: string }

export async function createPaymentIntent(
  config: StripeConfig,
  input: {
    amountMinor: number
    currency: string
    email?: string | null
    orderReference: string
    idempotencyKey: string
  }
): Promise<PaymentIntent> {
  const intent = await stripeFetch<RawIntent>(config, "payment_intents", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: form({
      amount: toStripeAmount(input.amountMinor, input.currency),
      currency: input.currency.toLowerCase(),
      "automatic_payment_methods[enabled]": "true",
      receipt_email: input.email || undefined,
      "metadata[cart]": input.orderReference,
    }),
  })
  return {
    id: intent.id,
    clientSecret: intent.client_secret,
    status: intent.status,
    amount: fromStripeAmount(intent.amount, intent.currency),
    currency: intent.currency,
  }
}

export async function retrievePaymentIntent(config: StripeConfig, id: string): Promise<PaymentIntent> {
  const intent = await stripeFetch<RawIntent>(config, `payment_intents/${encodeURIComponent(id)}`)
  return {
    id: intent.id,
    clientSecret: intent.client_secret,
    status: intent.status,
    amount: fromStripeAmount(intent.amount, intent.currency),
    currency: intent.currency,
  }
}

/** Stripe calls a payment finished when the intent succeeds. */
export function intentIsPaid(status: string): boolean {
  return status === "succeeded"
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Verifies a Stripe webhook signature.
 *
 * The header carries a timestamp and one or more v1 signatures; the signed
 * payload is `<timestamp>.<raw body>`. The raw body matters - parsing and
 * re-serialising the JSON first would change the bytes and fail every time.
 * Old timestamps are rejected so a captured request cannot be replayed later.
 */
export async function verifyWebhook(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
  toleranceSeconds = 300
): Promise<boolean> {
  if (!signatureHeader) {
    return false
  }
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=")
      return [key, rest.join("=")]
    })
  ) as Record<string, string>

  const timestamp = Number(parts.t)
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) {
    return false
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`))
  const expected = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("")

  // A header can carry several v1 signatures during a secret rotation.
  return signatureHeader
    .split(",")
    .filter((part) => part.trim().startsWith("v1="))
    .some((part) => timingSafeEqual(part.trim().slice(3), expected))
}
