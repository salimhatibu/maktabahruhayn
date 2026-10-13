import Link from "next/link"
import { formatMoney } from "@/lib/format"

export function FreeShippingMeter({
  subtotal,
  threshold,
  currency,
}: {
  subtotal: number
  threshold: number | null
  currency: string
}) {
  if (!threshold) {
    return null
  }
  const remaining = Math.max(threshold - subtotal, 0)
  const pct = Math.min(100, Math.round((subtotal / threshold) * 100))
  return (
    <div className="ship-meter">
      <p>
        <strong>
          {remaining > 0
            ? `You're only ${formatMoney(remaining, currency)} away from free shipping!`
            : "You've unlocked free standard shipping!"}
        </strong>
      </p>
      <Link href="/help#shipping">See Details</Link>
      <div
        className="ship-meter-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Progress toward free shipping"
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function SummaryRows({
  count,
  currency,
  itemSubtotal,
  shipping,
  tax,
  discount,
  total,
}: {
  count: number
  currency: string
  itemSubtotal: number
  shipping?: number | null
  tax?: number | null
  discount?: number | null
  total?: number | null
}) {
  return (
    <dl className="summary-rows">
      <div>
        <dt>
          {count} item{count === 1 ? "" : "s"}
        </dt>
        <dd>{formatMoney(itemSubtotal, currency)}</dd>
      </div>
      {discount ? (
        <div>
          <dt>Discount</dt>
          <dd>−{formatMoney(discount, currency)}</dd>
        </div>
      ) : null}
      <div>
        <dt>Estimated Shipping</dt>
        <dd>
          {typeof shipping === "number"
            ? shipping === 0
              ? "FREE"
              : formatMoney(shipping, currency)
            : "Calculated at checkout"}
        </dd>
      </div>
      <div>
        <dt>Estimated Tax</dt>
        <dd>{typeof tax === "number" ? formatMoney(tax, currency) : "Calculated at checkout"}</dd>
      </div>
      <div className="summary-total">
        <dt>{typeof total === "number" ? "Total" : "Estimated Subtotal"}</dt>
        <dd>{formatMoney(typeof total === "number" ? total : itemSubtotal - (discount || 0), currency)}</dd>
      </div>
    </dl>
  )
}
