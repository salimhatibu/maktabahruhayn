import type { Metadata } from "next"
import Link from "next/link"
import { AutoSubmitSelect } from "@/components/auto-submit-select"
import { BookCard } from "@/components/book-card"
import { BookShelf } from "@/components/book-shelf"
import { FiltersPanel } from "@/components/filters-panel"
import { PromoStrip } from "@/components/site-header"
import { isTagKey, SUBJECTS, subjectByHandle, TAGS, type TagKey } from "@/lib/catalog"
import { listCatalogue, withCatalogueRatings } from "@/lib/catalogue"
import { type BookSort } from "@/lib/view-types"

const PAGE_SIZES = [20, 50]
const DEFAULT_PAGE_SIZE = 20

const SORTS: { value: BookSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "title-asc", label: "Title: A to Z" },
  { value: "title-desc", label: "Title: Z to A" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
]

type Params = { category?: string; tag?: string; sort?: string; page?: string; sale?: string; per?: string; priceMin?: string; priceMax?: string }

function heading(category?: string, tag?: TagKey, sale?: boolean) {
  const subject = subjectByHandle(category)
  if (sale) {
    return subject ? `${subject.name} on Sale` : "Sale Items"
  }
  if (subject && tag) {
    return `${subject.name} ${TAGS[tag].label}`
  }
  return subject?.name || (tag ? TAGS[tag].label : "All Books")
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const { category, tag, sale } = await searchParams
  const title = heading(category, isTagKey(tag) ? tag : undefined, sale === "1")
  return {
    title,
    description: `${title} at Maktabah Ruhayn: classical Islamic books and verified editions, shipped worldwide.`,
  }
}

function hrefWith(current: Params, changes: Partial<Params>) {
  const next = new URLSearchParams()
  const merged = { ...current, ...changes }
  for (const [key, value] of Object.entries(merged)) {
    if (value) {
      next.set(key, value)
    }
  }
  const qs = next.toString()
  return `/books${qs ? `?${qs}` : ""}`
}

