import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const isProduction = process.env.NODE_ENV === "production"

/** Public origin of this backend. The admin dashboard is served at <origin>/app. */
const backendUrl = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/+$/, "")
/** Public origin of the storefront (the Cloudflare Worker in production). */
const storefrontUrl = (process.env.STOREFRONT_URL || "http://localhost:3000").replace(/\/+$/, "")

/**
 * The storefront and backend origins are always allowed, so a deployment only
 * has to set STOREFRONT_URL and MEDUSA_BACKEND_URL instead of repeating them
 * across three lists. The *_CORS variables stay available for extra origins.
 */
function corsOrigins(configured: string | undefined, ...required: string[]) {
  const listed = (configured || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  return [...new Set([...listed, ...required])].join(",")
}

if (
  isProduction &&
  [process.env.JWT_SECRET, process.env.COOKIE_SECRET].some((s) => !s || s === "supersecret")
) {
  console.warn(
    "[maktabah] JWT_SECRET and COOKIE_SECRET are unset or still the development default. " +
      "Set both to random values before putting the admin on the internet: with the default, " +
      "anyone can forge an admin session."
  )
}

const paymentProviders = []

if (process.env.STRIPE_API_KEY) {
  paymentProviders.push({
    resolve: "@medusajs/medusa/payment-stripe",
    id: "stripe",
    options: {
      apiKey: process.env.STRIPE_API_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
      capture: true,
    },
  })
}

paymentProviders.push({
  resolve: "./src/modules/daraja",
  id: "daraja",
  options: {
    consumerKey: process.env.DARAJA_CONSUMER_KEY || "",
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET || "",
    passkey: process.env.DARAJA_PASSKEY || "",
    shortcode: process.env.DARAJA_SHORTCODE || "",
    callbackUrl:
      process.env.DARAJA_CALLBACK_URL ||
      "http://localhost:9000/api/payment/mpesa/callback",
    environment: process.env.DARAJA_ENVIRONMENT || "sandbox",
  },
})

const fulfillmentProviders = [
  {
    resolve: "@medusajs/medusa/fulfillment-manual",
    id: "manual",
  },
  {
    resolve: "./src/modules/shippo",
    id: "shippo",
    options: {
      apiKey: process.env.SHIPPO_API_KEY || "",
      fromAddress: {
        name: process.env.SHIPPO_FROM_NAME || "Maktabah Ruhayn",
        street1: process.env.SHIPPO_FROM_STREET1 || "Nairobi CBD",
        city: process.env.SHIPPO_FROM_CITY || "Nairobi",
        state: process.env.SHIPPO_FROM_STATE || "Nairobi",
        zip: process.env.SHIPPO_FROM_ZIP || "00100",
        country: process.env.SHIPPO_FROM_COUNTRY || "KE",
        phone: process.env.SHIPPO_FROM_PHONE || "+254700000000",
        email: process.env.SHIPPO_FROM_EMAIL || "shipping@maktabahruhayn.com",
      },
      fallbackAmountKes: Number(process.env.SHIPPO_FALLBACK_AMOUNT_KES || 800),
      fallbackAmountUsd: Number(process.env.SHIPPO_FALLBACK_AMOUNT_USD || 25),
    },
  },
]

module.exports = defineConfig({
  featureFlags: {
    // Roles & permissions for admin users (Settings > Roles in the admin).
    rbac: true,
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: corsOrigins(process.env.STORE_CORS, storefrontUrl),
      adminCors: corsOrigins(process.env.ADMIN_CORS, backendUrl),
      authCors: corsOrigins(process.env.AUTH_CORS, backendUrl, storefrontUrl),
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    redisUrl: process.env.REDIS_URL,
  },
  admin: {
    /**
     * The dashboard is served by this backend only, at <backend origin>/app,
     * and it calls the API on whatever origin it was loaded from. It is never
     * built into or proxied by the public storefront, so the storefront domain
     * has no route to it. Set ADMIN_DISABLED=true to run the API without it.
     */
    path: "/app",
    storefrontUrl,
    disable: process.env.ADMIN_DISABLED === "true",
  },
  modules: [
    {
      resolve: "./src/modules/book",
    },
    {
      resolve: "./src/modules/review",
    },
    {
      resolve: "./src/modules/newsletter",
    },
    {
      // Role-based access control (enabled by the rbac feature flag above).
      resolve: "@medusajs/medusa/rbac",
    },
    {
      resolve: "./src/modules/store-settings",
    },
    {
      resolve: "./src/modules/payment-request",
    },
    {
      resolve: "./src/modules/affiliate",
    },
    {
      resolve: "./src/modules/typesense",
      options: {
        host: process.env.TYPESENSE_HOST || "localhost",
        port: Number(process.env.TYPESENSE_PORT || 8108),
        protocol: process.env.TYPESENSE_PROTOCOL || "http",
        apiKey: process.env.TYPESENSE_API_KEY || "xyz",
        collectionName: process.env.TYPESENSE_COLLECTION || "books",
      },
    },
    {
      resolve: "./src/modules/fx",
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: paymentProviders,
      },
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: fulfillmentProviders,
      },
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/smtp-notification",
            id: "smtp",
            options: {
              channels: ["email"],
              host: process.env.SMTP_HOST || "",
              port: Number(process.env.SMTP_PORT || 587),
              user: process.env.SMTP_USER || "",
              pass: process.env.SMTP_PASS || "",
              from: process.env.SMTP_FROM || "",
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID
            ? {
                resolve: "@medusajs/medusa/file-s3",
                id: "r2",
                options: {
                  file_url: process.env.R2_PUBLIC_URL || "",
                  access_key_id: process.env.R2_ACCESS_KEY_ID,
                  secret_access_key: process.env.R2_SECRET_ACCESS_KEY,
                  region: "auto",
                  bucket: process.env.R2_BUCKET,
                  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
                  additional_client_config: {
                    forcePathStyle: true,
                  },
                },
              }
            : {
                resolve: "@medusajs/medusa/file-local",
                id: "local",
                options: {
                  upload_dir: "static",
                  backend_url: `${process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/static`,
                },
              },
        ],
      },
    },
  ],
})
