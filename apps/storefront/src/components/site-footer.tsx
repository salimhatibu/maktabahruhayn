import Link from "next/link"
import { SUBJECTS } from "@/lib/catalog"
import type { SiteConfig } from "@/lib/site-config"
import { ContactOptions } from "./contact-options"
import { NewsletterForm } from "./newsletter"
import { LogoText } from "./site-header"

export function SiteFooter({ site, country = "KE" }: { site: SiteConfig; country?: string }) {
  const b = site.business
  const socials = [
    { label: "Instagram", href: b.instagram },
    { label: "Facebook", href: b.facebook },
    { label: "X", href: b.x },
  ].filter((s) => /^https?:\/\//.test(s.href))

  return (
    <footer className="site-footer">
      <div className="footer-news wrap">
        <div>
          <h2>Stay in the Know</h2>
          <p>Receive curated bookseller recommendations, new arrivals, pre-orders and offers. Unsubscribe anytime.</p>
        </div>
        <NewsletterForm source="footer" layout="inline" defaultCountry={country} />
      </div>
      <div className="footer-grid wrap">
        <div className="footer-brand">
          <p className="logo logo-invert">
            <LogoText name={b.name} />
          </p>
          <p>{b.tagline}</p>
          <address className="footer-contact">
            {b.address ? <span>{b.address}</span> : null}
            {b.phone ? <a href={`tel:${b.phone.replace(/\s/g, "")}`}>{b.phone}</a> : null}
            {b.email ? <a href={`mailto:${b.email}`}>{b.email}</a> : null}
          </address>
          <ContactOptions
            contact={{ name: b.name, phone: b.phone, email: b.email, whatsapp: b.whatsapp, instagram: b.instagram }}
            label="Contact Options"
            className="btn btn-outline-light btn-sm"
          />
          {socials.length ? (
            <p className="footer-social">
              {socials.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              ))}
            </p>
          ) : null}
        </div>
        <div>
          <h2>Shop</h2>
          <ul>
            <li><Link href="/books?tag=bestseller">Bestsellers</Link></li>
            <li><Link href="/books?tag=new-release">New Arrivals</Link></li>
            <li><Link href="/books?sale=1">Sale Items</Link></li>
            <li><Link href="/books?tag=coming-soon">Pre-Order</Link></li>
            <li><Link href="/search?binding_type=multi_volume_box_set">Multi-volume Sets</Link></li>
          </ul>
        </div>
        <div>
          <h2>Departments</h2>
          <ul>
            {SUBJECTS.slice(0, 6).map((s) => (
              <li key={s.handle}>
                <Link href={`/books?category=${s.handle}`}>{s.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Help</h2>
          <ul>
            {site.navigation.footerLinks.map((l) => (
              <li key={l.href + l.label}>
                <Link href={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="footer-base wrap">
        <p>&copy; {new Date().getFullYear()} {b.name}</p>
        <p>Lipa na M-Pesa in Kenya · Cards by Stripe · Rates by Shippo · FX by ExchangeRate-API</p>
      </div>
    </footer>
  )
}
