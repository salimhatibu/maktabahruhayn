import type { Metadata } from "next"
import { headers } from "next/headers"
import { IDENTITY_HEADER, type AdminIdentity } from "@/lib/access"
import { Shell } from "@/components/shell"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "Maktabah Admin", template: "%s | Maktabah Admin" },
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Set by middleware.ts once the Access check has passed; it never reaches
  // here otherwise.
  const raw = (await headers()).get(IDENTITY_HEADER)
  const admin = JSON.parse(decodeURIComponent(raw || "null")) as AdminIdentity | null
  // Catalogue covers are stored as storefront-relative paths; the admin runs on
  // its own hostname, so mediaSrc() needs the storefront origin to show them.
  const storefrontUrl = (process.env.STOREFRONT_URL || "").replace(/\/+$/, "")
  return (
    <html lang="en">
      <head>
        <meta name="storefront-url" content={storefrontUrl} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geologica:wght@300..700&family=JetBrains+Mono:wght@400..700&family=Cormorant+Garamond:ital,wght@0,400..700;1,400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {admin ? (
          <Shell email={admin.email} verified={admin.verified} open={admin.open} storefrontUrl={storefrontUrl}>
            {children}
          </Shell>
        ) : (
          <main className="mr-empty-page">
            <h1>Sign in required</h1>
            <p>Open the admin through its own hostname, where Cloudflare Access signs you in.</p>
          </main>
        )}
      </body>
    </html>
  )
}
