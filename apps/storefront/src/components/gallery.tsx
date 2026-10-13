"use client"

import { useState } from "react"
import { BookCover, type CoverBook } from "./book-cover"

export function Gallery({ book, images }: { book: CoverBook; images: string[] }) {
  const [active, setActive] = useState(0)
  const shown = images.length ? { ...book, cover: images[active] } : book

  return (
    <div className="gallery">
      <div className="gallery-main">
        <BookCover book={shown} priority />
      </div>
      {images.length > 1 ? (
        <div className="gallery-thumbs" role="tablist" aria-label="Book images">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onClick={() => setActive(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Image ${i + 1} of ${book.title}`} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
