import { mpesa, shippo, type MpesaConfig, type ShippoConfig } from "@maktabah/db"

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
    // The storefront's callback route, with the secret it requires.
    callbackUrl: mpesa.callbackUrlWithToken(process.env.DARAJA_CALLBACK_URL || "", process.env.DARAJA_CALLBACK_TOKEN || ""),
    environment: process.env.DARAJA_ENVIRONMENT || "sandbox",
  }
  return mpesa.mpesaConfigured(config) ? config : null
}

export function shippoConfig(): ShippoConfig | null {
  const config = {
    apiKey: process.env.SHIPPO_API_KEY || "",
    fromAddress: {
      name: process.env.SHIPPO_FROM_NAME || "Maktabah Ruhayn",
      street1: process.env.SHIPPO_FROM_STREET1 || "",
      city: process.env.SHIPPO_FROM_CITY || "",
      state: process.env.SHIPPO_FROM_STATE || "",
      zip: process.env.SHIPPO_FROM_ZIP || "",
      country: process.env.SHIPPO_FROM_COUNTRY || "KE",
      phone: process.env.SHIPPO_FROM_PHONE || "",
      email: process.env.SHIPPO_FROM_EMAIL || "",
    },
  }
  return shippo.shippoConfigured(config) && config.fromAddress.street1 ? config : null
}
