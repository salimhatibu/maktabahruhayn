import type { Metadata } from "next"
import Link from "next/link"
import { formatMoney } from "@/lib/format"
import { getFreeShippingThreshold, getRegionContext } from "@/lib/medusa"
import { getSiteConfig } from "@/lib/site-config"

export const metadata: Metadata = {
  title: "Help Center: Shipping, Returns, Payments & Currencies",
  description: "How Maktabah Ruhayn ships worldwide, takes M-Pesa and cards, and prices books in your currency.",
}

export default async function HelpPage() {
  const region = await getRegionContext()
  const threshold = await getFreeShippingThreshold(region.currency)
  const site = await getSiteConfig()
  const supportEmail = site.business.email || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || ""

  return (
    <main className="wrap help section-pad">
      <h1 className="serif-title page-title">Help Center</h1>
      <nav className="help-nav" aria-label="Help topics">
        <a href="#shipping">Shipping</a>
        <a href="#returns">Returns</a>
        <a href="#payments">Payments</a>
        <a href="#currency">Currencies</a>
        <a href="#orders">Orders</a>
      </nav>

      <section id="shipping" className="panel">
        <h2>Shipping</h2>
        <p>Orders ship from Nairobi. At checkout we verify your address and fetch live rates for two services:</p>
        <ul>
          <li>
            <strong>International Express</strong> through DHL Express, FedEx, or UPS, usually the fastest option.
          </li>
          <li>
            <strong>International Postal / EMS</strong>, the economical option, including Posta Kenya where available.
          </li>
        </ul>
        <p>
          Rates are based on your parcel&apos;s real size and weight: carriers charge the greater of actual and
          volumetric weight, so large multi-volume sets cost more to send than their weight alone suggests.
        </p>
        {threshold ? (
          <p>
            Standard (postal) shipping is free once your books total {formatMoney(threshold, region.currency)}.
            Express delivery is always charged at the live rate.
          </p>
        ) : null}
        <p>
          International parcels travel with a customs declaration and commercial invoice, prepared for you. Import
          duties and taxes, where your country charges them, are paid on delivery.
        </p>
      </section>

      <section id="returns" className="panel">
        <h2>Returns</h2>
        <p>
          If a book arrives damaged or you received the wrong title, sign in and open the order from{" "}
          <Link href="/account">My Account</Link>, or find it under <Link href="/order-status">Order Status</Link>, and
          contact us with your order reference within 14 days
          {supportEmail ? (
            <>
              {" "}
              at <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
            </>
          ) : null}
          . We replace damaged or incorrect items at our cost.
        </p>
      </section>

      <section id="payments" className="panel">
        <h2>Payments</h2>
        <p>
          <strong>Kenya:</strong> choose M-Pesa at checkout and enter your Safaricom number. You will receive an STK
          push; enter your M-Pesa PIN to approve. The checkout page waits for confirmation and lets you resend the
          request if it times out.
        </p>
        <p>
          <strong>Everywhere:</strong> credit and debit cards, Apple Pay and Google Pay through Stripe, with 3D Secure
          verification when your bank asks for it. Card payment is offered once the store&apos;s Stripe account is
          connected.
        </p>
      </section>

      <section id="currency" className="panel">
        <h2>Currencies</h2>
        <p>
          You shop and pay in your own currency. We detect your country automatically (you are browsing in{" "}
          <strong>{region.currency.toUpperCase()}</strong>); change it any time with &ldquo;Ship to&rdquo; in the
          header. Prices are converted from our base US-dollar prices using exchange rates refreshed every six hours,
          then rounded to a shelf price. The price you see in your cart is the amount you are charged.
        </p>
        <p className="muted small">Exchange rates by ExchangeRate-API.</p>
      </section>

      <section id="orders" className="panel">
        <h2>Orders</h2>
        <p>
          Signed-in customers see every order and its tracking in <Link href="/account">My Account</Link>. Guests can
          use <Link href="/order-status">Order Status</Link> with the order reference shown after checkout and the
          email used to order.
        </p>
      </section>
    </main>
  )
}
