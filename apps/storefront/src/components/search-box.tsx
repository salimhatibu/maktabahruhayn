"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { BookCover } from "./book-cover"
import { CloseIcon, SearchIcon } from "./icons"

type Suggestion = { handle: string; title: string; author: string | null; arabicTitle: string | null; cover: string | null }

const RECENT_KEY = "mr_recent_searches"

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]")
    return Array.isArray(parsed) ? parsed.slice(0, 6) : []
  } catch {
    return []
  }
}

function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)))
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Header search with instant, typo-tolerant suggestions from Typesense, plus
 * recent searches (with delete) and popular searches before typing.
 */
export function SearchBox({ popular }: { popular: string[] }) {
  const router = useRouter()
  // One header search per page, so a fixed id is stable across server and client renders.
  const listId = "site-search-suggestions"
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLFormElement>(null)

  useEffect(() => setRecent(readRecent()), [])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setSuggestions([])
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((d: { suggestions: Suggestion[] }) => {
          setSuggestions(d.suggestions)
          setActive(-1)
        })
        .catch(() => undefined)
    }, 160)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [q])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const go = (term: string) => {
    const value = term.trim()
    if (!value) {
      return
    }
    const next = [value, ...recent.filter((r) => r.toLowerCase() !== value.toLowerCase())]
    setRecent(next)
    writeRecent(next)
    setOpen(false)
    router.push(`/search?q=${encodeURIComponent(value)}`)
  }

  const showSuggestions = q.trim().length >= 2

  return (
    <form
      ref={boxRef}
      className="header-search"
      role="search"
      action="/search"
      onSubmit={(event) => {
        event.preventDefault()
        if (active >= 0 && suggestions[active]) {
          setOpen(false)
          router.push(`/books/${suggestions[active].handle}`)
          return
        }
        go(q)
      }}
    >
      <input
        name="q"
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showSuggestions || !suggestions.length) {
            return
          }
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, suggestions.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, -1))
          } else if (e.key === "Escape") {
            setOpen(false)
          }
        }}
        placeholder="Search by Title, Author, Translator, Publisher, ISBN"
        aria-label="Search books"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
      />
      <button type="submit" aria-label="Search">
        <SearchIcon size={22} />
      </button>

      {open ? (
        <div className="suggest-panel" id={listId} role="listbox">
          {showSuggestions ? (
            suggestions.length ? (
              <>
                {suggestions.map((s, i) => (
                  <Link
                    key={s.handle}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    href={`/books/${s.handle}`}
                    className={`suggest-item ${i === active ? "is-active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="suggest-thumb">
                      <BookCover book={s} />
                    </span>
                    <span>
                      <strong>{s.title}</strong>
                      {s.author ? <small>{s.author}</small> : null}
                    </span>
                  </Link>
                ))}
                <button type="submit" className="suggest-all">
                  See all results for “{q.trim()}”
                </button>
              </>
            ) : (
              <p className="suggest-empty">No quick matches. Press Enter to search everything.</p>
            )
          ) : (
            <div className="suggest-sections">
              {recent.length ? (
                <div>
                  <p className="suggest-heading">Recent Searches</p>
                  <ul>
                    {recent.map((r) => (
                      <li key={r} className="recent-search">
                        <button type="button" className="link-btn" onClick={() => go(r)}>
                          {r}
                        </button>
                        <button
                          type="button"
                          className="icon-btn small"
                          aria-label={`Delete ${r} from recent searches`}
                          onClick={() => {
                            const next = recent.filter((x) => x !== r)
                            setRecent(next)
                            writeRecent(next)
                          }}
                        >
                          <CloseIcon size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div>
                <p className="suggest-heading">Popular Searches</p>
                <ul className="popular-list">
                  {popular.map((p) => (
                    <li key={p}>
                      <button type="button" className="chip" onClick={() => go(p)}>
                        {p}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </form>
  )
}
