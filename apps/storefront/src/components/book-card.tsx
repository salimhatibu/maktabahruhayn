import Link from "next/link"
import type { CardBook } from "@/lib/view-types"
import { formatMoney } from "@/lib/format"
import { AddToCartButton } from "./add-to-cart-button"
import { AvailabilityBadge, canPurchase } from "./availability"
import { BookCover } from "./book-cover"
import { QuickView } from "./quick-view"
import { Stars } from "./stars"

export function BookCard({
  book,
  priority = false,
  blurb,
}: {
  book: CardBook
  priority?: boolean
  blurb?: string | null
}) {
  const href = book.handle ? `/books/${book.handle}` : "/books"
  const buyable = Boolean(book.variantId) && canPurchase(book.availability)

  return (
    <article className="book-card">
      <div className="book-card-cover">
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <BookCover book={book} priority={priority} />
        </Link>
        <div className="quick-add">
          {buyable ? (
            <AddToCartButton
              variantId={book.variantId!}
              label={book.isPreorder ? "Pre-Order" : "Quick Add"}
              className="btn btn-primary btn-sm"
            />
          ) : null}
          {book.handle ? <QuickView book={book} blurb={blurb} /> : null}
        </div>
      </div>
      <h3 className="book-card-title">
        <Link href={href}>{book.title}</Link>
      </h3>
      {book.author ? (
        <p className="book-card-author">
          <Link href={`/search?q=${encodeURIComponent(book.author)}`}>{book.author}</Link>
        </p>
      ) : null}
      {book.series ? <p className="book-card-series">{book.series}</p> : null}
      {book.format ? <p className="book-card-format">{book.format}</p> : null}
      {book.price ? (
        <p className="book-card-price">
          <span className={book.price.onSale ? "sale-price" : undefined}>
            {formatMoney(book.price.amount, book.price.currency)}
          </span>
          {book.price.onSale ? (
            <s aria-label={`Was ${formatMoney(book.price.original, book.price.currency)}`}>
              {formatMoney(book.price.original, book.price.currency)}
            </s>
          ) : null}
        </p>
      ) : null}
      {book.rating ? (
        <p className="book-card-rating">
          <Stars value={book.rating.average} size={15} />
          <span className="rating-count">({book.rating.count})</span>
        </p>
      ) : null}
      <AvailabilityBadge availability={book.availability} />
    </article>
  )
}
