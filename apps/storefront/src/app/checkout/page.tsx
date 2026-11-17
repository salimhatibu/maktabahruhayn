import type { Metadata } from "next"
import Link from "next/link"
import { FreeShippingMeter, SummaryRows } from "@/components/order-summary"
import { getCustomer, paymentPreference } from "@/lib/auth"
import {
  getCart,
  hasUnresolvedManualMpesaPayment,
  listPaymentChoices,
  listShippingOptions,
  readGiftOptions,
  summarizeCart,
} from "@/lib/cart"
import { countryName, formatMoney } from "@/lib/format"
import { getFreeShipping } from "@/lib/catalogue"
import { currentRegion, listShippingCountries } from "@/lib/region-context"
import { AddressForm, DeliveryPaymentForm } from "./forms"
import { findKenyaCounty } from "@maktabah/shared"

export const metadata: Metadata = { title: "Checkout", robots: { index: false } }

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; payment?: string }>
}) {
  const [{ step, payment }, cart, region, countries, customer] = await Promise.all([
    searchParams,
    getCart(),
    currentRegion(),
    Promise.resolve(listShippingCountries()),
    getCustomer().catch(() => null),
  ])
  const summary = summarizeCart(cart)

  if (!cart || !summary?.items.length) {
    return (
      <main className="wrap empty-state">
        <h1>Your cart is empty</h1>
        <Link href="/books" className="btn btn-primary">
          Return to Books
        </Link>
      </main>
    )
  }

  const address = cart.shipping_address
  const countyName =
    address?.country_code === "ke" ? findKenyaCounty(address.province)?.name || address.province : address?.province
  const hasAddress = Boolean(address?.address_1 && address.country_code)
  const onDelivery = hasAddress && step !== "address"
  const currency = summary.currency

  const [threshold, options, payments, manualPaymentPending] = await Promise.all([
    getFreeShipping(currency),
    onDelivery ? listShippingOptions(cart.id).catch(() => []) : Promise.resolve([]),
    onDelivery ? listPaymentChoices() : Promise.resolve([]),
    onDelivery ? hasUnresolvedManualMpesaPayment() : Promise.resolve(false),
  ])

  const shippingMethod = cart.shipping_methods?.[0]
  const gift = readGiftOptions(cart)
  const savedAddresses = (customer?.addresses || [])
    .filter((a) => a.address_1 && a.country_code)
    .sort((a, b) => Number(Boolean(b.is_default_shipping)) - Number(Boolean(a.is_default_shipping)))
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
      label: [
        a.address_1,
        a.city,
        a.country_code === "ke" ? findKenyaCounty(a.province)?.name : a.province,
        countryName(a.country_code || ""),
      ]
        .filter(Boolean)
        .join(", "),
    }))
  const saved = savedAddresses[0]
  const preference = paymentPreference(customer)
  const preferredProvider =
    preference.method === "mpesa" ? "manual_mpesa" : preference.method === "card" ? "pp_stripe_stripe" : null

  return (
    <main className="wrap checkout">
      <h1 className="serif-title page-title">Checkout</h1>
      {payment === "failed" ? (
        <p className="form-banner" role="alert">
          Your card payment was not completed. Please try again or choose another method.
        </p>
      ) : payment === "pending" ? (
        <p className="form-banner" role="status">
          Your payment is still processing. Check Order Status in a few minutes.
        </p>
      ) : null}
      {!customer ? (
        <p className="checkout-signin">
          Have an account? <Link href="/account/login?next=/checkout">Sign in</Link> for faster checkout and order
          history.
        </p>
      ) : null}
      <ol className="steps" aria-label="Checkout steps">
        <li className={!onDelivery ? "is-current" : "is-done"}>1. Shipping Address</li>
        <li className={onDelivery ? "is-current" : ""}>2. Delivery &amp; Payment</li>
      </ol>

      <div className="cart-layout">
        <div className="cart-main">
          {onDelivery && address ? (
            <>
              <section className="panel">
                <div className="panel-head">
                  <h2>Shipping To</h2>
                  <Link href="/checkout?step=address" className="link-btn">
                    Edit
                  </Link>
                </div>
                <address className="address-block">
                  {address.first_name} {address.last_name}
                  <br />
                  {address.address_1}
                  {address.address_2 ? `, ${address.address_2}` : ""}
                  <br />
                  {address.city}
                  {countyName ? `, ${countyName}` : ""} {address.postal_code}
                  <br />
                  {countryName(address.country_code || "")}
                  <br />
                  {address.phone}
                </address>
              </section>
              <section className="panel">
                <DeliveryPaymentForm
                  options={options}
                  payments={payments}
                  currency={currency}
                  manualPaymentAmount={Math.ceil(
                    cart.total ??
                      summary.subtotal +
                        (cart.shipping_total ?? 0) +
                        (cart.tax_total ?? 0) -
                        (cart.discount_total ?? 0)
                  )}
                  selectedOptionId={shippingMethod?.shipping_option_id}
                  preferredProvider={preferredProvider}
                  manualPaymentPending={manualPaymentPending}
                />
              </section>
            </>
          ) : (
            <section className="panel">
              <h2 className="panel-title">Shipping Address</h2>
              <p className="muted">We ship to over 200 countries. International addresses are checked before delivery rates are shown.</p>
              <AddressForm
                countries={countries}
                currency={currency}
                saved={savedAddresses}
                signedIn={Boolean(customer)}
                defaults={{
                  email: cart.email || customer?.email || "",
                  first_name: address?.first_name || saved?.first_name || customer?.first_name || "",
                  last_name: address?.last_name || saved?.last_name || customer?.last_name || "",
                  address_1: address?.address_1 || saved?.address_1 || "",
                  address_2: address?.address_2 || saved?.address_2 || "",
                  city: address?.city || saved?.city || "",
                  province: address?.province || saved?.province || "",
                  postal_code: address?.postal_code || saved?.postal_code || "",
                  country_code: address?.country_code || saved?.country_code || region.country.toLowerCase(),
                  phone: address?.phone || saved?.phone || customer?.phone || "",
                }}
              />
            </section>
          )}
        </div>

        <aside className="cart-aside">
          <section className="panel summary">
            <h2 className="summary-title">Order Summary</h2>
            <ul className="mini-lines">
              {summary.items.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.title}
                    {item.variantTitle ? <small> · {item.variantTitle}</small> : null}
                    <small> × {item.quantity}</small>
                  </span>
                  <span>{formatMoney(item.unitPrice * item.quantity, currency)}</span>
                </li>
              ))}
            </ul>
            {gift.is_gift ? (
              <p className="gift-note">
                Gift order{gift.gift_wrap ? " with wrapping" : ""}
                {gift.gift_message ? `: “${gift.gift_message}”` : ""}
              </p>
            ) : null}
            <FreeShippingMeter subtotal={summary.subtotal} threshold={threshold} currency={currency} />
            <SummaryRows
              count={summary.count}
              currency={currency}
              itemSubtotal={summary.subtotal}
              shipping={shippingMethod ? cart.shipping_total : null}
              tax={shippingMethod ? cart.tax_total : null}
              discount={cart.discount_total}
              total={shippingMethod ? cart.total : null}
            />
            <Link href="/cart" className="link-btn">
              Edit Cart
            </Link>
          </section>
        </aside>
      </div>
    </main>
  )
}
