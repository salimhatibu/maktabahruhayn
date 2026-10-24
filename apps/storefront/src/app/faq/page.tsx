import type { Metadata } from "next"
import Link from "next/link"
import { currentLocale, t } from "@/lib/i18n"
import { FaqClient } from "./faq-client"

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: "Find answers about ordering, shipping, payments, returns, and more at Maktabah Ruhayn.",
}

const FAQ_CATEGORIES = [
  {
    name: "Orders & Shipping",
    slug: "orders-shipping",
    questions: [
      {
        q: "How long does shipping take?",
        a: "Processing takes 1–2 business days. International Express (DHL/FedEx/UPS) typically arrives in 3–7 business days. International Postal/EMS takes 7–21 business days depending on your country.",
      },
      {
        q: "Do you ship worldwide?",
        a: "Yes! We ship to over 100 countries from our warehouse in Nairobi, Kenya. Shipping rates are calculated live at checkout based on your parcel's weight and destination.",
      },
      {
        q: "How can I track my order?",
        a: "Once your order ships, you'll receive a tracking number by email. You can also check your order status anytime on our <a href='/order-status'>Order Status</a> page using your order reference and email, or in <a href='/account'>My Account</a> if you're signed in.",
      },
      {
        q: "Is there free shipping?",
        a: "Yes — standard (postal) shipping is free once your order reaches the free-shipping threshold for your currency. Express delivery is always charged at the live carrier rate.",
      },
      {
        q: "Can I change or cancel my order?",
        a: "Please contact us as soon as possible. If the order hasn't been packed yet, we can make changes or cancel it. Once shipped, we cannot cancel.",
      },
    ],
  },
  {
    name: "Payments",
    slug: "payments",
    questions: [
      {
        q: "What payment methods do you accept?",
        a: "We accept credit/debit cards (Visa, Mastercard, Amex) via Stripe, Apple Pay, Google Pay, and M-Pesa for customers in Kenya.",
      },
      {
        q: "How does M-Pesa payment work?",
        a: "At checkout, choose M-Pesa and enter your Safaricom number. You'll receive an STK push on your phone — enter your M-Pesa PIN to approve. The checkout page waits for confirmation automatically.",
      },
      {
        q: "Is my payment secure?",
        a: "Absolutely. All card payments are processed through Stripe with 3D Secure verification. We never store your card details on our servers.",
      },
      {
        q: "What currency will I be charged in?",
        a: "You're charged in the currency shown at checkout, which is determined by your shipping country. You can change your region using the 'Ship to' selector in the header.",
      },
    ],
  },
  {
    name: "Returns & Refunds",
    slug: "returns",
    questions: [
      {
        q: "What is your return policy?",
        a: "If a book arrives damaged or you received the wrong title, contact us within 14 days of delivery with your order reference. We'll replace damaged or incorrect items at our cost.",
      },
      {
        q: "How do I request a return?",
        a: "Email our support team with your order reference and a photo of the issue. We'll arrange a replacement or refund.",
      },
      {
        q: "How long do refunds take?",
        a: "Once approved, refunds are processed within 3–5 business days. It may take an additional 5–10 business days for the amount to appear on your statement, depending on your bank.",
      },
    ],
  },
  {
    name: "Products & Stock",
    slug: "products",
    questions: [
      {
        q: "Are all your books brand new?",
        a: "Yes, we only sell brand new books directly from publishers and authorised distributors.",
      },
      {
        q: "What does 'pre-order' mean?",
        a: "A pre-order item hasn't been released yet. You can order it now and we'll ship it as soon as stock arrives. Your card is charged at the time of order.",
      },
      {
        q: "An item is out of stock. Will it come back?",
        a: "Most items are restocked regularly. Click 'Notify Me' on the product page and enter your email — we'll let you know as soon as it's back in stock.",
      },
      {
        q: "Do you sell digital/PDF books?",
        a: "Yes, some titles are available as digital downloads. After purchase, you'll find the download link in your order confirmation email and in your account.",
      },
    ],
  },
  {
    name: "Account & Privacy",
    slug: "account",
    questions: [
      {
        q: "Do I need an account to order?",
        a: "No, you can check out as a guest. However, creating an account lets you track orders, save addresses, and manage your wishlist across devices.",
      },
      {
        q: "How do I reset my password?",
        a: "Go to the <a href='/account/login'>Sign In</a> page and click 'Forgot password?'. We'll send a reset link to your email.",
      },
      {
        q: "Is my personal data safe?",
        a: "We take privacy seriously. Your personal data is used only to process orders and improve your experience. We never sell your information to third parties.",
      },
    ],
  },
]

export default async function FaqPage() {
  const locale = await currentLocale()
  return (
    <main className="wrap section-pad">
      <h1 className="serif-title page-title">{t(locale, "faq.title")}</h1>
      <p className="faq-intro">
        Can&apos;t find what you&apos;re looking for? Visit our{" "}
        <Link href="/help">{t(locale, "nav.help")}</Link> or{" "}
        <Link href="/help#orders">{t(locale, "nav.contact").toLowerCase()}</Link>.
      </p>
      <FaqClient
        categories={FAQ_CATEGORIES}
        labels={{
          search: t(locale, "faq.search_placeholder"),
          all: t(locale, "faq.all"),
          empty: t(locale, "faq.no_results"),
        }}
      />
    </main>
  )
}
