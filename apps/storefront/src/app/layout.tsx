import type { Metadata } from "next"
import { Amiri, Cormorant_Garamond, Jost } from "next/font/google"
import { BackToTop } from "@/components/back-to-top"
import { CartProvider } from "@/components/cart-context"
import { NewsletterPopup } from "@/components/newsletter"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { StaleActionGuard } from "@/components/stale-action-guard"
import { getCustomer } from "@/lib/auth"
import { getCart, summarizeCart } from "@/lib/cart"
import { getFreeShippingThreshold, getRegionContext, listRegions } from "@/lib/medusa"
import { siteUrl } from "@/lib/config"
import { getSiteConfig, themeCss, whatsappLink } from "@/lib/site-config"
import "./globals.css"

// Jost: a geometric sans in the British (Johnston/Futura) tradition.
const sans = Jost({ variable: "--font-sans", subsets: ["latin"], display: "swap" })
// Cormorant Garamond: classical Garamond display serif for headings and the wordmark.
const serif = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
})
const arabic = Amiri({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Maktabah Ruhayn | Islamic Books, Qur'an, Hadith & Multi-volume Sets",
    template: "%s | Maktabah Ruhayn",
  },
  description:
    "An international Islamic bookstore: Qur'an, tafsir, hadith collections and children's books, priced in your currency. M-Pesa in Kenya, shipping worldwide.",
  openGraph: { siteName: "Maktabah Ruhayn", type: "website" },
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const region = await getRegionContext()
  const [regions, cart, threshold, customer, site] = await Promise.all([
    listRegions(),
    getCart(),
    getFreeShippingThreshold(region.currency),
    getCustomer().catch(() => null),
    getSiteConfig(),
  ])
  const whatsapp = whatsappLink(site.business.whatsapp, `Assalamu alaikum ${site.business.name}, `)

  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss(site.theme) }} />
      </head>
      <body className={`${sans.variable} ${serif.variable} ${arabic.variable}`}>
        <CartProvider initialSummary={summarizeCart(cart)} freeShippingThreshold={threshold}>
          {site.content.announcement ? <div className="announcement">{site.content.announcement}</div> : null}
          <SiteHeader
            region={region}
            regions={regions}
            freeShippingThreshold={threshold}
            customer={customer}
            site={site}
          />
          <div id="main">{children}</div>
          <SiteFooter site={site} country={region.country} />
          <BackToTop />
          {whatsapp ? (
            <a className="whatsapp-fab" href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp">
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="currentColor">
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
              </svg>
            </a>
          ) : null}
          <NewsletterPopup defaultCountry={region.country} />
          <StaleActionGuard />
        </CartProvider>
      </body>
    </html>
  )
}
