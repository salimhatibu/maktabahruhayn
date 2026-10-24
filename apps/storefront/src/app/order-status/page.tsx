import type { Metadata } from "next"
import Link from "next/link"
import { OrderDetails } from "@/components/order-details"
import { getCustomer, getOrder } from "@/lib/auth"
import { LIMITS, throttle } from "@/lib/rate-limit"

export const metadata: Metadata = { title: "Order Status", robots: { index: false } }

/**
 * Guest order lookup: the order reference from the confirmation page plus the
 * email used at checkout. Signed-in customers are pointed to their account.
 */
export default async function OrderStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; email?: string }>
}) {
  const { order: ref, email } = await searchParams
  const customer = await getCustomer().catch(() => null)
  let order = null
  let error: string | null = null

  if (ref && email) {
    // Throttled so the form cannot be used to try reference/email pairs at scale.
    const limited = await throttle("order_lookup", LIMITS.orderLookup.ip)
    const found = limited ? null : await getOrder(ref.trim(), { email })
    if (found) {
      order = found
    } else {
      error = limited || "We couldn't find an order with that reference and email."
    }
  }

  return (
    <main className="wrap section-pad">
      <h1 className="serif-title page-title">Order Status</h1>
      {customer ? (
        <p>
          You&apos;re signed in. See all your orders in <Link href="/account">My Account</Link>.
        </p>
      ) : null}
      <section className="panel narrow">
        <form className="form-grid" action="/order-status">
          <label className="span-2">
            Order reference
            <input name="order" defaultValue={ref || ""} placeholder="order_…" required />
          </label>
          <label className="span-2">
            Email used at checkout
            <input name="email" type="email" defaultValue={email || ""} required />
          </label>
          <div className="span-2">
            <button type="submit" className="btn btn-primary btn-block">
              Check Status
            </button>
          </div>
        </form>
        {error ? (
          <p className="form-banner" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      {order ? (
        <section className="panel">
          <OrderDetails order={order} />
        </section>
      ) : null}
    </main>
  )
}
