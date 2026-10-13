import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { OrderDetails } from "@/components/order-details"
import { getCustomer, getOrder } from "@/lib/auth"

export const metadata: Metadata = { title: "Order Details", robots: { index: false } }

export default async function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const customer = await getCustomer().catch(() => null)
  if (!customer) {
    redirect(`/account/login?next=/account/orders/${id}`)
  }
  const order = await getOrder(id)
  if (!order) {
    notFound()
  }
  return (
    <main className="wrap section-pad">
      <p>
        <Link href="/account">← Back to My Account</Link>
      </p>
      <section className="panel">
        <OrderDetails order={order} />
      </section>
    </main>
  )
}
