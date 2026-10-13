import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { logoutAction } from "@/app/actions/account"
import { orderStatusLabel } from "@/components/order-details"
import { getCustomer, listOrders, paymentPreference } from "@/lib/auth"
import { formatMoney } from "@/lib/format"
import { getRegionContext, listShippingCountries } from "@/lib/medusa"
import { AddressBook, PaymentPreferenceForm, ProfileForm, type SavedAddress } from "./forms"

export const metadata: Metadata = { title: "My Account", robots: { index: false } }

const SECTIONS = [
  { id: "orders", label: "Orders" },
  { id: "details", label: "Personal details" },
  { id: "addresses", label: "Addresses" },
  { id: "payment", label: "Payment" },
]

export default async function AccountPage() {
  const customer = await getCustomer().catch(() => null)
  if (!customer) {
    redirect("/account/login?next=/account")
  }
  const [orders, countries, region] = await Promise.all([listOrders().catch(() => []), listShippingCountries(), getRegionContext()])
  const preference = paymentPreference(customer)
  const addresses: SavedAddress[] = (customer.addresses || [])
    .map((a) => ({
      id: a.id,
      first_name: a.first_name || "",
      last_name: a.last_name || "",
      address_1: a.address_1 || "",
      address_2: a.address_2 || "",
      city: a.city || "",
      province: a.province || "",
      postal_code: a.postal_code || "",
      country_code: (a.country_code || "").toLowerCase(),
      phone: a.phone || "",
      is_default_shipping: a.is_default_shipping,
    }))
    .sort((a, b) => Number(Boolean(b.is_default_shipping)) - Number(Boolean(a.is_default_shipping)))
  const defaultAddress = addresses[0]
  const paymentLabel =
    preference.method === "mpesa" ? `M-Pesa${preference.mpesa_phone ? ` · ${preference.mpesa_phone}` : ""}` : preference.method === "card" ? "Card" : "Decide at checkout"

  return (
    <main className="wrap account section-pad">
      <div className="account-head">
        <div>
          <h1 className="serif-title page-title">Assalamu alaikum, {customer.first_name || "Reader"}</h1>
          <p className="muted">{customer.email}</p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="btn btn-outline btn-sm">
            Sign Out
          </button>
        </form>
      </div>

      <dl className="account-overview">
        <div>
          <dt>Orders</dt>
          <dd>{orders.length}</dd>
        </div>
        <div>
          <dt>Default address</dt>
          <dd>{defaultAddress ? `${defaultAddress.city}, ${countries.find((c) => c.code === defaultAddress.country_code)?.name || ""}` : "None yet"}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{customer.phone || "Not added"}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>{paymentLabel}</dd>
        </div>
      </dl>

      <nav className="account-nav" aria-label="Account sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.label}
          </a>
        ))}
        <Link href="/wishlist">Wishlist</Link>
      </nav>

      <section id="orders" className="panel account-section">
        <h2 className="panel-title">Order History</h2>
        {orders.length ? (
          <div className="table-scroll">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/account/orders/${o.id}`}>#{o.display_id}</Link>
                    </td>
                    <td>{new Date(o.created_at).toLocaleDateString("en", { dateStyle: "medium" })}</td>
                    <td>{orderStatusLabel(o)}</td>
                    <td>{formatMoney(o.total, o.currency_code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            No orders yet. <Link href="/books?tag=bestseller">Browse our bestsellers</Link>.
          </p>
        )}
      </section>

      <div className="account-columns">
        <section id="details" className="panel account-section">
          <h2 className="panel-title">Personal Details</h2>
          <ProfileForm customer={customer} defaultCountry={region.country} />
        </section>

        <section id="payment" className="panel account-section">
          <h2 className="panel-title">Payment Preference</h2>
          <p className="muted">Pre-selected at checkout. You can still change it when you pay.</p>
          <PaymentPreferenceForm method={preference.method} mpesaPhone={preference.mpesa_phone} />
        </section>
      </div>

      <section id="addresses" className="panel account-section">
        <h2 className="panel-title">Addresses</h2>
        <AddressBook addresses={addresses} countries={countries} />
      </section>
    </main>
  )
}
