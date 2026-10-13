import Link from "next/link"
import { Suspense } from "react"
import type { Customer } from "@/lib/auth"
import { countryName, formatMoney } from "@/lib/format"
import type { RegionContext, StoreRegion } from "@/lib/medusa"
import type { SiteConfig } from "@/lib/site-config"
import { HeaderCartButton } from "./cart-context"
import { ContactOptions } from "./contact-options"
import { HelpIcon, TruckIcon, UserIcon } from "./icons"
import { MegaNav } from "./mega-nav"
import { PromoBar, type PromoMessage } from "./promo-bar"
import { RegionSwitcher, type RegionOption } from "./region-switcher"
import { SearchBox } from "./search-box"
import { MenuButton, MenuDrawer, MenuProvider } from "./site-menu"
import { HeaderWishlistLink } from "./wishlist"

export function SiteHeader({
  region,
  regions,
  freeShippingThreshold,
  customer,
  site,
}: {
  region: RegionContext
  regions: StoreRegion[]
  freeShippingThreshold: number | null
  customer: Customer | null
  site: SiteConfig
}) {
  const messages: PromoMessage[] = [
    ...(freeShippingThreshold
      ? [
          {
            text: `Free Standard Shipping on Orders of ${formatMoney(freeShippingThreshold, region.currency)} or More`,
            href: "/help#shipping",
          },
        ]
      : []),
    region.mpesa
      ? { text: "Pay with M-Pesa: Lipa na M-Pesa at Checkout", href: "/help#payments" }
      : { text: `Prices in ${region.currency.toUpperCase()}: Shipping Worldwide`, href: "/help#currency" },
    ...site.content.promoMessages.filter((m) => m.text),
  ]

  const options: RegionOption[] = regions
    .map((r) => ({
      group: r.name,
      currency: r.currency_code,
      countries: (r.countries || [])
        .map((c) => ({ code: c.iso_2.toUpperCase(), name: countryName(c.iso_2) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.group.localeCompare(b.group))

  return (
    <MenuProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <PromoBar messages={messages} />
      <header className="site-header">
        <div className="header-row wrap">
          <MenuButton className="menu-toggle-mobile" />
          <Link href="/" className="logo" aria-label={`${site.business.name} home`}>
            <LogoText name={site.business.name} />
          </Link>
          <SearchBox popular={site.content.popularSearches.filter(Boolean)} />
          <div className="header-utils">
            {options.length ? (
              <RegionSwitcher current={region.country} currency={region.currency} options={options} />
            ) : null}
            <Link href="/order-status" className="util-link util-optional">
              <TruckIcon size={20} />
              <span>Order Status</span>
            </Link>
            <Link href={customer ? "/account" : "/account/login"} className="util-link" aria-label={customer ? "My account" : "Sign in"}>
              <UserIcon size={20} />
              <span>{customer ? `Hi, ${customer.first_name || "Reader"}` : "Sign In"}</span>
            </Link>
            <span className="util-optional">
              <ContactOptions
                contact={{
                  name: site.business.name,
                  phone: site.business.phone,
                  email: site.business.email,
                  whatsapp: site.business.whatsapp,
                  instagram: site.business.instagram,
                }}
                label="Contact"
              />
            </span>
            <Link href="/help" className="util-link util-optional">
              <HelpIcon size={20} />
              <span>Help</span>
            </Link>
            <span className="header-cart-mobile">
              <HeaderCartButton />
            </span>
          </div>
        </div>
        <Suspense fallback={<div className="mega-nav" />}>
          <MegaNav
            items={site.navigation.items}
            leading={<MenuButton label="Menu" className="menu-toggle-desktop" />}
            actions={
              <>
                <HeaderWishlistLink />
                <HeaderCartButton />
              </>
            }
          />
        </Suspense>
      </header>
      <Suspense fallback={null}>
        <MenuDrawer
          items={site.navigation.items}
          regions={options}
          country={region.country}
          currency={region.currency}
          signedIn={Boolean(customer)}
          customerName={customer?.first_name || null}
          contact={{ phone: site.business.phone, email: site.business.email, whatsapp: site.business.whatsapp }}
        />
      </Suspense>
    </MenuProvider>
  )
}

/** The store's name as a single wordmark. */
export function LogoText({ name }: { name: string }) {
  return <span className="wordmark">{name}</span>
}

/** Thin promotional strip used on product, cart, and listing pages. */
export function PromoStrip() {
  return (
    <Link href="/search?binding_type=multi_volume_box_set" className="promo-strip">
      <span className="promo-strip-kicker">The Maktabah Ruhayn</span>
      <span className="promo-strip-title">Classical Collections</span>
      <span className="promo-strip-sub">Multi-volume sets for your home library</span>
      <span className="promo-strip-cta">Shop Now</span>
    </Link>
  )
}
