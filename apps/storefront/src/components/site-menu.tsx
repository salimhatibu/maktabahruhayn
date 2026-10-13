"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { setRegionAction } from "@/app/actions/cart"
import type { NavItem } from "@/lib/catalog"
import { ChevronRight, CloseIcon, GlobeIcon, HeartIcon, HelpIcon, MenuIcon, PhoneIcon, TruckIcon, UserIcon } from "./icons"
import type { RegionOption } from "./region-switcher"

type MenuState = { open: boolean; setOpen: (open: boolean) => void }

const MenuContext = createContext<MenuState>({ open: false, setOpen: () => undefined })

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <MenuContext.Provider value={{ open, setOpen }}>{children}</MenuContext.Provider>
}

/** The three-line button that opens the menu drawer. */
export function MenuButton({ label, className = "" }: { label?: string; className?: string }) {
  const { open, setOpen } = useContext(MenuContext)
  return (
    <button
      type="button"
      className={`menu-toggle ${className}`}
      aria-label={label ? undefined : "Open menu"}
      aria-expanded={open}
      aria-controls="site-menu"
      onClick={() => setOpen(true)}
    >
      <MenuIcon size={24} />
      {label ? <span>{label}</span> : null}
    </button>
  )
}

type Contact = { phone: string; email: string; whatsapp: string }

/**
 * Slide-in menu: every department with collapsible sub-sections, account
 * links, delivery country and ways to get in touch.
 */
export function MenuDrawer({
  items,
  regions,
  country,
  currency,
  signedIn,
  customerName,
  contact,
}: {
  items: NavItem[]
  regions: RegionOption[]
  country: string
  currency: string
  signedIn: boolean
  customerName: string | null
  contact: Contact
}) {
  const { open, setOpen } = useContext(MenuContext)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  const regionForm = useRef<HTMLFormElement>(null)
  const close = useCallback(() => setOpen(false), [setOpen])

  // Close on navigation.
  useEffect(() => {
    setOpen(false)
  }, [pathname, searchParams, setOpen])

  useEffect(() => {
    if (!open) {
      return
    }
    lastFocus.current = document.activeElement as HTMLElement | null
    const html = document.documentElement
    const previous = html.style.overflow
    html.style.overflow = "hidden"
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close()
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select, summary, input, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      html.style.overflow = previous
      document.removeEventListener("keydown", onKey)
      lastFocus.current?.focus?.()
    }
  }, [open, close])

  const wa = contact.whatsapp.replace(/\D/g, "")

  return (
    <div className={`menu-root ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="menu-scrim" onClick={close} />
      <div
        id="site-menu"
        ref={panelRef}
        className="menu-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        inert={!open}
      >
        <div className="menu-head">
          <p className="menu-greeting">{signedIn ? `Assalamu alaikum, ${customerName || "Reader"}` : "Browse the shop"}</p>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close menu">
            <CloseIcon size={22} />
          </button>
        </div>

        <div className="menu-body">
          <nav aria-label="Departments">
            <ul className="menu-list">
              {items.map((item) =>
                item.columns?.length ? (
                  <li key={item.label}>
                    <details className="menu-group">
                      <summary>
                        {item.label}
                        <ChevronRight size={18} />
                      </summary>
                      <div className="menu-sub">
                        <Link href={item.href} className="menu-all">
                          Shop all {item.label}
                        </Link>
                        {item.columns.map((column) => (
                          <div key={column.heading} className="menu-col">
                            {column.href ? (
                              <Link href={column.href} className="menu-col-heading">
                                {column.heading}
                              </Link>
                            ) : (
                              <p className="menu-col-heading">{column.heading}</p>
                            )}
                            <ul>
                              {column.links.map((link) => (
                                <li key={link.label}>
                                  <Link href={link.href}>{link.label}</Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  </li>
                ) : (
                  <li key={item.label}>
                    <Link href={item.href} className="menu-link">
                      {item.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </nav>

          <ul className="menu-utils">
            <li>
              <Link href={signedIn ? "/account" : "/account/login"}>
                <UserIcon size={20} /> {signedIn ? "My Account" : "Sign In or Create an Account"}
              </Link>
            </li>
            <li>
              <Link href="/order-status">
                <TruckIcon size={20} /> Order Status
              </Link>
            </li>
            <li>
              <Link href="/wishlist">
                <HeartIcon size={20} /> Wishlist
              </Link>
            </li>
            <li>
              <Link href="/help">
                <HelpIcon size={20} /> Help Centre
              </Link>
            </li>
          </ul>

          {regions.length ? (
            <form ref={regionForm} action={setRegionAction} className="menu-region">
              <label htmlFor="menu-ship-to">
                <GlobeIcon size={20} /> Ship to <span className="muted">· prices in {currency.toUpperCase()}</span>
              </label>
              <select id="menu-ship-to" name="country" defaultValue={country} onChange={() => regionForm.current?.requestSubmit()}>
                {regions.map((group) => (
                  <optgroup key={group.group} label={`${group.group} (${group.currency.toUpperCase()})`}>
                    {group.countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </form>
          ) : null}

          {contact.phone || contact.email || wa ? (
            <div className="menu-contact">
              <p className="menu-col-heading">Talk to a bookseller</p>
              {wa ? (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              ) : null}
              {contact.phone ? (
                <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>
                  <PhoneIcon size={18} /> {contact.phone}
                </a>
              ) : null}
              {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
