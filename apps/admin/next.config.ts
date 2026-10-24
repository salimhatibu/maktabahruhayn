import type { NextConfig } from "next"
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

// Makes the Worker bindings (D1, R2) reachable from `next dev`. Both apps
// point at one state directory at the repo root, so the storefront, the admin
// and the db:* commands all read the same local database - otherwise each app
// gets its own empty copy and the admin finds no tables.
if (process.env.NODE_ENV === "development") {
  void initOpenNextCloudflareForDev({ persist: { path: "../../.wrangler/state/v3" } })
}

// The admin is served from the root of its own hostname (ADMIN_HOST), never
// under a path of the shop's, so there is no basePath.
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // No next/image anywhere; this removes the /_next/image endpoint.
  images: { unoptimized: true },
  // The admin is never indexed and never framed.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js streams its payload in inline scripts; no third-party code runs here.
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ]
  },
}

export default nextConfig
