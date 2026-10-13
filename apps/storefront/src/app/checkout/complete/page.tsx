import type { Metadata } from "next"
import Link from "next/link"
import { OrderDetails } from "@/components/order-details"
import { getOrder } from "@/lib/auth"

export const metadata: Metadata = { title: "Order Confirmed", robots: { index: false } }

export default async function CheckoutCompletePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order: id } = await searchParams
  const order = id ? await getOrder(id) : null

  return (
    <main className="wrap section-pad">
      <section className="panel confirm">
        <p className="hero-kicker">Thank you</p>
        <h1 className="serif-title">Your order is confirmed</h1>
        <p>
          {order ? (
            <>
              Order <strong>#{order.display_id}</strong>, placed with <strong>{order.email}</strong>.
            </>
          ) : (
            "We have received your order."
          )}{" "}
          Keep your order reference <code>{id}</code> to check its status.
        </p>
        <div className="confirm-actions">
          <Link href="/books" className="btn btn-primary">
            Continue Shopping
          </Link>
          <Link href={`/order-status?order=${id || ""}`} className="btn btn-outline">
            Order Status
          </Link>
        </div>
      </section>
      {order ? (
        <section className="panel">
          <OrderDetails order={order} />
        </section>
      ) : null}
    </main>
  )
}
