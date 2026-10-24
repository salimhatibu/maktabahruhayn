"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "./icons"
import { Countdown } from "./countdown"

export type PromoMessage = { text: string; href: string; endDate?: string }

export function PromoBar({ messages }: { messages: PromoMessage[] }) {
  const [index, setIndex] = useState(0)
  const count = messages.length

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), 6000)
    return () => window.clearInterval(timer)
  }, [count])

  if (!count) {
    return null
  }

  const message = messages[index]

  return (
    <div className="promo-bar">
      <div className="promo-inner wrap">
        <div className="promo-rotator">
          <button
            type="button"
            aria-label="Previous message"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
          >
            <ChevronLeft size={16} />
          </button>
          <Link href={message.href} aria-live="polite">
            {message.text}
            {message.endDate ? (
              <>
                {" "}
                <Countdown endDate={message.endDate} compact />
              </>
            ) : null}
          </Link>
          <button
            type="button"
            aria-label="Next message"
            onClick={() => setIndex((i) => (i + 1) % count)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
