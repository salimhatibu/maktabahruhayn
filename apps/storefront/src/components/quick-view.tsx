"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { CardBook } from "@/lib/medusa"
import { formatMoney } from "@/lib/format"
import { AddToCartButton } from "./add-to-cart-button"
import { availabilityText, canPurchase } from "./availability"
import { BookCover } from "./book-cover"
import { CloseIcon } from "./icons"
import { RatingLine } from "./stars"

/** Card-level "Quick View" dialog, as on Darussalam's product tiles. */
export function QuickView({ book, blurb }: { book: CardBook; blurb?: string | null }) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <>
      <button type="button" className="quick-view-btn" onClick={() => setOpen(true)}>
        Quick View
      </button>
      <dialog
        ref={dialogRef}
        className="quick-view"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialogRef.current && setOpen(false)}
        aria-label={`Quick view: ${book.title}`}
      >
        {open ? (
          <div className="quick-view-body">
            <button type="button" className="icon-btn quick-view-close" onClick={() => setOpen(false)} aria-label="Close">
              <CloseIcon />
            </button>
            <div className="quick-view-cover">
              <BookCover book={book} />
            </div>
            <div className="quick-view-info">
              <h2 className="serif-title">{book.title}</h2>
              {book.author ? <p className="pdp-byline">By {book.author}</p> : null}
              {book.rating ? <RatingLine average={book.rating.average} count={book.rating.count} /> : null}
              {book.price ? (
                <p className="quick-view-price">
                  <strong>{formatMoney(book.price.amount, book.price.currency)}</strong>
                  {book.price.onSale ? <s>{formatMoney(book.price.original, book.price.currency)}</s> : null}
                </p>
              ) : null}
              {book.format ? <p className="strong">{book.format}</p> : null}
              <p className="muted">{availabilityText(book.availability)}</p>
              {blurb ? <p className="quick-view-blurb">{blurb}</p> : null}
              <div className="quick-view-actions">
                {book.variantId && canPurchase(book.availability) ? (
                  <AddToCartButton
                    variantId={book.variantId}
                    label={book.isPreorder ? "Pre-Order" : "Add to Cart"}
                  />
                ) : null}
                <Link href={`/books/${book.handle}`} className="btn btn-outline">
                  View Details
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  )
}
