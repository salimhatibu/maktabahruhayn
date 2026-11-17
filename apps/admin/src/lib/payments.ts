import { mpesa, type MpesaConfig } from "@maktabah/db"

/**
 * Provider configuration, read from the Worker's variables and secrets. The
 * admin shows a gateway as unconfigured rather than failing when its
 * credentials are missing.
 */
export function mpesaConfig(): MpesaConfig | null {
  const config = {
    consumerKey: process.env.DARAJA_CONSUMER_KEY || "",
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET || "",
    passkey: process.env.DARAJA_PASSKEY || "",
    shortcode: process.env.DARAJA_SHORTCODE || "",
    transactionType: process.env.DARAJA_TRANSACTION_TYPE,
    partyB: process.env.DARAJA_PARTY_B || "",
    // The storefront's callback route, with the secret it requires.
    callbackUrl: mpesa.callbackUrlWithToken(process.env.DARAJA_CALLBACK_URL || "", process.env.DARAJA_CALLBACK_TOKEN || ""),
    environment: process.env.DARAJA_ENVIRONMENT || "sandbox",
  }
  return mpesa.mpesaConfigured(config) ? config : null
}
