"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "./icons"

/** Horizontally scrolling shelf with previous/next buttons, like B&N rows. */
export function Carousel({ label, children }: { label: string; children: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const update = useCallback(() => {
    const el = trackRef.current
    if (!el) {
      return
    }
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    update()
    const el = trackRef.current
    if (!el) {
      return
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    el.addEventListener("scroll", update, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener("scroll", update)
    }
  }, [update])

  const scroll = (direction: 1 | -1) => {
    const el = trackRef.current
    if (el) {
      el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" })
    }
  }

  return (
    <div className="carousel" role="region" aria-label={label}>
      <button
        type="button"
        className="carousel-btn prev"
        onClick={() => scroll(-1)}
        aria-label={`Previous ${label}`}
        hidden={!canPrev}
      >
        <ChevronLeft size={22} />
      </button>
      <div className="carousel-track" ref={trackRef}>
        {children}
      </div>
      <button
        type="button"
        className="carousel-btn next"
        onClick={() => scroll(1)}
        aria-label={`Next ${label}`}
        hidden={!canNext}
      >
        <ChevronRight size={22} />
      </button>
    </div>
  )
}
