"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useId, useState } from "react"

/** Filter sidebar on wide screens; a collapsible panel behind a "Filters" button on phones. */
export function FiltersPanel({ label, summary, children }: { label: string; summary?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const pathname = usePathname()
  const params = useSearchParams()
  useEffect(() => setOpen(false), [pathname, params])

  return (
    <div className="filters-wrap">
      <button type="button" className="filters-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
        </svg>
        <span>{open ? "Hide filters" : "Filters"}</span>
        {summary ? <span className="filters-summary">{summary}</span> : null}
      </button>
      <aside id={id} className={`filters ${open ? "is-open" : ""}`} aria-label={label}>
        {children}
      </aside>
    </div>
  )
}
