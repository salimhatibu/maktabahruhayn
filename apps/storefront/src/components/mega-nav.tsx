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
        <div className="mega-actions">{actions}</div>
      </div>
    </nav>
  )
}
