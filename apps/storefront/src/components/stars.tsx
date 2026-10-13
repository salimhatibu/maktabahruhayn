/** Read-only star rating with partial fills (e.g. 4.5 stars). */
export function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100))
  return (
    <span
      className="stars"
      style={{ "--star-size": `${size}px`, "--star-fill": `${pct}%` } as React.CSSProperties}
      role="img"
      aria-label={label || `${value.toFixed(1)} out of 5 stars`}
    >
      <span aria-hidden="true">★★★★★</span>
    </span>
  )
}

export function RatingLine({ average, count, href }: { average: number; count: number; href?: string }) {
  const body = (
    <>
      <Stars value={average} />
      <span className="rating-count">
        {average.toFixed(1)} ({count})
      </span>
    </>
  )
  return href ? (
    <a href={href} className="rating-line">
      {body}
    </a>
  ) : (
    <span className="rating-line">{body}</span>
  )
}