export default async function BooksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const subject = subjectByHandle(params.category)
  const tag = isTagKey(params.tag) ? params.tag : undefined
  const sort = (SORTS.find((s) => s.value === params.sort)?.value || "featured") as BookSort
  const page = Math.max(1, Number(params.page) || 1)
  const sale = params.sale === "1"
  const perPage = PAGE_SIZES.includes(Number(params.per)) ? Number(params.per) : DEFAULT_PAGE_SIZE
  const priceMin = params.priceMin ? Number(params.priceMin) : undefined
  const priceMax = params.priceMax ? Number(params.priceMax) : undefined

  const [{ books, count }, highlight] = await Promise.all([
    listCatalogue({
      category: subject?.handle,
      tag,
      sort,
      onSale: sale,
      priceMin: priceMin && !isNaN(priceMin) ? priceMin : undefined,
      priceMax: priceMax && !isNaN(priceMax) ? priceMax : undefined,
      limit: perPage,
      offset: (page - 1) * perPage,
    }),
    // Like B&N category pages, lead with that subject's bestsellers.
    subject && !tag && !sale && page === 1
      ? listCatalogue({ category: subject.handle, tag: "bestseller", limit: 12 })
      : Promise.resolve(null),
  ])

  const title = heading(subject?.handle, tag, sale)
  const pages = Math.max(1, Math.ceil(count / perPage))
  const current: Params = {
    category: subject?.handle,
    tag,
    sale: sale ? "1" : undefined,
    sort: sort === "featured" ? undefined : sort,
    per: perPage !== DEFAULT_PAGE_SIZE ? String(perPage) : undefined,
    priceMin: priceMin ? String(priceMin) : undefined,
    priceMax: priceMax ? String(priceMax) : undefined,
  }
  const cards = await withCatalogueRatings(books)

  return (
    <main>
      <PromoStrip />
      <div className="wrap listing-head">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/books">Books</Link>
          {subject || tag || sale ? (
            <>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{title}</span>
            </>
          ) : null}
        </nav>
        {subject || tag || sale ? (
          <Link href="/books" className="pill-link">
            Browse All Books
          </Link>
        ) : null}
        <h1>{title}</h1>
        <p className="listing-intro">
          {subject
            ? `${subject.blurb}. Classical works and trusted translations, chosen by our booksellers.`
            : sale
              ? "Selected titles at reduced prices, while stocks last."
              : "Classical Islamic texts, multi-volume collections, and carefully verified editions, shipped worldwide."}
        </p>
      </div>

      {highlight?.books.length ? (
        <BookShelf title={`Bestselling ${subject?.name}`} books={highlight.books} />
      ) : null}

      <div className="wrap listing">
        <FiltersPanel label="Filters" summary={[subject?.name, tag ? TAGS[tag].label : null, sale ? "Sale" : null].filter(Boolean).join(" · ") || undefined}>
          <h2>Subjects</h2>
          <ul>
            <li>
              <Link href={hrefWith(current, { category: undefined, page: undefined })} aria-current={!subject ? "true" : undefined}>
                All Subjects
              </Link>
            </li>
            {SUBJECTS.map((s) => (
              <li key={s.handle}>
                <Link
                  href={hrefWith(current, { category: s.handle, page: undefined })}
                  aria-current={subject?.handle === s.handle ? "true" : undefined}
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
          <h2>Collections</h2>
          <ul>
            <li>
              <Link href={hrefWith(current, { tag: undefined, page: undefined })} aria-current={!tag ? "true" : undefined}>
                Everything
              </Link>
            </li>
            <li>
              <Link href={hrefWith({ ...current, tag: undefined }, { sale: sale ? undefined : "1", page: undefined })} aria-current={sale ? "true" : undefined}>
                Sale Items
              </Link>
            </li>
            {(Object.keys(TAGS) as TagKey[]).map((key) => (
              <li key={key}>
                <Link href={hrefWith(current, { tag: key, page: undefined })} aria-current={tag === key ? "true" : undefined}>
                  {TAGS[key].label}
                </Link>
              </li>
            ))}
          </ul>

          <h2>Price</h2>
          <form action="/books" className="price-filter-form">
            {subject ? <input type="hidden" name="category" value={subject.handle} /> : null}
            {tag ? <input type="hidden" name="tag" value={tag} /> : null}
            {sale ? <input type="hidden" name="sale" value="1" /> : null}
            {sort !== "featured" ? <input type="hidden" name="sort" value={sort} /> : null}
            {perPage !== DEFAULT_PAGE_SIZE ? <input type="hidden" name="per" value={String(perPage)} /> : null}
            <div className="price-inputs">
              <input type="number" name="priceMin" placeholder="Min" defaultValue={priceMin || ""} min="0" step="1" />
              <span>–</span>
              <input type="number" name="priceMax" placeholder="Max" defaultValue={priceMax || ""} min="0" step="1" />
            </div>
            <button type="submit" className="btn btn-outline btn-sm">Apply</button>
            {(priceMin || priceMax) ? (
              <a href={hrefWith({ ...current, priceMin: undefined, priceMax: undefined }, { page: undefined })} className="clear-filter">Clear price filter</a>
            ) : null}
          </form>
        </FiltersPanel>

        <section className="listing-results" aria-label="Results">
          <div className="listing-toolbar">
            <p>
              {count} {count === 1 ? "result" : "results"}
            </p>
            <div className="toolbar-controls">
              <form action="/books" className="per-page-form">
                {subject ? <input type="hidden" name="category" value={subject.handle} /> : null}
                {tag ? <input type="hidden" name="tag" value={tag} /> : null}
                {sale ? <input type="hidden" name="sale" value="1" /> : null}
                {sort !== "featured" ? <input type="hidden" name="sort" value={sort} /> : null}
                {priceMin ? <input type="hidden" name="priceMin" value={String(priceMin)} /> : null}
                {priceMax ? <input type="hidden" name="priceMax" value={String(priceMax)} /> : null}
                <label htmlFor="per">Show</label>
                <AutoSubmitSelect id="per" name="per" defaultValue={String(perPage)}>
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={String(n)}>
                      {n} per page
                    </option>
                  ))}
                </AutoSubmitSelect>
              </form>
              <form action="/books" className="sort-form">
                {subject ? <input type="hidden" name="category" value={subject.handle} /> : null}
                {tag ? <input type="hidden" name="tag" value={tag} /> : null}
                {sale ? <input type="hidden" name="sale" value="1" /> : null}
                {perPage !== DEFAULT_PAGE_SIZE ? <input type="hidden" name="per" value={String(perPage)} /> : null}
                {priceMin ? <input type="hidden" name="priceMin" value={String(priceMin)} /> : null}
                {priceMax ? <input type="hidden" name="priceMax" value={String(priceMax)} /> : null}
                <label htmlFor="sort">Sort by</label>
                <AutoSubmitSelect id="sort" name="sort" defaultValue={sort}>
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </AutoSubmitSelect>
                <noscript>
                  <button type="submit" className="btn btn-outline btn-sm">
                    Apply
                  </button>
                </noscript>
              </form>
            </div>
          </div>

          {books.length ? (
            <div className="book-grid">
              {cards.map((card, i) => (
                <BookCard key={card.handle} book={card} priority={i < 4} blurb={card.blurb || undefined} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>No books here yet</h2>
              <p>Try another subject or collection.</p>
              <Link href="/books" className="btn btn-primary">
                Browse All Books
              </Link>
            </div>
          )}

          {pages > 1 ? (
            <nav className="pagination" aria-label="Pages">
              {page > 1 ? <Link href={hrefWith(current, { page: String(page - 1) })}>Previous</Link> : null}
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={hrefWith(current, { page: n === 1 ? undefined : String(n) })}
                  aria-current={n === page ? "page" : undefined}
                >
                  {n}
                </Link>
              ))}
              {page < pages ? <Link href={hrefWith(current, { page: String(page + 1) })}>Next</Link> : null}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  )
}
