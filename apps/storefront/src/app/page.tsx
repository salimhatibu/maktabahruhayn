import Link from "next/link"
import { BookCover } from "@/components/book-cover"
import { BookShelf } from "@/components/book-shelf"
import { HeroCarousel } from "@/components/hero-carousel"
import { RecentlyViewed } from "@/components/recently-viewed"
import { BookOpenIcon, HelpIcon, PhoneIcon, TruckIcon } from "@/components/icons"
import { isTagKey } from "@/lib/catalog"
import { getRegionContext, listBooks, searchBooks, type BookView } from "@/lib/medusa"
import { mediaUrl } from "@/lib/config"
import { getSiteConfig, type SiteConfig } from "@/lib/site-config"

/** Covers fanned out on a hero slide: the slide's own images, or books from a collection. */
function CoverFan({ books, images }: { books: BookView[]; images?: string[] }) {
  const covers = images?.length
    ? images.slice(0, 5).map((src, i) => ({ key: `${src}-${i}`, book: { handle: src, title: "", cover: mediaUrl(src) } }))
    : books.slice(0, 5).map((book) => ({ key: book.id, book }))
  return (
    <div className="cover-fan" aria-hidden="true">
      {covers.map(({ key, book }) => (
        <div key={key} className="cover-fan-item">
          <BookCover book={book} />
        </div>
      ))}
    </div>
  )
}

type Shelf = SiteConfig["content"]["homeSections"][number]

async function shelfBooks(section: Shelf) {
  if (section.source === "sale") {
    return listBooks({ onSale: true, limit: 12 })
  }
  if (section.source === "category") {
    return listBooks({ category: section.value, limit: 12 })
  }
  return isTagKey(section.value) ? listBooks({ tag: section.value, limit: 12 }) : { books: [], count: 0 }
}

function seeAll(section: Shelf) {
  if (section.source === "sale") return "/books?sale=1"
  if (section.source === "category") return `/books?category=${section.value}`
  return `/books?tag=${section.value}`
}

