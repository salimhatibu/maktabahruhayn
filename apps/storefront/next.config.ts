import type { NextConfig } from "next"

const isProd = process.env.NODE_ENV === "production"

/**
 * Next.js inlines NEXT_PUBLIC_* values into the bundle at build time, so a
 * Worker variable cannot correct them afterwards. The cf:build and cf:deploy
 * scripts set DEPLOY_TARGET, which makes a build that would bake in local or
 * missing values fail here instead of shipping a storefront that talks to
 * localhost. Values come from .env.production, or from the build environment.
 */
if (process.env.DEPLOY_TARGET === "cloudflare") {
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || ""
  const site = process.env.NEXT_PUBLIC_SITE_URL || ""
  const isLocal = (url: string) => !url || /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url)
  const problems = [
    isLocal(backend) && `NEXT_PUBLIC_MEDUSA_BACKEND_URL is "${backend || "unset"}"`,
    isLocal(site) && `NEXT_PUBLIC_SITE_URL is "${site || "unset"}"`,
    !process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY && "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is unset",
  ].filter(Boolean)
  if (problems.length) {
    throw new Error(
      `Refusing to build the storefront for deployment:\n  - ${problems.join("\n  - ")}\n` +
        "These are compiled into the bundle and cannot be changed after the build. " +
        "Set them in apps/storefront/.env.production or in the build environment " +
        "(a real environment variable wins over the file, and over .env.local)."
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
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
  async rewrites() {
    const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
    // Serve the backend's locally stored uploads from the storefront origin.
    return [{ source: "/static/:path*", destination: `${backend}/static/:path*` }]
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
        ],
      },
    ]
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
