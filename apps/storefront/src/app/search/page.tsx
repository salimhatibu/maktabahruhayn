import type { Metadata } from "next"
import Link from "next/link"
import { AutoSubmitSelect } from "@/components/auto-submit-select"
import { BookCard } from "@/components/book-card"
import { FiltersPanel } from "@/components/filters-panel"
import { bindingLabel, titleCase } from "@/lib/format"
import {
  SEARCH_FACET_NAMES as SEARCH_FACETS,
  searchCatalogue,
  type SearchFacetKey as SearchFacetName,
} from "@/lib/catalogue"
import type { SearchSort } from "@/lib/view-types"

type Params = Partial<Record<SearchFacetName | "q" | "sort", string | string[]>>

const SORTS: { value: SearchSort; label: string }[] = [
  { value: "relevance", label: "Best Match" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
]

const FACET_LABELS: Record<SearchFacetName, string> = {
  categories: "Subject",
  language: "Language",
  binding_type: "Format",
  publisher: "Publisher",
}

function list(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean)
}

function valueLabel(facet: SearchFacetName, value: string) {
  if (facet === "binding_type") {
    return bindingLabel(value) || value
  }
  if (facet === "language") {
    return titleCase(value)
  }
  return value
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const q = list((await searchParams).q)[0]
  return {
    title: q ? `Search results for “${q}”` : "Search",
    robots: { index: false },
  }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const q = (list(params.q)[0] || "").slice(0, 120)
  const selected = Object.fromEntries(
    SEARCH_FACETS.map((facet) => [facet, list(params[facet])])
  ) as Record<SearchFacetName, string[]>
  const hasFilters = SEARCH_FACETS.some((f) => selected[f].length)
  const sortParam = list(params.sort)[0]
  const sort = (SORTS.find((s) => s.value === sortParam)?.value || "relevance") as SearchSort

  const result = q || hasFilters ? await searchCatalogue(q, selected, sort) : null
  const cards = result?.cards || []

  const toggleHref = (facet: SearchFacetName, value: string) => {
    const next = new URLSearchParams()
    if (q) {
      next.set("q", q)
    }
    for (const f of SEARCH_FACETS) {
      const values = new Set(selected[f])
      if (f === facet) {
        if (values.has(value)) {
          values.delete(value)
        } else {
          values.add(value)
        }
      }
      values.forEach((v) => next.append(f, v))
    }
    return `/search?${next}`
  }

  const activeChips = SEARCH_FACETS.flatMap((facet) =>
    selected[facet].map((value) => ({ facet, value }))
  )

  return (
    <main className="wrap search-page">
      <div className="listing-head">
        <h1>{q ? <>Results for “{q}”</> : hasFilters ? "Browse Books" : "Search"}</h1>
        <form action="/search" className="search-inline" role="search">
          <input name="q" type="search" defaultValue={q} placeholder="Title, author, translator, publisher, ISBN" aria-label="Search books" />
          {SEARCH_FACETS.flatMap((f) => selected[f].map((v) => <input key={`${f}-${v}`} type="hidden" name={f} value={v} />))}
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
      </div>

      {!result ? (
        <div className="empty-state">
          <h2>What are you looking for?</h2>
          <p>
            Search across English and Arabic titles, authors, translators, publishers, and ISBNs. Typos are
            forgiven.
          </p>
        </div>
      ) : (
        <div className="listing">
          <FiltersPanel
            label="Refine results"
            summary={Object.values(selected).flat().length ? `${Object.values(selected).flat().length} selected` : undefined}
          >
            {result.facets
              .filter((facet) => facet.counts.length)
              .map((facet) => {
                const name = facet.field_name as SearchFacetName
                return (
                  <div key={name}>
                    <h2>{FACET_LABELS[name] || name}</h2>
                    <ul>
                      {facet.counts.map((count) => {
                        const active = selected[name]?.includes(count.value)
                        return (
                          <li key={count.value}>
                            <Link href={toggleHref(name, count.value)} className="facet-link" aria-current={active ? "true" : undefined}>
                              <span className={`check ${active ? "is-on" : ""}`} aria-hidden="true" />
                              {valueLabel(name, count.value)}
                              <span className="facet-count">{count.count}</span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
          </FiltersPanel>

          <section className="listing-results" aria-label="Results">
            <div className="listing-toolbar">
              <p>
                {result.count} {result.count === 1 ? "result" : "results"}
              </p>
              <form action="/search" className="sort-form">
                {q ? <input type="hidden" name="q" value={q} /> : null}
                {SEARCH_FACETS.flatMap((f) => selected[f].map((v) => <input key={`${f}-${v}`} type="hidden" name={f} value={v} />))}
                <label htmlFor="search-sort">Sort by</label>
                <AutoSubmitSelect id="search-sort" name="sort" defaultValue={sort}>
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </AutoSubmitSelect>
              </form>
              {activeChips.length ? (
                <div className="chips">
                  {activeChips.map((chip) => (
                    <Link key={`${chip.facet}-${chip.value}`} href={toggleHref(chip.facet, chip.value)} className="chip">
                      {valueLabel(chip.facet, chip.value)} <span aria-hidden="true">×</span>
                      <span className="sr-only">Remove filter</span>
                    </Link>
                  ))}
                  <Link href={q ? `/search?q=${encodeURIComponent(q)}` : "/search"} className="link-btn">
                    Clear all
                  </Link>
                </div>
              ) : null}
            </div>
            {cards.length ? (
              <div className="book-grid">
                {cards.map((card) => (
                  <BookCard key={card.handle} book={card} blurb={card.blurb || undefined} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h2>No matches</h2>
                <p>Check the spelling, try the author&apos;s name, or remove a filter.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
