import Link from "next/link"
import type { CardBook } from "@/lib/view-types"
import { BookCard } from "./book-card"
import { Carousel } from "./carousel"

/** A titled carousel row of books with a "See All" link. */
export function BookShelf({
  title,
  books,
  seeAllHref,
}: {
  title: string
  books: CardBook[]
  seeAllHref?: string
}) {
  if (!books.length) {
    return null
  }
  const cards = books

  return (
    <section className="shelf wrap">
      <div className="shelf-head">
        <h2>{title}</h2>
        {seeAllHref ? (
          <Link href={seeAllHref} className="see-all">
            See All
          </Link>
        ) : null}
      </div>
      <Carousel label={title}>
        {cards.map((card) => (
          <div className="carousel-item" key={card.handle}>
            <BookCard book={card} blurb={card.blurb || undefined} />
          </div>
        ))}
      </Carousel>
    </section>
  )
}
