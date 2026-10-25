"use client"

import { ArrowUpTray, EllipsisVertical, MagnifyingGlass } from "@medusajs/icons"
import { Badge, Button, Drawer, DropdownMenu, IconButton, Input, Text, clx, toast, usePrompt } from "@medusajs/ui"
import { useEffect, useId, useRef, useState } from "react"
import { useApi } from "@/lib/api"
import { mediaSrc } from "@/lib/media-src"

export const MAX_IMAGES = 10
const MAX_BYTES = 10 * 1024 * 1024

async function uploadFiles(files: File[]) {
  const form = new FormData()
  for (const f of files) {
    form.append("files", f)
  }
  const base = process.env.__NEXT_ROUTER_BASEPATH || ""
  const res = await fetch(`${base}/api/uploads`, { method: "POST", body: form, credentials: "include" })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message || `Upload failed (${res.status})`)
  }
  const { files: uploaded } = (await res.json()) as { files: { url: string }[] }
  return uploaded.map((f) => f.url)
}

/** With several managers on a page, a paste goes to the one last pointed at or focused. */
const mounted = new Set<string>()
let activeManager: string | null = null

function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)))
}

export function ImageManager({
  images,
  onChange,
  max = MAX_IMAGES,
  firstLabel = "Cover",
}: {
  images: string[]
  onChange: (images: string[]) => void
  max?: number
  firstLabel?: string
}) {
  const prompt = usePrompt()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [browse, setBrowse] = useState(false)
  const latest = useRef(images)
  latest.current = images
  const instance = useId()

  useEffect(() => {
    mounted.add(instance)
    return () => {
      mounted.delete(instance)
      if (activeManager === instance) {
        activeManager = null
      }
    }
  }, [instance])

  const room = max - images.length

  const addFiles = async (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"))
    if (!files.length) {
      toast.error("Only image files can be added")
      return
    }
    const tooBig = files.filter((f) => f.size > MAX_BYTES)
    if (tooBig.length) {
      toast.error(`${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} larger than 10 MB`)
    }
    const accepted = files.filter((f) => f.size <= MAX_BYTES).slice(0, max - latest.current.length)
    if (files.length - tooBig.length > accepted.length) {
      toast.warning(`Only ${max} images are allowed here. Extra files were skipped.`)
    }
    if (!accepted.length) {
      return
    }
    setUploading(accepted.length)
    try {
      const urls = await uploadFiles(accepted)
      onChange([...latest.current, ...urls].slice(0, max))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(0)
    }
  }

  // Paste an image anywhere on the page (outside text fields) to add it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"))
      if (!files.length) return
      const target = activeManager && mounted.has(activeManager) ? activeManager : mounted.size === 1 ? instance : null
      if (target !== instance) return
      e.preventDefault()
      void addFiles(files)
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  })

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) {
      return
    }
    const next = [...images]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  const remove = (index: number) => onChange(images.filter((_, i) => i !== index))

  const clear = async () => {
    const ok = await prompt({
      title: "Remove all images?",
      description: "The files stay in your media library; they are only removed from here.",
      confirmText: "Remove all",
      cancelText: "Cancel",
    })
    if (ok) {
      onChange([])
    }
  }

  const claim = () => {
    activeManager = instance
  }

  return (
    <div className="flex flex-col gap-3" onPointerEnter={claim} onFocusCapture={claim}>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault()
            setDropActive(true)
          }
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault()
            setDropActive(false)
            void addFiles(e.dataTransfer.files)
          }
        }}
        className={clx(
          images.length || uploading ? "grid grid-cols-3 gap-3 rounded-lg sm:grid-cols-5 2xl:grid-cols-6" : "block rounded-lg",
          dropActive && "ring-ui-border-interactive ring-2 ring-offset-4"
        )}
      >
        {images.map((url, i) => (
          <div
            key={url}
            draggable
            onDragStart={(e) => {
              setDragIndex(i)
              e.dataTransfer.effectAllowed = "move"
            }}
            onDragOver={(e) => {
              if (dragIndex !== null) {
                e.preventDefault()
                setOverIndex(i)
              }
            }}
            onDrop={(e) => {
              if (dragIndex !== null) {
                e.preventDefault()
                e.stopPropagation()
                move(dragIndex, i)
              }
              setDragIndex(null)
              setOverIndex(null)
            }}
            onDragEnd={() => {
              setDragIndex(null)
              setOverIndex(null)
            }}
            className={clx(
              "group border-ui-border-base bg-ui-bg-subtle relative aspect-[3/4] cursor-grab overflow-hidden rounded-lg border",
              i === 0 && images.length > 1 && "col-span-2 row-span-2",
              dragIndex === i && "opacity-40",
              overIndex === i && dragIndex !== i && "ring-ui-border-interactive ring-2"
            )}
          >
            <img src={mediaSrc(url)} alt="" className="h-full w-full object-contain" draggable={false} />
            {i === 0 ? (
              <Badge size="2xsmall" color="green" className="absolute left-1.5 top-1.5">
                {firstLabel}
              </Badge>
            ) : (
              <span className="txt-compact-xsmall text-ui-fg-muted bg-ui-bg-base/80 absolute left-1.5 top-1.5 rounded px-1">
                {i + 1}
              </span>
            )}
            <div className="absolute right-1 top-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <DropdownMenu>
                <DropdownMenu.Trigger asChild>
                  <IconButton size="2xsmall" aria-label="Image options">
                    <EllipsisVertical />
                  </IconButton>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Item disabled={i === 0} onClick={() => move(i, 0)}>
                    Make {firstLabel.toLowerCase()} image
                  </DropdownMenu.Item>
                  <DropdownMenu.Item disabled={i === 0} onClick={() => move(i, i - 1)}>
                    Move left
                  </DropdownMenu.Item>
                  <DropdownMenu.Item disabled={i === images.length - 1} onClick={() => move(i, i + 1)}>
                    Move right
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onClick={() => window.open(url, "_blank", "noopener")}>Open full size</DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item className="text-ui-fg-error" onClick={() => remove(i)}>
                    Remove
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            </div>
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`up-${i}`} className="bg-ui-bg-component aspect-[3/4] animate-pulse rounded-lg" />
        ))}
        {!images.length && !uploading ? (
          <div className="border-ui-border-strong flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
            <span className="bg-ui-bg-component text-ui-fg-subtle flex h-10 w-10 items-center justify-center rounded-full">
              <ArrowUpTray />
            </span>
            <div>
              <Text size="small" weight="plus">
                Drag images here, or paste from the clipboard
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted mt-0.5">
                JPG, PNG or WebP up to 10 MB · up to {max} images
              </Text>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="small" variant="secondary" type="button" onClick={() => fileInput.current?.click()}>
                Upload images
              </Button>
              <Button size="small" variant="transparent" type="button" onClick={() => setBrowse(true)}>
                Choose existing
              </Button>
            </div>
          </div>
        ) : room > uploading ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="border-ui-border-strong text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-2 text-center transition-colors"
          >
            <ArrowUpTray />
            <span className="txt-compact-xsmall">Add images</span>
          </button>
        ) : null}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) {
            void addFiles(e.target.files)
          }
          e.target.value = ""
        }}
      />

      <div className={clx("flex flex-wrap items-center gap-2", !images.length && !uploading && "hidden")}>
        <Button size="small" variant="secondary" type="button" disabled={room <= 0} onClick={() => fileInput.current?.click()}>
          Upload
        </Button>
        <Button size="small" variant="secondary" type="button" disabled={room <= 0} onClick={() => setBrowse(true)}>
          Choose existing
        </Button>
        {images.length ? (
          <Button size="small" variant="transparent" type="button" onClick={clear}>
            Clear
          </Button>
        ) : null}
        <Text size="xsmall" className="text-ui-fg-muted mr-tabular ml-auto">
          {images.length} of {max} · drag to reorder · paste to add
        </Text>
      </div>

      <MediaLibrary
        open={browse}
        onOpenChange={setBrowse}
        exclude={images}
        limit={room}
        onPick={(urls) => onChange([...images, ...urls].slice(0, max))}
      />
    </div>
  )
}