export default async function HomePage() {
  const [region, site, facets] = await Promise.all([getRegionContext(), getSiteConfig(), searchBooks("*", {}, "relevance", 1)])
  const publishers = (facets.facets.find((f) => f.field_name === "publisher")?.counts || []).slice(0, 10)
  const slides = site.content.heroSlides
  const shelves = site.content.homeSections.filter((s) => s.enabled)

  const [slideCovers, shelfResults] = await Promise.all([
    Promise.all(
      slides.map((s) =>
        s.images?.length
          ? Promise.resolve({ books: [] as BookView[], count: 0 })
          : isTagKey(s.coverTag)
            ? listBooks({ tag: s.coverTag, limit: 5 })
            : listBooks({ limit: 5 })
      )
    ),
    Promise.all(shelves.map(shelfBooks)),
  ])

  // The payment/region slide speaks to the visitor's own region.
  const regionSlide = {
    label: region.mpesa ? "Pay with M-Pesa" : "Shipping worldwide",
    node: (
      <div className="hero-inner wrap tone-green">
        <div className="hero-copy">
          <p className="hero-kicker">{region.mpesa ? "Kenya" : `Prices in ${region.currency.toUpperCase()}`}</p>
          <h2 className="hero-title">{region.mpesa ? "Lipa na M-Pesa" : "From Nairobi to Your Door"}</h2>
          <p>
            {region.mpesa
              ? "Prices in Kenyan shillings. Approve payment with an STK push straight to your phone."
              : `Shop and pay in ${region.currency.toUpperCase()}. Express and postal rates are calculated live at checkout.`}
          </p>
          <Link href={region.mpesa ? "/help#payments" : "/help#shipping"} className="btn btn-dark">
            Learn More
          </Link>
        </div>
        <CoverFan books={slideCovers[0]?.books || []} />
      </div>
    ),
  }

  const heroes = slides.length
    ? slides.map((s, i) => ({
        label: s.title,
        node: (
          <div className={`hero-inner wrap tone-${s.tone}`}>
            <div className="hero-copy">
              {s.kicker ? <p className="hero-kicker">{s.kicker}</p> : null}
              {i === 0 ? <h1>{s.title}</h1> : <h2 className="hero-title">{s.title}</h2>}
              {s.text ? <p>{s.text}</p> : null}
              {s.cta ? (
                <Link href={s.href || "/books"} className="btn btn-dark">
                  {s.cta}
                </Link>
              ) : null}
            </div>
            <CoverFan books={slideCovers[i]?.books || []} images={s.images} />
          </div>
        ),
      }))
    : [regionSlide]

  const empty = shelfResults.every((r) => !r.books.length)
  const [firstShelf, ...restShelves] = shelves.map((s, i) => ({ section: s, books: shelfResults[i].books }))

  return (
    <main>
      <HeroCarousel slides={heroes.map((s) => s.node)} labels={heroes.map((s) => s.label)} />

      {empty ? (
        <section className="wrap empty-state">
          <h2>The shelves are empty</h2>
          <p>
            Seed the catalog with <code>pnpm seed:catalog</code>, or add books in the admin.
          </p>
        </section>
      ) : null}

      {firstShelf ? <BookShelf title={firstShelf.section.title} books={firstShelf.books} seeAllHref={seeAll(firstShelf.section)} /> : null}

      {restShelves.slice(0, 1).map(({ section, books }) => (
        <BookShelf key={section.title} title={section.title} books={books} seeAllHref={seeAll(section)} />
      ))}

      <section className="wrap">
        <Link href="/search?binding_type=multi_volume_box_set" className="feature-banner">
          <div>
            <p className="hero-kicker">Build Your Library</p>
            <h2>Multi-volume Sets</h2>
            <p>Complete tafsir and hadith collections, boxed and ready to ship.</p>
          </div>
          <span className="btn btn-gold">Shop Sets</span>
        </Link>
      </section>

      {restShelves.slice(1).map(({ section, books }) => (
        <BookShelf key={section.title} title={section.title} books={books} seeAllHref={seeAll(section)} />
      ))}

      {publishers.length ? (
        <section className="wrap publishers" aria-labelledby="publishers-title">
          <div className="shelf-head">
            <h2 id="publishers-title">Our Publishers</h2>
          </div>
          <ul className="publisher-row">
            {publishers.map((p) => (
              <li key={p.value}>
                <Link href={`/search?publisher=${encodeURIComponent(p.value)}`}>
                  <span className="publisher-name">{p.value}</span>
                  <span className="publisher-count">
                    {p.count} title{p.count === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="wrap why" aria-labelledby="why-title">
        <div className="shelf-head">
          <h2 id="why-title">Why Shop With Us</h2>
        </div>
        <ul className="why-grid">
          <li>
            <span className="why-arch" aria-hidden="true">
              <PhoneIcon size={26} />
            </span>
            <h3>Flexible Payments</h3>
            <p>Lipa na M-Pesa in Kenya, and cards, Apple Pay or Google Pay everywhere, in your own currency.</p>
          </li>
          <li>
            <span className="why-arch" aria-hidden="true">
              <HelpIcon size={26} />
            </span>
            <h3>Premium Support</h3>
            <p>Questions about an edition or an order? Speak to a bookseller{site.business.whatsapp ? " on WhatsApp" : ""}.</p>
          </li>
          <li>
            <span className="why-arch" aria-hidden="true">
              <BookOpenIcon size={26} />
            </span>
            <h3>Quality Guarantee</h3>
            <p>Authentic editions from trusted publishers. Damaged or incorrect copies are replaced at our cost.</p>
          </li>
          <li>
            <span className="why-arch" aria-hidden="true">
              <TruckIcon size={26} />
            </span>
            <h3>Delivered Worldwide</h3>
            <p>From Nairobi to your door, with live courier rates and tracking on every parcel.</p>
          </li>
        </ul>
      </section>
      <RecentlyViewed />
    </main>
  )
}
