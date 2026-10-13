import { DarajaClient } from "../modules/daraja/client"

/** A Daraja client built from env, for admin-initiated STK pushes. */
export function darajaFromEnv() {
  return new DarajaClient({
    consumerKey: process.env.DARAJA_CONSUMER_KEY || "",
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET || "",
    passkey: process.env.DARAJA_PASSKEY || "",
    shortcode: process.env.DARAJA_SHORTCODE || "",
    callbackUrl: process.env.DARAJA_CALLBACK_URL || "http://localhost:9000/api/payment/mpesa/callback",
    environment: process.env.DARAJA_ENVIRONMENT || "sandbox",
  })
}
