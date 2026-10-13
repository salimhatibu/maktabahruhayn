"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "./icons"

export function HeroCarousel({ slides, labels }: { slides: React.ReactNode[]; labels: string[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length

  useEffect(() => {
    if (paused || count < 2) {
      return
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) {
      return
    }
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), 7000)
    return () => window.clearInterval(timer)
  }, [paused, count])

  if (!count) {
    return null
  }

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((slide, i) => (
        <div
          key={labels[i] || i}
          className="hero-slide"
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}: ${labels[i] || ""}`}
          hidden={i !== index}
        >
          {slide}
        </div>
      ))}
      {count > 1 ? (
        <>
          <button
            type="button"
            className="hero-arrow prev"
            aria-label="Previous slide"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
          >
            <ChevronLeft size={26} />
          </button>
          <button
            type="button"
            className="hero-arrow next"
            aria-label="Next slide"
            onClick={() => setIndex((i) => (i + 1) % count)}
          >
            <ChevronRight size={26} />
          </button>
          <div className="hero-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                className={i === index ? "is-active" : ""}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
