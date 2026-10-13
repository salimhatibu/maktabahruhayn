"use client"

import Link from "next/link"
import { useCallback, useSyncExternalStore } from "react"
import { BookCover } from "./book-cover"
import { HeartIcon } from "./icons"

/** Wishlist kept in this browser only; there are no customer accounts yet. */
export type WishlistEntry = {
  handle: string
  title: string
  author: string | null
  arabicTitle: string | null
  cover: string | null
}

const KEY = "mr_wishlist"
const EVENT = "mr-wishlist-change"
const EMPTY: WishlistEntry[] = []
let cacheRaw: string | null = null
let cacheValue: WishlistEntry[] = EMPTY

function read(): WishlistEntry[] {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    return EMPTY
  }
  if (raw === cacheRaw) {
    return cacheValue
  }
  cacheRaw = raw
  try {
    const parsed = raw ? (JSON.parse(raw) as WishlistEntry[]) : EMPTY
    cacheValue = Array.isArray(parsed) ? parsed : EMPTY
  } catch {
    cacheValue = EMPTY
  }
  return cacheValue
}

function write(entries: WishlistEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Storage blocked; the toggle simply will not persist.
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

export function useWishlist() {
  const entries = useSyncExternalStore(subscribe, read, () => EMPTY)

  const has = useCallback((handle: string) => entries.some((e) => e.handle === handle), [entries])

  const toggle = useCallback((entry: WishlistEntry) => {
    const current = read()
    write(
      current.some((e) => e.handle === entry.handle)
        ? current.filter((e) => e.handle !== entry.handle)
        : [entry, ...current]
    )
  }, [])

  const add = useCallback((entry: WishlistEntry) => {
    const current = read()
    if (!current.some((e) => e.handle === entry.handle)) {
      write([entry, ...current])
    }
  }, [])

  const remove = useCallback((handle: string) => {
    write(read().filter((e) => e.handle !== handle))
  }, [])

  return { entries, has, toggle, add, remove }
}

export function WishlistButton({ entry, className = "" }: { entry: WishlistEntry; className?: string }) {
  const { has, toggle } = useWishlist()
  const saved = has(entry.handle)
  return (
    <button
      type="button"
      className={`wish-btn ${saved ? "is-saved" : ""} ${className}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${entry.title} from wishlist` : `Add ${entry.title} to wishlist`}
      onClick={() => toggle(entry)}
    >
      <HeartIcon size={24} filled={saved} />
    </button>
  )
}

export function HeaderWishlistLink() {
  const { entries } = useWishlist()
  return (
    <Link href="/wishlist" className="icon-btn" aria-label={`Wishlist, ${entries.length} saved`}>
      <HeartIcon size={25} />
      {entries.length ? <span className="cart-badge alt">{entries.length}</span> : null}
    </Link>
  )
}

export function WishlistGrid() {
  const { entries, remove } = useWishlist()

  if (!entries.length) {
    return (
      <div className="empty-state">
        <HeartIcon size={40} />
        <h2>Your wishlist is empty</h2>
        <p>Tap the heart on any book to save it here for later.</p>
        <Link href="/books" className="btn btn-primary">
          Browse Books
        </Link>
      </div>
    )
  }

  return (
    <div className="book-grid">
      {entries.map((entry) => (
        <article key={entry.handle} className="book-card">
          <Link href={`/books/${entry.handle}`} className="book-card-cover" tabIndex={-1} aria-hidden="true">
            <BookCover book={entry} />
          </Link>
          <h3 className="book-card-title">
            <Link href={`/books/${entry.handle}`}>{entry.title}</Link>
          </h3>
          {entry.author ? <p className="book-card-author">{entry.author}</p> : null}
          <button type="button" className="text-btn" onClick={() => remove(entry.handle)}>
            Remove
          </button>
        </article>
      ))}
    </div>
  )
}

/** Cart page "Save for Later": moves the line to the wishlist, then removes it. */
export function SaveForLaterButton({
  entry,
  removeAction,
  lineId,
}: {
  entry: WishlistEntry
  removeAction: (formData: FormData) => Promise<void>
  lineId: string
}) {
  const { add } = useWishlist()
  return (
    <form action={removeAction} onSubmit={() => add(entry)}>
      <input type="hidden" name="line_id" value={lineId} />
      <button type="submit" className="text-btn">
        Save for Later
      </button>
    </form>
  )
}
