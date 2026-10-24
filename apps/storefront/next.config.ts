import type { NextConfig } from "next"
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

// Makes the Worker bindings (D1, R2) reachable from `next dev`. Both apps
// point at one state directory at the repo root, so the storefront, the admin
// and the db:* commands all read the same local database - otherwise each app
// gets its own empty copy and the admin finds no tables.
if (process.env.NODE_ENV === "development") {
  void initOpenNextCloudflareForDev({ persist: { path: "../../.wrangler/state/v3" } })
}

const isProd = process.env.NODE_ENV === "production"

/**
 * The URLs a deployed build falls back to are compiled in, so a build carrying
 * local ones would serve a storefront that talks to localhost - and no Worker
 * variable could undo it. `scripts/cf.mjs` sets DEPLOY_TARGET for build and
 * deploy, which turns that mistake into a failed build. (The publishable key is
 * not checked: it is read at runtime, so a Worker variable can supply it.)
 */
if (process.env.DEPLOY_TARGET === "cloudflare") {
  const isLocal = (url: string) => !url || /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url)
  const problems = (
    [
      ["NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL],
    ] as const
  )
    .filter(([, value]) => isLocal(value || ""))
    .map(([name, value]) => `${name} is "${value || "unset"}"`)
  if (problems.length) {
    throw new Error(
      `Refusing to build the storefront for deployment:\n  - ${problems.join("\n  - ")}\n` +
        "These are compiled into the bundle and cannot be changed afterwards. Set them in " +
        "apps/storefront/.env.production or in the build environment; a real environment " +
        "variable wins over every .env file."
    )
  }
}

const nextConfig: NextConfig = {
  // A separate output folder lets a production build run without
  // overwriting a running dev server's .next (which breaks its chunks).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Lets phones and other machines on the LAN load dev assets, e.g.
  // DEV_ORIGINS=192.168.100.232,my-laptop.local
  allowedDevOrigins: (process.env.DEV_ORIGINS || "192.168.*.*,10.*.*.*,*.local")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // Covers are plain <img> tags served from static assets or R2, so the
  // /_next/image optimizer is switched off rather than left as an endpoint
  // that fetches arbitrary URLs on request.
  images: { unoptimized: true },
  async rewrites() {
    return []
  },
  async headers() {
    const security = [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing on this domain may be framed, and it frames nothing but
          // its own payment widgets. The admin lives on another origin.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), usb=(), interest-cohort=(), payment=(self \"https://js.stripe.com\")",
          },
          // The rest of the policy (script nonces) is per request, in middleware.ts.
        ],
      },
    ]
    if (isProd) {
      security[0].headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000" })
    }
    // Dev chunk names are not content-hashed, so immutable caching would pin
    // stale chunks in the browser and cause ChunkLoadError after rebuilds.
    if (!isProd) {
      return security
    }
    return [
      ...security,
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ]
  },
}

export default nextConfig
