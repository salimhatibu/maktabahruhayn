"use client"

import { useEffect, useRef, useState } from "react"

export function ReadMore({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (el) {
      setOverflowing(el.scrollHeight > el.clientHeight + 4)
    }
  }, [])

  return (
    <div>
      <div ref={ref} className={`read-more ${expanded ? "is-expanded" : ""}`}>
        {children}
      </div>
      {overflowing ? (
        <button type="button" className="link-btn" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? "Read Less ↑" : "Read More ↓"}
        </button>
      ) : null}
    </div>
  )
}
