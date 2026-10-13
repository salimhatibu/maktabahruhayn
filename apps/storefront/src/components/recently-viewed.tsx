"use client"

import Link from "next/link"
import { useEffect, useSyncExternalStore } from "react"
import { BookCover } from "./book-cover"

/** Recently viewed books, kept on this device (Darussalam / B&N style shelf). */
type Viewed = { handle: string; title: string; author: string | null; arabicTitle: string | null; cover: string | null }

const KEY = "mr_recent"
const EVENT = "mr-recent-change"
const MAX = 12
const EMPTY: Viewed[] = []
let cacheRaw: string | null = null
let cacheValue: Viewed[] = EMPTY

function read(): Viewed[] {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    return EMPTY
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw
    try {
      const parsed = raw ? (JSON.parse(raw) as Viewed[]) : EMPTY
      cacheValue = Array.isArray(parsed) ? parsed : EMPTY
    } catch {
      cacheValue = EMPTY
    }
  }
  return cacheValue
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}

/** Mount on a product page to record the view. */
export function RecordView({ book }: { book: Viewed }) {
  useEffect(() => {
    const next = [book, ...read().filter((b) => b.handle !== book.handle)].slice(0, MAX)
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next))
      window.dispatchEvent(new Event(EVENT))
    } catch {
      // Storage unavailable; nothing to record.
    }
  }, [book])
  return null
}

export function RecentlyViewed({ exclude }: { exclude?: string }) {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY).filter((b) => b.handle !== exclude)
  if (!items.length) {
    return null
  }
  return (
    <section className="shelf wrap" aria-labelledby="recent-title">
      <div className="shelf-head">
        <h2 id="recent-title">Recently Viewed</h2>
      </div>
      <div className="recent-row">
        {items.map((b) => (
          <Link key={b.handle} href={`/books/${b.handle}`} className="recent-item">
            <BookCover book={b} />
            <span>{b.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
