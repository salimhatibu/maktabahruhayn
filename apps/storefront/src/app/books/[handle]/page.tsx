import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AddToCartButton } from "@/components/add-to-cart-button"
import { availabilityText, canPurchase } from "@/components/availability"
import { BookShelf } from "@/components/book-shelf"
import { FormatSelect } from "@/components/format-select"
import { Gallery } from "@/components/gallery"
import { ClockIcon, GiftIcon, PhoneIcon, TruckIcon } from "@/components/icons"
import { ReadMore } from "@/components/read-more"
import { RecentlyViewed, RecordView } from "@/components/recently-viewed"
import { PromoStrip } from "@/components/site-header"
import { RatingLine, Stars } from "@/components/stars"
import { WishlistButton } from "@/components/wishlist"
import { getCustomer } from "@/lib/auth"
import { siteUrl } from "@/lib/config"
import { bindingLabel, formatDate, formatMoney, scriptLabel, titleCase } from "@/lib/format"
import {
  getBookByHandle,
  getFreeShippingThreshold,
  getRegionContext,
  listBooks,
  listBooksByAuthor,
  listReviews,
  type BookView,
} from "@/lib/medusa"
import { WriteReview } from "./reviews"

type Props = {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ format?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const book = await getBookByHandle(handle)
  if (!book) {
    return { title: "Book not found" }
  }
  const byline = book.author ? ` by ${book.author}` : ""
  const description = (book.description || `${book.title}${byline}`).slice(0, 300)
  return {
    title: `${book.title}${byline}`,
    description,
    alternates: { canonical: `/books/${book.handle}` },
    openGraph: { type: "book", title: book.title, description, images: book.cover ? [book.cover] : undefined },
  }
}

/** schema.org expects BCP 47 language codes. */
const LANGUAGE_CODES: Record<string, string> = { english: "en", arabic: "ar", swahili: "sw", urdu: "ur", french: "fr" }

const SCHEMA_AVAILABILITY: Record<string, string> = {
  in_stock: "https://schema.org/InStock",
  low_stock: "https://schema.org/LimitedAvailability",
  backorder: "https://schema.org/BackOrder",
  preorder: "https://schema.org/PreOrder",
  out_of_stock: "https://schema.org/OutOfStock",
}

function bookJsonLd(
  book: BookView,
  url: string,
  absolute: (u: string) => string,
  rating: { average: number; count: number } | null
) {
  const offers = book.formats
    .filter((f) => f.price)
    .map((f) => ({
      "@type": "Offer",
      name: f.label,
      price: f.price!.amount.toFixed(2),
      priceCurrency: f.price!.currency.toUpperCase(),
      availability: SCHEMA_AVAILABILITY[f.availability.status],
      itemCondition: "https://schema.org/NewCondition",
      url,
    }))

  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    alternateName: book.arabicTitle || undefined,
    author: book.author ? { "@type": "Person", name: book.author } : undefined,
    translator: book.meta?.translator ? { "@type": "Person", name: book.meta.translator } : undefined,
    editor: book.meta?.commentator_tahqeeq ? { "@type": "Person", name: book.meta.commentator_tahqeeq } : undefined,
    publisher: book.meta?.publisher ? { "@type": "Organization", name: book.meta.publisher } : undefined,
    inLanguage: book.meta?.language ? LANGUAGE_CODES[book.meta.language] || book.meta.language : undefined,
    isbn: book.meta?.isbn_13 || book.meta?.isbn_10 || undefined,
    bookFormat: book.meta?.binding_type === "softcover" ? "https://schema.org/Paperback" : "https://schema.org/Hardcover",
    numberOfPages: book.pages || undefined,
    description: book.description || undefined,
    image: book.images.length ? book.images.map(absolute) : undefined,
    url,
    offers: offers.length ? offers : undefined,
    aggregateRating:
      rating && rating.count
        ? { "@type": "AggregateRating", ratingValue: rating.average, reviewCount: rating.count, bestRating: 5 }
        : undefined,
  }
}

/** Escapes characters that could close the script tag early. */
function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