function MediaLibrary({
  open,
  onOpenChange,
  exclude,
  limit,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exclude: string[]
  limit: number
  onPick: (urls: string[]) => void
}) {
  const { data, loading } = useApi<{ images: { url: string; product: string }[] }>(open ? "/api/media" : null)
  const [selected, setSelected] = useState<string[]>([])
  const [q, setQ] = useState("")
  useEffect(() => {
    if (open) {
      setSelected([])
      setQ("")
    }
  }, [open])

  const list = (data?.images || [])
    .filter((i) => !exclude.includes(i.url))
    .filter((i) => (q ? i.product.toLowerCase().includes(q.toLowerCase()) : true))

  const toggle = (url: string) =>
    setSelected((s) => (s.includes(url) ? s.filter((u) => u !== url) : s.length >= limit ? s : [...s, url]))

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content className="max-w-2xl">
        <Drawer.Header>
          <Drawer.Title>Media library</Drawer.Title>
          <Drawer.Description>Images already used on your products. Pick up to {limit}.</Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-4 overflow-y-auto">
          <div className="relative">
            <MagnifyingGlass className="text-ui-fg-muted pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2" />
            <Input size="small" className="pl-8" placeholder="Filter by product" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {loading ? <Text size="small" className="text-ui-fg-subtle">Loading…</Text> : null}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {list.map((img) => {
              const n = selected.indexOf(img.url)
              return (
                <button
                  key={img.url}
                  type="button"
                  onClick={() => toggle(img.url)}
                  title={img.product}
                  className={clx(
                    "border-ui-border-base bg-ui-bg-subtle relative aspect-[3/4] overflow-hidden rounded-lg border text-left",
                    n >= 0 && "ring-ui-border-interactive ring-2"
                  )}
                >
                  <img src={mediaSrc(img.url)} alt={img.product} className="h-full w-full object-contain" loading="lazy" />
                  {n >= 0 ? (
                    <span className="bg-ui-button-inverted txt-compact-xsmall-plus absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white">
                      {n + 1}
                    </span>
                  ) : null}
                  <span className="txt-compact-xsmall bg-ui-bg-base/90 absolute inset-x-0 bottom-0 truncate px-1.5 py-1">
                    {img.product}
                  </span>
                </button>
              )
            })}
          </div>
          {!loading && !list.length ? <Text size="small" className="text-ui-fg-subtle">No images found.</Text> : null}
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button size="small" variant="secondary">
              Cancel
            </Button>
          </Drawer.Close>
          <Button
            size="small"
            disabled={!selected.length}
            onClick={() => {
              onPick(selected)
              onOpenChange(false)
            }}
          >
            Add {selected.length || ""} {selected.length === 1 ? "image" : "images"}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
