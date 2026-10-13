import type { NextConfig } from "next"

const isProd = process.env.NODE_ENV === "production"

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
    // Dev chunk names are not content-hashed, so immutable caching would pin
    // stale chunks in the browser and cause ChunkLoadError after rebuilds.
    if (!isProd) {
      return []
    }
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ]
  },
}

export default nextConfig
