"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import { removeLineFromDrawerAction } from "@/app/actions/cart"
import type { CartSummary } from "@/lib/cart"
import { formatMoney } from "@/lib/format"
import { BookCover } from "./book-cover"
import { CartIcon, CloseIcon } from "./icons"
import { callAction } from "@/lib/stale-action"

type CartContextValue = {
  summary: CartSummary | null
  setSummary: (summary: CartSummary | null) => void
  openDrawer: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function useCart() {
  const value = useContext(CartContext)
  if (!value) {
    throw new Error("useCart must be used inside CartProvider")
  }
  return value
}

export function CartProvider({
  initialSummary,
  freeShippingThreshold,
  children,
}: {
  initialSummary: CartSummary | null
  freeShippingThreshold: number | null
  children: React.ReactNode
}) {
  const [summary, setSummary] = useState(initialSummary)
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Server renders after mutations carry the fresh cart; adopt it.
  useEffect(() => {
    setSummary(initialSummary)
  }, [initialSummary])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const openDrawer = useCallback(() => setOpen(true), [])
  const value = useMemo(() => ({ summary, setSummary, openDrawer }), [summary, openDrawer])

  return (
    <CartContext.Provider value={value}>
      {children}
      <CartDrawer
        open={open}
        onClose={() => setOpen(false)}
        summary={summary}
        setSummary={setSummary}
        freeShippingThreshold={freeShippingThreshold}
      />
    </CartContext.Provider>
  )
}

export function HeaderCartButton() {
  const { summary } = useCart()
  const count = summary?.count || 0
  return (
    <Link href="/cart" className="icon-btn cart-btn" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
      <CartIcon size={26} />
      {count > 0 ? <span className="cart-badge">{count > 99 ? "99+" : count}</span> : null}
    </Link>
  )
}

function CartDrawer({
  open,
  onClose,
  summary,
  setSummary,
  freeShippingThreshold,
}: {
  open: boolean
  onClose: () => void
  summary: CartSummary | null
  setSummary: (s: CartSummary | null) => void
  freeShippingThreshold: number | null
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) {
      return
    }
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
      previous?.focus?.()
    }
  }, [open, onClose])

  const count = summary?.count || 0
  const currency = summary?.currency || "usd"
  const subtotal = summary?.subtotal || 0
  const remaining = freeShippingThreshold ? Math.max(freeShippingThreshold - subtotal, 0) : null

  return (
    <div className={`drawer-root ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <div
        ref={panelRef}
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
      >
        <div className="drawer-head">
          <h2 id="drawer-title">
            Your Shopping Cart <small>{count} item{count === 1 ? "" : "s"}</small>
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close cart">
            <CloseIcon size={24} />
          </button>
        </div>

        {freeShippingThreshold ? (
          <div className="drawer-note">
            <strong>
              {remaining && remaining > 0
                ? `You're ${formatMoney(remaining, currency)} away from free standard shipping`
                : "Your order qualifies for free standard shipping"}
            </strong>
            <Link href="/help#shipping">See Details</Link>
          </div>
        ) : null}

        <div className="drawer-items">
          {summary?.items.length ? (
            summary.items.map((item) => (
              <div key={item.id} className={`drawer-item ${pending ? "is-pending" : ""}`}>
                <div className="drawer-thumb">
                  <BookCover
                    book={{ handle: item.handle || item.id, title: item.title, cover: item.thumbnail }}
                  />
                </div>
                <div className="drawer-item-body">
                  <Link href={item.handle ? `/books/${item.handle}` : "/cart"} className="drawer-item-title">
                    {item.title}
                  </Link>
                  {item.variantTitle ? <p className="muted">{item.variantTitle}</p> : null}
                  <p className="muted">Qty. {item.quantity}</p>
                  <p className="drawer-item-price">
                    {formatMoney(item.unitPrice * item.quantity, currency)}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-btn"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await callAction(() => removeLineFromDrawerAction(item.id))
                      if (!result) {
                        return
                      }
                      if (result.ok) {
                        setSummary(result.cart)
                      }
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="drawer-empty">Your cart is empty.</p>
          )}
        </div>

        <div className="drawer-foot">
          <div className="drawer-subtotal">
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal, currency)}</strong>
          </div>
          <p className="muted center">Shipping and tax calculated at checkout</p>
          <Link href="/cart" className="btn btn-primary btn-block">
            View Cart &amp; Checkout
          </Link>
        </div>
      </div>
    </div>
  )
}
