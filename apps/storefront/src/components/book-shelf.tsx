import Link from "next/link"
import type { BookView } from "@/lib/medusa"
import { toCardBook, withRatings } from "@/lib/medusa"
import { BookCard } from "./book-card"
import { Carousel } from "./carousel"

/** A titled carousel row of books with a "See All" link. */
export async function BookShelf({
  title,
  books,
  seeAllHref,
}: {
  title: string
  books: BookView[]
  seeAllHref?: string
}) {
  if (!books.length) {
    return null
  }
  const cards = await withRatings(books.map((b) => toCardBook(b)))

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
        {cards.map((card, i) => (
          <div className="carousel-item" key={card.handle}>
            <BookCard book={card} blurb={books[i].description?.slice(0, 280)} />
          </div>
        ))}
      </Carousel>
    </section>
  )
}
