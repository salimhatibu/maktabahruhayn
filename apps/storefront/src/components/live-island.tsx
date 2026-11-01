"use client"

import { useEffect, useRef, useState } from "react"

/** How often the browser says "still here". Shorter than the server's window. */
const BEAT_MS = 25_000

function useLiveCount() {
  const [live, setLive] = useState<number | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let stopped = false
    const beat = async () => {
      // A hidden tab is not a visitor looking at the shop.
      if (document.visibilityState !== "visible") return
      try {
        const res = await fetch("/api/presence", { method: "POST", cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { live?: number }
        if (!stopped && typeof data.live === "number") setLive(data.live)
      } catch {
        // Offline or blocked: keep the last figure rather than flashing an error.
      }
    }
    void beat()
    timer.current = window.setInterval(beat, BEAT_MS)
    document.addEventListener("visibilitychange", beat)
    return () => {
      stopped = true
      if (timer.current) window.clearInterval(timer.current)
      document.removeEventListener("visibilitychange", beat)
    }
  }, [])

  return live
}

/**
 * A pill at the very top of the page showing how many people are on the shop,
 * borrowing the Dynamic Island's behaviour: it sits compact, swells briefly
 * when the figure changes, and settles back.
 *
 * It occupies a reserved strip rather than floating over the page, so it can
 * never cover the header or anything else at any width.
 */
export function LiveIsland() {
  const live = useLiveCount()
  const [pulsing, setPulsing] = useState(false)
  const [shown, setShown] = useState<number | null>(null)
  const previous = useRef<number | null>(null)

  useEffect(() => {
    if (live === null) return
    setShown(live)
    if (previous.current !== null && previous.current !== live) {
      setPulsing(true)
      const t = window.setTimeout(() => setPulsing(false), 900)
      previous.current = live
      return () => window.clearTimeout(t)
    }
    previous.current = live
  }, [live])

  // Nothing is claimed until the first beat answers.
  const ready = shown !== null
  const label = shown === 1 ? "You are browsing" : `${shown} people browsing`

  return (
    <div className="live-island-strip" aria-hidden={!ready}>
      <div
        className={`live-island${ready ? " is-ready" : ""}${pulsing ? " is-pulsing" : ""}`}
        role="status"
        aria-live="polite"
        aria-label={ready ? label : undefined}
      >
        <span className="live-island-dot" aria-hidden="true" />
        <span className="live-island-count">{ready ? shown : ""}</span>
        <span className="live-island-text">{shown === 1 ? "browsing" : "browsing now"}</span>
      </div>
    </div>
  )
}
