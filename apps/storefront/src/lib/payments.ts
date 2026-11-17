import { mpesa, type MpesaConfig } from "@maktabah/db"

/**
 * Provider configuration, read at request time from the Worker's variables
 * and secrets. A provider with no credentials is simply not offered, rather
 * than failing at checkout.
 */
export function mpesaConfig(): MpesaConfig | null {
  const config = {
    consumerKey: process.env.DARAJA_CONSUMER_KEY || "",
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET || "",
    passkey: process.env.DARAJA_PASSKEY || "",
    shortcode: process.env.DARAJA_SHORTCODE || "",
    transactionType: process.env.DARAJA_TRANSACTION_TYPE,
    partyB: process.env.DARAJA_PARTY_B || "",
    callbackUrl: mpesa.callbackUrlWithToken(process.env.DARAJA_CALLBACK_URL || "", process.env.DARAJA_CALLBACK_TOKEN || ""),
    environment: process.env.DARAJA_ENVIRONMENT || "sandbox",
  }
  return mpesa.mpesaConfigured(config) ? config : null
}

export { mpesa }
