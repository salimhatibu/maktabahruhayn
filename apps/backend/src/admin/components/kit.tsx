import { Container, Heading, StatusBadge, Text, clx } from "@medusajs/ui"
import { useMemo, useRef, useState, type ComponentType, type ReactNode } from "react"

/** Area colours from theme.css: green sales, gold catalogue, plum customers, rose marketing, teal website. */
export type Tone = "green" | "gold" | "plum" | "rose" | "teal" | "slate"

export const toneClass = (tone?: Tone) => (tone ? `mr-tone-${tone}` : "")

type IconType = ComponentType<{ className?: string }>

/** A rounded square in the area colour holding an icon. */
export function IconChip({ icon: Icon, tone = "green", size = "md" }: { icon: IconType; tone?: Tone; size?: "sm" | "md" }) {
  return (
    <span
      className={clx(
        toneClass(tone),
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        size === "md" ? "h-10 w-10" : "h-8 w-8"
      )}
      style={{ background: "var(--mr-tone-soft)", color: "var(--mr-tone)" }}
      aria-hidden
    >
      <Icon />
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  tone,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  icon?: IconType
  tone?: Tone
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-3">
      <div className="flex min-w-0 items-center gap-3.5">
        {icon ? <IconChip icon={icon} tone={tone} /> : null}
        <div className="min-w-0">
          <Heading level="h1">{title}</Heading>
          {subtitle ? (
            <Text size="small" className="text-ui-fg-subtle mt-0.5">
              {subtitle}
            </Text>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
  flush = false,
  tone,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  /** Remove body padding (for edge-to-edge tables). */
  flush?: boolean
  /** Area colour for charts and icons inside the section. */
  tone?: Tone
}) {
  return (
    <Container className={clx("mb-3 divide-y p-0", toneClass(tone))}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="min-w-0">
          <Heading level="h2">{title}</Heading>
          {description ? (
            <Text size="small" className="text-ui-fg-subtle">
              {description}
            </Text>
          ) : null}
        </div>
        {actions}
      </div>
      <div className={flush ? "" : "px-6 py-4"}>{children}</div>
    </Container>
  )
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? (
    <Container className="mb-3 px-6 py-3">
      <Text size="small" className="text-ui-fg-error">
        {message}
      </Text>
    </Container>
  ) : null
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <Text size="small" weight="plus">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      ) : null}
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

export function Delta({ change }: { change: number | null | undefined }) {
  if (change === undefined) {
    return null
  }
  if (change === null) {
    return (
      <Text size="xsmall" className="text-ui-fg-muted">
        No prior data
      </Text>
    )
  }
  const up = change >= 0
  return (
    <span
      className={clx(
        "txt-compact-xsmall-plus inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 mr-tabular",
        change === 0
          ? "bg-ui-bg-component text-ui-fg-subtle"
          : up
            ? "bg-ui-tag-green-bg text-ui-tag-green-text"
            : "bg-ui-tag-red-bg text-ui-tag-red-text"
      )}
    >
      {change === 0 ? "" : up ? "↑" : "↓"}
      {Math.abs(change).toFixed(1)}%
    </span>
  )
}

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const path = useMemo(() => {
    if (values.length < 2) {
      return ""
    }
    const max = Math.max(...values, 1)
    const step = 100 / (values.length - 1)
    return values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(28 - (v / max) * 26).toFixed(2)}`).join(" ")
  }, [values])
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={clx("h-8 w-full", className)} aria-hidden="true">
      <path d={path} fill="none" stroke="var(--mr-tone, var(--fg-interactive))" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export type KpiItem = {
  label: string
  value: string
  change?: number | null
  hint?: string
  trend?: number[]
  tone?: Tone
}

/** One container, metrics separated by hairlines. */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <Container className="mb-3 grid grid-cols-1 divide-y p-0 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
      {items.map((k) => (
        <div
          key={k.label}
          className={clx("flex flex-col gap-1 px-6 py-4", toneClass(k.tone))}
        >
          <Text size="small" className="text-ui-fg-subtle">
            {k.label}
          </Text>
          <div className="flex items-baseline gap-2">
            <span className="txt-xlarge-plus mr-tabular text-ui-fg-base" style={{ fontSize: 26, lineHeight: "34px" }}>
              {k.value}
            </span>
            <Delta change={k.change} />
          </div>
          {k.trend ? <Sparkline values={k.trend} className="mt-1" /> : null}
          {k.hint ? (
            <Text size="xsmall" className="text-ui-fg-muted">
              {k.hint}
            </Text>
          ) : null}
        </div>
      ))}
    </Container>
  )
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

const W = 720
const H = 240
const PAD = { top: 12, right: 12, bottom: 26, left: 52 }

/** A round step (1, 2, 2.5 or 5 x 10^n) so axis labels read cleanly. */
function niceStep(v: number) {
  if (v <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  const n = v / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow
}

/** Line + area chart with axis labels and a hover readout. */
export function LineChart({
  data,
  format,
  axisFormat,
  tone,
}: {
  data: { label: string; value: number }[]
  format: (n: number) => string
  axisFormat?: (n: number) => string
  tone?: Tone
}) {
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const peak = Math.max(0, ...data.map((d) => d.value))
  const step = niceStep(peak / 4)
  const max = Math.max(step, Math.ceil(peak / step) * step)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ")
  const area = data.length ? `${line} L${x(data.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z` : ""
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)
  const labelEvery = Math.max(1, Math.ceil(data.length / 6))
  const fmtAxis = axisFormat || format

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || !data.length) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD.left) / innerW) * (data.length - 1))
    setHover(Math.min(data.length - 1, Math.max(0, i)))
  }

  const h = hover !== null ? data[hover] : null

  return (
    <div className={clx("relative", toneClass(tone))}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-64 w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Sales over time"
      >
        <defs>
          <linearGradient id="mr-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--mr-tone, var(--fg-interactive))" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--mr-tone, var(--fg-interactive))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border-base)" strokeDasharray={t ? "3 4" : undefined} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--fg-muted)" className="mr-tabular">
              {fmtAxis(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text
              key={d.label}
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
              fontSize="11"
              fill="var(--fg-muted)"
            >
              {d.label}
            </text>
          ) : null
        )}
        <path d={area} fill="url(#mr-area)" />
        <path d={line} fill="none" stroke="var(--mr-tone, var(--fg-interactive))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {h ? (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--border-strong)" />
            <circle cx={x(hover!)} cy={y(h.value)} r="4" fill="var(--bg-base)" stroke="var(--mr-tone, var(--fg-interactive))" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {h ? (
        <div
          className="shadow-elevation-tooltip bg-ui-bg-base pointer-events-none absolute top-1 rounded-lg px-3 py-2"
          style={{ left: `clamp(0px, calc(${(x(hover!) / W) * 100}% - 60px), calc(100% - 140px))` }}
        >
          <Text size="xsmall" className="text-ui-fg-subtle">
            {h.label}
          </Text>
          <Text size="small" weight="plus" className="mr-tabular">
            {format(h.value)}
          </Text>
        </div>
      ) : null}
    </div>
  )
}

/** Ranked horizontal bars with values on the right. */
export function BarList({
  items,
  format,
  empty = "No data for this period",
  tone,
}: {
  items: { label: string; value: number; hint?: string }[]
  format: (n: number) => string
  empty?: string
  tone?: Tone
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) {
    return (
      <Text size="small" className="text-ui-fg-muted py-2">
        {empty}
      </Text>
    )
  }
  return (
    <ul className={clx("flex flex-col gap-2.5", toneClass(tone || "green"))}>
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="relative h-8 overflow-hidden rounded-md">
            <div
              className="absolute inset-y-0 left-0 rounded-md"
              style={{
                width: `${Math.max(4, (i.value / max) * 100)}%`,
                background: "var(--mr-tone-soft)",
              }}
            />
            <span className="txt-compact-small relative flex h-full items-center px-2.5 text-ui-fg-base">
              {i.label}
              {i.hint ? <span className="text-ui-fg-muted ml-2">{i.hint}</span> : null}
            </span>
          </div>
          <span className="txt-compact-small-plus mr-tabular text-ui-fg-base">{format(i.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* Controls and status                                                 */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="bg-ui-bg-component inline-flex rounded-lg p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clx(
            "txt-compact-small-plus rounded-md px-3 py-1 transition-colors",
            value === o.value ? "bg-ui-bg-base shadow-elevation-card-rest text-ui-fg-base" : "text-ui-fg-subtle hover:text-ui-fg-base"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const PAYMENT: Record<string, [string, "green" | "orange" | "red" | "grey" | "blue"]> = {
  captured: ["Paid", "green"],
  partially_captured: ["Partially paid", "orange"],
  authorized: ["Authorized", "blue"],
  partially_authorized: ["Partially authorized", "blue"],
  awaiting: ["Awaiting payment", "orange"],
  not_paid: ["Unpaid", "orange"],
  refunded: ["Refunded", "grey"],
  partially_refunded: ["Partially refunded", "grey"],
  canceled: ["Canceled", "red"],
  requires_action: ["Action required", "red"],
}

const FULFILMENT: Record<string, [string, "green" | "orange" | "red" | "grey" | "blue"]> = {
  not_fulfilled: ["Unfulfilled", "orange"],
  partially_fulfilled: ["Partially fulfilled", "orange"],
  fulfilled: ["Fulfilled", "blue"],
  partially_shipped: ["Partially shipped", "blue"],
  shipped: ["Shipped", "blue"],
  partially_delivered: ["Partially delivered", "green"],
  delivered: ["Delivered", "green"],
  canceled: ["Canceled", "red"],
}

export function PaymentStatus({ status }: { status?: string }) {
  const [label, color] = PAYMENT[status || ""] || [status || "Unknown", "grey"]
  return <StatusBadge color={color}>{label}</StatusBadge>
}

export function FulfilmentStatus({ status }: { status?: string }) {
  const [label, color] = FULFILMENT[status || ""] || [status || "Unknown", "grey"]
  return <StatusBadge color={color}>{label}</StatusBadge>
}