export default async function BookPage({ params, searchParams }: Props) {
  const [{ handle }, { format }] = await Promise.all([params, searchParams])
  const book = await getBookByHandle(handle)
  if (!book) {
    notFound()
  }

  const region = await getRegionContext()
  const selected = book.formats.find((f) => f.variantId === format) || book.formats[0]
  const price = selected?.price

  const [threshold, related, byAuthor, reviews, customer] = await Promise.all([
    getFreeShippingThreshold(region.currency),
    book.categories[0]
      ? listBooks({ category: book.categories[0].handle, limit: 12, excludeId: book.id })
      : Promise.resolve({ books: [], count: 0 }),
    book.author ? listBooksByAuthor(book.author, book.id) : Promise.resolve([]),
    listReviews(book.id, 10),
    getCustomer().catch(() => null),
  ])

  const site = siteUrl()
  const absolute = (u: string) => (u.startsWith("/") ? `${site}${u}` : u)
  const url = `${site}/books/${book.handle}`
  const meta = book.meta
  const summary = reviews?.summary && reviews.summary.count ? reviews.summary : null

  const details: [string, string | null][] = [
    ["Author", book.author],
    ["Original Title", book.arabicTitle],
    ["Translator", meta?.translator || null],
    ["Tahqeeq / Commentary", meta?.commentator_tahqeeq || null],
    ["Publisher", meta?.publisher || null],
    ["Language", meta?.language ? titleCase(meta.language) : null],
    ["Script", scriptLabel(meta?.script_type)],
    ["Binding", bindingLabel(meta?.binding_type)],
    ["Volumes", meta?.volume_count && meta.volume_count > 1 ? String(meta.volume_count) : null],
    ["Pages", book.pages ? book.pages.toLocaleString("en") : null],
    ["Sold As", book.unit && book.unit !== "item" ? titleCase(book.unit) : null],
    [
      "Product Dimensions",
      selected?.dimensions
        ? `${selected.dimensions.width} x ${selected.dimensions.length} cm`
        : null,
    ],
    ["Release Date", book.releaseDate ? formatDate(book.releaseDate) : null],
    ["ISBN-13", meta?.isbn_13 || null],
    ["ISBN-10", meta?.isbn_10 || null],
  ]

  const buyable = selected?.price && canPurchase(selected.availability)
  const status = selected?.availability.status

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJson(bookJsonLd(book, url, absolute, summary)) }}
      />
      <RecordView
        book={{ handle: book.handle, title: book.title, author: book.author, arabicTitle: book.arabicTitle, cover: book.cover }}
      />
      <PromoStrip />

      <article className="pdp wrap">
        <div className="pdp-media">
          <Gallery book={book} images={book.images} />
          <WishlistButton
            className="pdp-wish"
            entry={{ handle: book.handle, title: book.title, author: book.author, arabicTitle: book.arabicTitle, cover: book.cover }}
          />
        </div>

        <div className="pdp-main">
          <div className="pdp-title-row">
            <div>
              <h1>{book.title}</h1>
              {book.subtitle ? <p className="pdp-subtitle">{book.subtitle}</p> : null}
              {book.author ? (
                <p className="pdp-byline">
                  By <Link href={`/search?q=${encodeURIComponent(book.author)}`}>{book.author}</Link>
                </p>
              ) : null}
              {meta?.translator ? (
                <p className="pdp-credit">
                  Translated by{" "}
                  <Link href={`/search?q=${encodeURIComponent(meta.translator)}`}>{meta.translator}</Link>
                </p>
              ) : null}
              {meta?.commentator_tahqeeq ? <p className="pdp-credit">Commentary by {meta.commentator_tahqeeq}</p> : null}
              {book.series ? <p className="pdp-credit muted">Series: {book.series}</p> : null}
              <p className="pdp-rating">
                {summary ? <RatingLine average={summary.average} count={summary.count} href="#reviews" /> : null}
                <a href="#reviews" className="link-btn">
                  Write a Review
                </a>
              </p>
            </div>
            {price ? (
              <div className="pdp-price">
                <span className="pdp-price-label">{selected.label}</span>
                <span className="pdp-price-amount">{formatMoney(price.amount, price.currency)}</span>
                {price.onSale ? (
                  <span className="pdp-price-was">
                    <s>{formatMoney(price.original, price.currency)}</s>{" "}
                    <span className="save-badge">Save {Math.round((1 - price.amount / price.original) * 100)}%</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <p className="info-line">
            <PhoneIcon size={18} />
            {region.mpesa
              ? "Pay with M-Pesa or card at checkout. Prices in Kenyan shillings."
              : `Prices in ${region.currency.toUpperCase()}, the currency you'll be charged in.`}
          </p>

          {book.formats.length ? (
            <section className="formats" aria-labelledby="formats-title">
              <div className="formats-head">
                <h2 id="formats-title">Formats</h2>
                <Link href={`/search?q=${encodeURIComponent(book.title.replace(/\(.*?\)/g, "").trim())}`} className="link-btn">
                  See All Formats &amp; Editions
                </Link>
              </div>
              {book.optionDisplay === "dropdown" && book.formats.length > 1 ? (
                <FormatSelect
                  handle={book.handle}
                  selected={selected?.variantId || ""}
                  options={book.formats.map((f) => ({
                    value: f.variantId,
                    label: `${f.label} · ${f.price ? formatMoney(f.price.amount, f.price.currency) : "Unavailable"}`,
                  }))}
                />
              ) : (
              <div className="format-list">
                {book.formats.map((f) => (
                  <Link
                    key={f.variantId}
                    href={`/books/${book.handle}?format=${f.variantId}`}
                    scroll={false}
                    replace
                    className={`format-option ${f.variantId === selected?.variantId ? "is-selected" : ""}`}
                    aria-current={f.variantId === selected?.variantId ? "true" : undefined}
                  >
                    <span>{f.label}</span>
                    <strong>{f.price ? formatMoney(f.price.amount, f.price.currency) : "Unavailable"}</strong>
                  </Link>
                ))}
              </div>
              )}
            </section>
          ) : null}

          <div className="buy-box">
            <div className="buy-box-info">
              {status === "preorder" ? (
                <p>
                  <ClockIcon size={22} />
                  <span>
                    <strong>
                      {book.releaseDate
                        ? `This item will be released on ${formatDate(book.releaseDate)}`
                        : "Available for pre-order"}
                    </strong>
                    <br />
                    We ship as soon as stock arrives.
                  </span>
                </p>
              ) : (
                <p>
                  <TruckIcon size={22} />
                  <span>
                    <strong className={`stock-text stock-${status}`}>
                      {status === "in_stock" ? "In stock: ships in 1-2 business days" : availabilityText(selected?.availability || null)}
                    </strong>
                    <br />
                    {threshold
                      ? `Free standard shipping on orders over ${formatMoney(threshold, region.currency)}`
                      : "Shipping calculated at checkout"}
                  </span>
                </p>
              )}
            </div>
            {buyable ? (
              <AddToCartButton
                variantId={selected!.variantId}
                label={status === "preorder" ? "Pre-Order" : "Add to Cart"}
                className="btn btn-primary btn-wide"
              />
            ) : (
              <button type="button" className="btn btn-primary btn-wide" disabled>
                {selected?.price ? "Out of Stock" : "Unavailable in your region"}
              </button>
            )}
          </div>

          <p className="info-line">
            <GiftIcon size={18} />
            Gift wrapping and a personal message are available in your cart.
          </p>

          {meta?.sample_pdf_url ? (
            <a className="sample-link" href={meta.sample_pdf_url} target="_blank" rel="noopener noreferrer">
              Read a Sample (PDF)
            </a>
          ) : null}
        </div>
      </article>

      <div className="wrap pdp-sections">
        <details className="accordion" open>
          <summary>
            <h2>Overview</h2>
          </summary>
          <div className="overview">
            {book.booksellerNote ? (
              <aside className="bookseller-note">
                <h3>Notes From Your Bookseller</h3>
                <p>{book.booksellerNote}</p>
              </aside>
            ) : null}
            <div className="overview-body">
              {book.bundleItems.length ? (
                <section className="bundle-contents" aria-labelledby="bundle-title">
                  <h3 id="bundle-title">What&apos;s in this bundle</h3>
                  <ul>
                    {book.bundleItems.map((item) => (
                      <li key={item.product_id}>
                        <span>{item.title}</span>
                        {item.quantity > 1 ? <span className="bundle-qty">× {item.quantity}</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {book.descriptionHtml ? (
                <ReadMore>
                  <div className="rich-text" dangerouslySetInnerHTML={{ __html: book.descriptionHtml }} />
                </ReadMore>
              ) : (
                <p className="muted">No description yet.</p>
              )}
            </div>
          </div>
        </details>

        <details className="accordion">
          <summary>
            <h2>Product Details</h2>
          </summary>
          <table className="details-table">
            <tbody>
              {details
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td dir="auto">{value}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>

        {book.editorialReviews.length ? (
          <details className="accordion">
            <summary>
              <h2>Editorial Reviews</h2>
            </summary>
            <div className="editorial">
              {book.editorialReviews.map((r) => (
                <blockquote key={r.source}>
                  <p>&ldquo;{r.quote}&rdquo;</p>
                  <footer>{r.source}</footer>
                </blockquote>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <BookShelf title="You May Also Like" books={related.books} />
      {book.author && byAuthor.length ? <BookShelf title={`More by ${book.author}`} books={byAuthor} /> : null}

      <div className="wrap pdp-sections">
        {book.authorBio ? (
          <details className="accordion">
            <summary>
              <h2>About the Author</h2>
            </summary>
            <p className="author-bio">{book.authorBio}</p>
          </details>
        ) : null}

        <section className="pdp-categories" aria-labelledby="cats-title">
          <h2 id="cats-title">Categories</h2>
          <ul>
            {book.categories.map((c) => (
              <li key={c.id}>
                <Link href={`/books?category=${c.handle}`}>{c.name}</Link>
              </li>
            ))}
            {meta?.publisher ? (
              <li>
                <Link href={`/search?publisher=${encodeURIComponent(meta.publisher)}`}>{meta.publisher}</Link>
              </li>
            ) : null}
            {meta?.language ? (
              <li>
                <Link href={`/search?language=${meta.language}`}>{titleCase(meta.language)} Books</Link>
              </li>
            ) : null}
          </ul>
        </section>

        <section id="reviews" className="reviews" aria-labelledby="reviews-title">
          <h2 id="reviews-title" className="serif-title center">
            Customer Reviews
          </h2>
          {summary ? (
            <div className="review-summary">
              <div className="review-average">
                <strong>{summary.average.toFixed(1)}</strong>
                <Stars value={summary.average} size={22} />
                <span className="muted">
                  {summary.count} review{summary.count === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="review-bars">
                {(["5", "4", "3", "2", "1"] as const).map((n) => (
                  <li key={n}>
                    <span>{n} star</span>
                    <span className="bar">
                      <span style={{ width: `${(summary.distribution[n] / summary.count) * 100}%` }} />
                    </span>
                    <span>{summary.distribution[n]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="center muted">Be the first to review this book.</p>
          )}
          <div className="center">
            <WriteReview productId={book.id} handle={book.handle} signedIn={Boolean(customer)} />
          </div>
          {reviews?.reviews.length ? (
            <ul className="review-list">
              {reviews.reviews.map((r) => (
                <li key={r.id}>
                  <Stars value={r.rating} />
                  {r.title ? <h3>{r.title}</h3> : null}
                  <p className="review-meta">
                    {r.display_name}
                    {r.verified_purchase ? <span className="verified"> · Verified Purchase</span> : null} ·{" "}
                    {new Date(r.created_at).toLocaleDateString("en", { dateStyle: "medium" })}
                  </p>
                  <p>{r.content}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <RecentlyViewed exclude={book.handle} />
    </main>
  )
}
