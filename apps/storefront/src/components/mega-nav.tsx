"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import type { NavItem } from "@/lib/catalog"
import { ChevronRight } from "./icons"

/**
 * Category bar with full-width dropdown panels. Opens on hover (with a short
 * intent delay), on keyboard focus, and closes on Escape or navigation.
 */
export function MegaNav({
  items,
  actions,
  leading,
}: {
  items: NavItem[]
  actions: React.ReactNode
  leading?: React.ReactNode
}) {
  const [open, setOpen] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    setOpen(null)
  }, [pathname, searchParams])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const schedule = (value: number | null, delay: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(value), delay)
  }

  const currentHref = `${pathname}${searchParams.size ? `?${searchParams}` : ""}`

  return (
    <nav className="mega-nav" aria-label="Shop by category" onMouseLeave={() => schedule(null, 150)}>
      <div className="mega-row wrap">
        {leading}
        <ul className="mega-list">
          {items.map((item, i) => (
            <li
              key={item.label}
              onMouseEnter={() => schedule(item.columns ? i : null, open === null ? 180 : 60)}
              onFocus={() => item.columns && setOpen(i)}
            >
              <Link
                href={item.href}
                className={`mega-link ${open === i ? "is-open" : ""} ${currentHref === item.href ? "is-current" : ""}`}
                aria-expanded={item.columns ? open === i : undefined}
                aria-haspopup={item.columns ? "true" : undefined}
              >
                {item.label}
              </Link>
              {item.columns ? (
                <div className="mega-panel" hidden={open !== i}>
                  <div className="mega-panel-inner wrap">
                    {item.columns.map((column) => (
                      <div key={column.heading} className="mega-col">
                        {column.href ? (
                          <Link href={column.href} className="mega-heading">
                            {column.heading} <ChevronRight size={16} />
                          </Link>
                        ) : (
                          <p className="mega-heading">{column.heading}</p>
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
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mega-actions">{actions}</div>
      </div>
    </nav>
  )
}
