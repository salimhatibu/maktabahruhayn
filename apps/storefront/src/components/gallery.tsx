"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { BookCover, type CoverBook } from "./book-cover"
import { ChevronLeft, ChevronRight, CloseIcon, MinusIcon, PlusIcon } from "./icons"

const MIN_SCALE = 1
const MAX_SCALE = 4
const CLICK_SCALE = 2.5
const DRAG_THRESHOLD = 4

export function Gallery({ book, images }: { book: CoverBook; images: string[] }) {
  const [active, setActive] = useState(0)
  const [viewing, setViewing] = useState(false)
  const shown = images.length ? { ...book, cover: images[active] } : book

  return (
    <div className="gallery">
      {images.length ? (
        <button
          type="button"
          className="gallery-main gallery-zoomable"
          onClick={() => setViewing(true)}
          aria-label={`Enlarge image of ${book.title}`}
        >
          <BookCover book={shown} priority />
          <span className="gallery-zoom-hint" aria-hidden="true">
            <PlusIcon size={16} /> Zoom
          </span>
        </button>
      ) : (
        <div className="gallery-main">
          <BookCover book={shown} priority />
        </div>
      )}
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
      {viewing ? (
        <Lightbox
          title={book.title}
          images={images}
          index={active}
          onIndex={setActive}
          onClose={() => setViewing(false)}
        />
      ) : null}
    </div>
  )
}

function Lightbox({
  title,
  images,
  index,
  onIndex,
  onClose,
}: {
  title: string
  images: string[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number; moved: boolean } | null>(null)

  // Pan only as far as the zoomed image's edges reach the stage's edges.
  const clampOffset = useCallback((x: number, y: number, s: number) => {
    const stage = stageRef.current
    const img = imgRef.current
    if (!stage || !img) return { x, y }
    const maxX = Math.max(0, (img.offsetWidth * s - stage.clientWidth) / 2)
    const maxY = Math.max(0, (img.offsetHeight * s - stage.clientHeight) / 2)
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) }
  }, [])

  // Zoom keeping the point under (clientX, clientY) fixed on screen.
  const zoomTo = useCallback(
    (next: number, clientX?: number, clientY?: number) => {
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next))
      const rect = stageRef.current?.getBoundingClientRect()
      if (s === 1 || !rect) {
        setScale(s)
        setOffset({ x: 0, y: 0 })
        return
      }
      const px = (clientX ?? rect.left + rect.width / 2) - (rect.left + rect.width / 2)
      const py = (clientY ?? rect.top + rect.height / 2) - (rect.top + rect.height / 2)
      setOffset((o) => {
        const ratio = s / scale
        return clampOffset(px - (px - o.x) * ratio, py - (py - o.y) * ratio, s)
      })
      setScale(s)
    },
    [scale, clampOffset]
  )

  const go = useCallback(
    (delta: number) => {
      if (images.length < 2) return
      onIndex((index + delta + images.length) % images.length)
      setScale(1)
      setOffset({ x: 0, y: 0 })
    },
    [images.length, index, onIndex]
  )

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      else if (event.key === "ArrowRight") go(1)
      else if (event.key === "ArrowLeft") go(-1)
      else if (event.key === "+" || event.key === "=") zoomTo(scale + 0.5)
      else if (event.key === "-") zoomTo(scale - 0.5)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, onClose, scale, zoomTo])

  // React attaches wheel listeners as passive, so preventDefault needs a native one.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomTo(scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event.clientX, event.clientY)
    }
    stage.addEventListener("wheel", onWheel, { passive: false })
    return () => stage.removeEventListener("wheel", onWheel)
  }, [scale, zoomTo])

  const onPointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startY: event.clientY, ox: offset.x, oy: offset.y, moved: false }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = event.clientX - d.startX
    const dy = event.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    d.moved = true
    if (scale > 1) setOffset(clampOffset(d.ox + dx, d.oy + dy, scale))
  }

  const onPointerUp = (event: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved) {
      if (scale > 1) zoomTo(1)
      else zoomTo(CLICK_SCALE, event.clientX, event.clientY)
    }
  }

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${title}, image ${index + 1} of ${images.length}`}>
      <button type="button" className="lightbox-backdrop" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="lightbox-bar">
        <p className="lightbox-title">
          {title}
          {images.length > 1 ? <span> · {index + 1} / {images.length}</span> : null}
        </p>
        <div className="lightbox-tools">
          <button type="button" onClick={() => zoomTo(scale - 0.5)} disabled={scale <= MIN_SCALE} aria-label="Zoom out">
            <MinusIcon size={20} />
          </button>
          <span className="lightbox-scale" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button type="button" onClick={() => zoomTo(scale + 0.5)} disabled={scale >= MAX_SCALE} aria-label="Zoom in">
            <PlusIcon size={20} />
          </button>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close image viewer">
            <CloseIcon size={22} />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`lightbox-stage ${scale > 1 ? "is-zoomed" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={images[index]}
          alt={`Image ${index + 1} of ${title}`}
          draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        />
      </div>

      {images.length > 1 ? (
        <>
          <button type="button" className="lightbox-nav prev" onClick={() => go(-1)} aria-label="Previous image">
            <ChevronLeft size={28} />
          </button>
          <button type="button" className="lightbox-nav next" onClick={() => go(1)} aria-label="Next image">
            <ChevronRight size={28} />
          </button>
        </>
      ) : null}

      <p className="lightbox-help">
        {scale > 1 ? "Drag to move around. Click to zoom out." : "Click the image to zoom in. Scroll to zoom."}
      </p>
    </div>,
    document.body
  )
}
