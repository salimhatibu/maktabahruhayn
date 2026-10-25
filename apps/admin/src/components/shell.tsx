"use client"

import {
  ArrowUpRightOnBox,
  BarsThree,
  BellAlert,
  BuildingStorefront,
  Buildings,
  ChartBar,
  CurrencyDollar,
  Envelope,
  ExclamationCircle,
  ShoppingCart,
  SquaresPlus,
  Star,
  Swatch,
  Tag,
  TruckFast,
  Users,
  XMark,
} from "@medusajs/icons"
import { TooltipProvider, clx } from "@medusajs/ui"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"

/** The same sections, in the same order, as the previous admin. */
const NAV = [
  { group: "Sales", items: [
    { href: "/", label: "Dashboard", icon: ChartBar },
    { href: "/orders", label: "Orders", icon: ShoppingCart },
    { href: "/payments", label: "Payments", icon: CurrencyDollar },
    { href: "/shipping", label: "Shipping", icon: TruckFast },
  ] },
  { group: "Catalogue", items: [
    { href: "/products", label: "Products", icon: Tag },
    { href: "/reviews", label: "Reviews", icon: Star },
    { href: "/stock-alerts", label: "Stock Alerts", icon: BellAlert },
  ] },
  { group: "Customers", items: [
    { href: "/customers", label: "Customers", icon: Users },
    { href: "/newsletter", label: "Newsletter", icon: Envelope },
    { href: "/emails", label: "Emails", icon: Envelope },
  ] },
  { group: "Website", items: [
    { href: "/storefront", label: "Storefront", icon: BuildingStorefront },
    { href: "/menus", label: "Menus", icon: SquaresPlus },
    { href: "/appearance", label: "Appearance", icon: Swatch },
    { href: "/business", label: "Business Details", icon: Buildings },
  ] },
]

const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))

function currentPage(pathname: string) {
  for (const section of NAV) {
    const item = section.items.find((i) => isActive(i.href, pathname))
    if (item) return { group: section.group, label: item.label }
  }
  return { group: "Admin", label: "Maktabah Ruhayn" }
}

function initials(email: string) {
  const name = email.includes("@") ? email.split("@")[0] : email
  const parts = name.split(/[.\s_-]+/).filter(Boolean)
  return ((parts[0]?.[0] || "A") + (parts[1]?.[0] || "")).toUpperCase()
}

function Brand() {
  return (
    <Link href="/" className="mr-brand" aria-label="Maktabah Ruhayn dashboard">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Maktabah Ruhayn" className="mr-brand-logo" width={120} height={36} />
      <span className="mr-brand-text">
        <small>Shop admin</small>
      </span>
    </Link>
  )
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="mr-nav" aria-label="Admin sections">
      {NAV.map((section) => (
        <div key={section.group} className="mr-nav-group">
          <p className="mr-nav-heading">{section.group}</p>
          <ul>
            {section.items.map((item) => {
              const active = isActive(item.href, pathname)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={clx("mr-nav-link", active && "is-active")}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SidebarFooter({ email, storefrontUrl }: { email: string; storefrontUrl: string }) {
  return (
    <div className="mr-sidebar-foot">
      {storefrontUrl ? (
        <a className="mr-store-card" href={storefrontUrl} target="_blank" rel="noopener noreferrer">
          <BuildingStorefront />
          <span>
            <strong>Visit the shop</strong>
            <small>Opens in a new tab</small>
          </span>
          <ArrowUpRightOnBox />
        </a>
      ) : null}
      <div className="mr-user">
        <span className="mr-avatar" aria-hidden="true">
          {initials(email)}
        </span>
        <span className="mr-user-text">
          <strong title={email}>{email}</strong>
          <small>Administrator</small>
        </span>
      </div>
    </div>
  )
}

export function Shell({
  children,
  email,
  verified,
  open,
  storefrontUrl,
}: {
  children: ReactNode
  email: string
  verified: boolean
  /** No sign-in is required: anyone with the address is an administrator. */
  open: boolean
  storefrontUrl: string
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [today, setToday] = useState("")
  const page = currentPage(pathname)

  // A route change closes the drawer, so the phone never lands on a new page
  // with the menu still covering it.
  useEffect(() => setMenuOpen(false), [pathname])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [menuOpen])

  // Rendered on the client only, so the server's time zone never shows.
  useEffect(() => {
    setToday(new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date()))
  }, [])

  return (
    // Medusa UI components that carry a tooltip - Copy among them - throw
    // unless a provider sits above them, so the whole console is wrapped once.
    <TooltipProvider>
      <div className="mr-app">
        <aside className="mr-sidebar">
          <Brand />
          <Navigation />
          <SidebarFooter email={email} storefrontUrl={storefrontUrl} />
        </aside>

        {menuOpen ? (
          <div className="mr-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <button type="button" className="mr-drawer-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
            <div className="mr-drawer-panel">
              <div className="mr-drawer-head">
                <Brand />
                <button type="button" className="mr-icon-btn" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                  <XMark />
                </button>
              </div>
              <Navigation onNavigate={() => setMenuOpen(false)} />
              <SidebarFooter email={email} storefrontUrl={storefrontUrl} />
            </div>
          </div>
        ) : null}

        <div className="mr-workspace">
          <header className="mr-topbar">
            <button
              type="button"
              className="mr-icon-btn mr-menu-btn"
              aria-expanded={menuOpen}
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <BarsThree />
            </button>
            <div className="mr-topbar-title">
              <small>{page.group}</small>
              <strong>{page.label}</strong>
            </div>
            <div className="mr-topbar-right">
              {today ? <span className="mr-date">{today}</span> : null}
              {!verified && !open ? (
                <span className="mr-pill mr-pill-warn" title="The Cloudflare Access assertion was not verified">
                  Unverified
                </span>
              ) : null}
              {storefrontUrl ? (
                <a className="mr-btn-ghost" href={storefrontUrl} target="_blank" rel="noopener noreferrer">
                  <ArrowUpRightOnBox />
                  <span>View store</span>
                </a>
              ) : null}
              <span className="mr-avatar mr-avatar-sm" title={email} aria-hidden="true">
                {initials(email)}
              </span>
            </div>
          </header>

          <main className="mr-main">
            {open ? (
              <div className="mr-alert" role="alert">
                <ExclamationCircle />
                <p>
                  <strong>This dashboard has no sign-in.</strong> Anyone who knows the address can read customer
                  details and change the shop. Put a Cloudflare Access policy on this hostname and set ADMIN_OPEN to
                  false.
                </p>
              </div>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  )
}
