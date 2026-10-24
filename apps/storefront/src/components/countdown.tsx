"use client"

import { useEffect, useState } from "react"

function calcRemaining(endDate: string) {
  const diff = new Date(endDate).getTime() - Date.now()
  if (diff <= 0) return null
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  return { days, hours, minutes, seconds }
}

export function Countdown({
  endDate,
  label,
  compact,
}: {
  endDate: string
  label?: string
  compact?: boolean
}) {
  const [remaining, setRemaining] = useState(calcRemaining(endDate))

  useEffect(() => {
    const timer = setInterval(() => {
      const r = calcRemaining(endDate)
      setRemaining(r)
      if (!r) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [endDate])

  if (!remaining) return null

  if (compact) {
    const parts: string[] = []
    if (remaining.days > 0) parts.push(`${remaining.days}d`)
    parts.push(`${remaining.hours}h`)
    parts.push(`${remaining.minutes}m`)
    parts.push(`${remaining.seconds}s`)
    return (
      <span className="countdown-compact">
        {label ? <span className="countdown-label">{label}</span> : null}
        <span className="countdown-time">{parts.join(" ")}</span>
      </span>
    )
  }

  return (
    <div className="countdown" role="timer" aria-label={label || "Sale ends in"}>
      {label ? <span className="countdown-label">{label}</span> : null}
      <div className="countdown-blocks">
        <div className="countdown-block">
          <span className="countdown-value">{String(remaining.days).padStart(2, "0")}</span>
          <span className="countdown-unit">Days</span>
        </div>
        <span className="countdown-sep">:</span>
        <div className="countdown-block">
          <span className="countdown-value">{String(remaining.hours).padStart(2, "0")}</span>
          <span className="countdown-unit">Hrs</span>
        </div>
        <span className="countdown-sep">:</span>
        <div className="countdown-block">
          <span className="countdown-value">{String(remaining.minutes).padStart(2, "0")}</span>
          <span className="countdown-unit">Min</span>
        </div>
        <span className="countdown-sep">:</span>
        <div className="countdown-block">
          <span className="countdown-value">{String(remaining.seconds).padStart(2, "0")}</span>
          <span className="countdown-unit">Sec</span>
        </div>
      </div>
    </div>
  )
}
