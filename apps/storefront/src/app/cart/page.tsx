import type { Metadata } from "next"
import Link from "next/link"
import { removeLineAction } from "@/app/actions/cart"
import { AddToCartButton } from "@/components/add-to-cart-button"
import { BookCover } from "@/components/book-cover"
import { FreeShippingMeter, SummaryRows } from "@/components/order-summary"
import { QuantityStepper } from "@/components/quantity-stepper"
import { PromoStrip } from "@/components/site-header"
import { SaveForLaterButton } from "@/components/wishlist"
import { getCart, readGiftOptions, summarizeCart } from "@/lib/cart"
import { formatMoney } from "@/lib/format"
import { getFreeShippingThreshold, getRegionContext, listBooks, toCardBook } from "@/lib/medusa"
import { GiftForm, PromoForm } from "./forms"

export const metadata: Metadata = { title: "Cart", robots: { index: false } }

export default async function CartPage() {
  const [cart, region] = await Promise.all([getCart(), getRegionContext()])
  const summary = summarizeCart(cart)
  const currency = summary?.currency || region.currency
  const [threshold, suggestions] = await Promise.all([
    getFreeShippingThreshold(currency),
    listBooks({ tag: "bestseller", limit: 8 }),
  ])

  const inCart = new Set(summary?.items.map((i) => i.handle))
  const stockNote = (lineId: string) => {
    const line = cart?.items?.find((i) => i.id === lineId)
    const v = line?.variant
    if (!v || v.manage_inventory === false) {
      return "Ships in 1-2 days."
    }
    const qty = Number(v.inventory_quantity ?? 0)
    if (qty >= (line?.quantity || 1)) {
      return qty <= 5 ? `Only ${qty} left. Ships in 1-2 days.` : "Ships in 1-2 days."
    }
    return v.allow_backorder ? "On backorder or pre-order: ships when stock arrives." : "Not enough stock for this quantity."
  }
  const promoCodes = (cart?.promotions || []).map((p) => p.code).filter((c): c is string => Boolean(c))
  const suggestion = suggestions.books.find((b) => !inCart.has(b.handle) && b.formats[0]?.price)
  const suggestionCard = suggestion ? toCardBook(suggestion) : null

  return (
    <main>
      <PromoStrip />
      <div className="wrap cart-layout">
        <div className="cart-main">
          {suggestion && suggestionCard?.price && suggestionCard.variantId ? (
            <section className="panel suggest">
              <h2 className="serif-title">We&apos;d love to tell you about…</h2>
              <div className="suggest-body">
                <Link href={`/books/${suggestion.handle}`} className="suggest-cover">
                  <BookCover book={suggestion} />
                </Link>
                <div className="suggest-info">
                  <Link href={`/books/${suggestion.handle}`} className="suggest-title">
                    {suggestion.title}
                  </Link>
                  {suggestion.author ? <p className="muted">{suggestion.author}</p> : null}
                  <p className="strong">{suggestionCard.format}</p>
                  {suggestion.description ? <p className="suggest-desc">{suggestion.description}</p> : null}
                </div>
                <div className="suggest-buy">
                  <strong>{formatMoney(suggestionCard.price.amount, suggestionCard.price.currency)}</strong>
                  <AddToCartButton variantId={suggestionCard.variantId} />
                </div>
              </div>
            </section>
          ) : null}

          <h1 className="serif-title page-title">Shopping Cart</h1>

          {!summary?.items.length ? (
            <section className="panel empty-state">
              <h2>Your cart is empty</h2>
              <p>Find your next read among our bestsellers and new releases.</p>
              <Link href="/books" className="btn btn-primary">
                Continue Shopping
              </Link>
            </section>
          ) : (
            <section className="panel" aria-labelledby="shipped-title">
              <div className="panel-head">
                <h2 id="shipped-title">Shipped Items</h2>
                <span>
                  {summary.count} Item{summary.count === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="cart-lines">
                {summary.items.map((item) => (
                  <li key={item.id} className="cart-line">
                    <Link href={item.handle ? `/books/${item.handle}` : "#"} className="cart-line-cover">
                      <BookCover book={{ handle: item.handle || item.id, title: item.title, cover: item.thumbnail }} />
                    </Link>
                    <div className="cart-line-info">
                      <Link href={item.handle ? `/books/${item.handle}` : "#"} className="cart-line-title">
                        {item.title}
                      </Link>
                      {item.variantTitle ? <p className="strong">{item.variantTitle}</p> : null}
                      <QuantityStepper lineId={item.id} quantity={item.quantity} title={item.title} />
                      <p className="strong small">{stockNote(item.id)}</p>
                    </div>
                    <div className="cart-line-side">
                      <p className="cart-line-price">
                        {item.compareAt ? <s>{formatMoney(item.compareAt * item.quantity, currency)}</s> : null}
                        <strong>{formatMoney(item.unitPrice * item.quantity, currency)}</strong>
                      </p>
                      <div className="cart-line-actions">
                        {item.handle ? (
                          <SaveForLaterButton
                            lineId={item.id}
                            removeAction={removeLineAction}
                            entry={{
                              handle: item.handle,
                              title: item.title,
                              author: null,
                              arabicTitle: null,
                              cover: item.thumbnail,
                            }}
                          />
                        ) : null}
                        <form action={removeLineAction}>
                          <input type="hidden" name="line_id" value={item.id} />
                          <button type="submit" className="text-btn">
                            Remove
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <GiftForm options={readGiftOptions(cart)} />
            </section>
          )}
        </div>

        <aside className="cart-aside">
          <section className="panel summary" aria-labelledby="summary-title">
            <h2 id="summary-title" className="summary-title">
              Order Summary
            </h2>
            {summary?.items.length ? (
              <>
                <FreeShippingMeter subtotal={summary.subtotal} threshold={threshold} currency={currency} />
                <SummaryRows
                  count={summary.count}
                  currency={currency}
                  itemSubtotal={summary.subtotal}
                  discount={cart?.discount_total}
                />
                <PromoForm applied={promoCodes} />
                <Link href="/checkout" className="btn btn-primary btn-block">
                  Checkout
                </Link>
              </>
            ) : (
              <p className="muted">Add a book to see your order summary.</p>
            )}
          </section>
          <section className="panel pay-note">
            <h2>Ways to pay</h2>
            <p>
              {region.mpesa
                ? "Lipa na M-Pesa: approve an STK push on your phone at checkout. Cards are accepted too."
                : `You're charged in ${region.currency.toUpperCase()}. Express and postal delivery rates are calculated live at checkout.`}
            </p>
          </section>
        </aside>
      </div>
    </main>
  )
}
