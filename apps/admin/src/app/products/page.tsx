"use client"

import { ArrowDownTray, MagnifyingGlass, Plus, Tag, Trash } from "@medusajs/icons"
import { Badge, Button, Checkbox, Container, Heading, StatusBadge, Table, Text, clx, usePrompt } from "@medusajs/ui"
import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { StockTable } from "@/components/stock-table"
import { IconChip } from "@/components/kit"
import { api, money, useApi } from "@/lib/api"
import { mediaSrc } from "@/lib/media-src"

type Row = {
  id: string
  product_number: number | null
  title: string
  author: string | null
  status: string
  publish_at: string | null
  thumbnail: string | null
  product_type: "standard" | "bundle"
  categories: string[]
  price_min: number | null
  price_max: number | null
  variants: number
  stock: number | null
  low_stock_threshold: number | null
  updated_at: string
}

type View = "all" | "published" | "draft" | "bundle" | "stock"
type Counts = { all: number; published: number; draft: number; bundle: number }

const VIEWS: { value: View; label: string; count?: keyof Counts }[] = [
  { value: "all", label: "All", count: "all" },
  { value: "published", label: "Published", count: "published" },
  { value: "draft", label: "Drafts", count: "draft" },
  { value: "bundle", label: "Bundles", count: "bundle" },
  { value: "stock", label: "Stock" },
]

const PAGE = 50

function price(row: Row) {
  if (row.price_min === null) {
    return "—"
  }
  return row.price_min === row.price_max
    ? money(row.price_min, "kes")
    : `${money(row.price_min, "kes")} – ${money(row.price_max as number, "kes")}`
}

function Status({ row }: { row: Row }) {
  if (row.status === "published") {
    return <StatusBadge color="green">Published</StatusBadge>
  }
  if (row.publish_at) {
    return <StatusBadge color="blue">Scheduled</StatusBadge>
  }
  return <StatusBadge color="grey">Draft</StatusBadge>
}

const ProductsPage = () => {
  const router = useRouter()
  const params = useSearchParams()
  const prompt = usePrompt()
  const setViewParam = (next: Record<string, string>) => {
    const query = new URLSearchParams(next).toString()
    router.push(query ? `/products?${query}` : "/products")
  }
  const view = (VIEWS.some((v) => v.value === params.get("view")) ? params.get("view") : "all") as View
  const [q, setQ] = useState(params.get("q") || "")
  const [debounced, setDebounced] = useState(q)
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => setOffset(0), [debounced, view])

  const { data, error, loading, reload } = useApi<{ products: Row[]; count: number; counts: Counts }>(
    view === "stock" ? null : `/api/catalog?view=${view}&q=${encodeURIComponent(debounced)}&limit=${PAGE}&offset=${offset}`
  )
  const counts = useApi<{ counts: Counts }>(view === "stock" ? "/api/catalog?limit=1" : null)
  const tabCounts = data?.counts || counts.data?.counts
  const rows = data?.products || []
  const count = data?.count || 0

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someSelected = selected.size > 0

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) {
        rows.forEach((r) => next.delete(r.id))
      } else {
        rows.forEach((r) => next.add(r.id))
      }
      return next
    })
  }, [rows, allOnPageSelected])

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selected)
    const confirmed = await prompt({
      title: `Delete ${ids.length} product${ids.length === 1 ? "" : "s"}?`,
      description: "This will permanently remove the selected products, their variants, prices and stock levels.",
      confirmText: "Delete",
      cancelText: "Cancel",
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await api("/api/catalog", { method: "DELETE", json: { ids } })
      setSelected(new Set())
      reload()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }, [selected, prompt, reload])

  useEffect(() => {
    setSelected(new Set())
  }, [view, debounced])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <IconChip icon={Tag} tone="gold" />
          <div>
            <Heading level="h1">Products</Heading>
            <Text size="small" className="text-ui-fg-subtle mt-0.5">
              Books, sets and bundles. Prices are set in KES and converted for every other currency.
            </Text>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Served as an attachment, so the browser saves it and stays on the page. */}
          <Button size="small" variant="secondary" onClick={() => (window.location.href = "/api/catalog?format=csv")}>
            <ArrowDownTray /> Export CSV
          </Button>
          <Button size="small" onClick={() => router.push("/products/new")}>
            <Plus /> Add product
          </Button>
        </div>
      </div>

      {error ? (
        <Container className="px-6 py-3">
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        </Container>
      ) : null}

      {someSelected ? (
        <div className="bg-ui-bg-base border-ui-border-base flex items-center gap-3 rounded-lg border px-4 py-2.5 shadow-sm">
          <Text size="small" weight="plus">
            {selected.size} selected
          </Text>
          <button
            type="button"
            className="txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base underline"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
          <div className="flex-1" />
          <Button size="small" variant="danger" onClick={bulkDelete} disabled={deleting}>
            <Trash /> {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      ) : null}

      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <nav className="-mb-3 flex gap-1 overflow-x-auto" aria-label="Product views">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                aria-current={view === v.value ? "page" : undefined}
                onClick={() => setViewParam(v.value === "all" ? {} : { view: v.value })}
                className={clx(
                  "txt-compact-small-plus -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-3 pt-1 transition-colors",
                  view === v.value
                    ? "border-ui-fg-base text-ui-fg-base"
                    : "text-ui-fg-subtle hover:text-ui-fg-base border-transparent"
                )}
              >
                {v.label}
                {v.count && tabCounts ? (
                  <span className="txt-compact-xsmall text-ui-fg-muted mr-tabular">{tabCounts[v.count]}</span>
                ) : null}
              </button>
            ))}
          </nav>
          <div className="relative w-full sm:w-72">
            <MagnifyingGlass className="text-ui-fg-muted pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2" />
            <input
              type="search"
              placeholder={view === "stock" ? "Search title or SKU" : "Search title, author or number"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="bg-ui-bg-field shadow-borders-base txt-compact-small placeholder:text-ui-fg-muted focus:shadow-borders-interactive-with-active h-8 w-full rounded-md pl-8 pr-2 outline-none"
            />
          </div>
        </div>

        {view === "stock" ? (
          <StockTable q={debounced} />
        ) : (
          <>
            <div className="mr-scroll-x">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell className="w-10">
                    <Checkbox
                      checked={allOnPageSelected && rows.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </Table.HeaderCell>
                  <Table.HeaderCell className="w-16">No.</Table.HeaderCell>
                  <Table.HeaderCell>Product</Table.HeaderCell>
                  <Table.HeaderCell className="hidden lg:table-cell">Category</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Price</Table.HeaderCell>
                  <Table.HeaderCell className="hidden text-right md:table-cell">Stock</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => (
                  <Table.Row
                    key={row.id}
                    className={clx("cursor-pointer", selected.has(row.id) && "bg-ui-bg-highlight")}
                    onClick={() => router.push(`/products/${row.id}`)}
                  >
                    <Table.Cell>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={() => toggleOne(row.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Table.Cell>
                    <Table.Cell className="mr-tabular text-ui-fg-muted">{row.product_number ?? "—"}</Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-3 py-2">
                        <div className="bg-ui-bg-subtle border-ui-border-base flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded border">
                          {row.thumbnail ? <img src={mediaSrc(row.thumbnail)} alt="" className="h-full w-full object-contain" loading="lazy" /> : null}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/products/${row.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-ui-fg-base txt-compact-small-plus block max-w-[30rem] truncate hover:underline"
                          >
                            {row.title}
                          </Link>
                          <div className="text-ui-fg-subtle txt-compact-xsmall mt-0.5 flex items-center gap-1.5">
                            <span className="truncate">{row.author || row.categories[0] || " "}</span>
                            {row.product_type === "bundle" ? <Badge size="2xsmall">Bundle</Badge> : null}
                            {row.variants > 1 ? <span className="shrink-0">· {row.variants} formats</span> : null}
                          </div>
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-ui-fg-subtle hidden lg:table-cell">{row.categories[0] || "—"}</Table.Cell>
                    <Table.Cell className="mr-tabular whitespace-nowrap text-right">{price(row)}</Table.Cell>
                    <Table.Cell className="mr-tabular hidden text-right md:table-cell">
                      {row.stock === null ? (
                        <span className="text-ui-fg-muted">Not tracked</span>
                      ) : row.stock === 0 ? (
                        <span className="text-ui-fg-error">Out of stock</span>
                      ) : row.low_stock_threshold !== null && row.stock <= row.low_stock_threshold ? (
                        <span className="text-ui-fg-warning">{row.stock} <span className="txt-compact-xsmall text-ui-fg-muted">low</span></span>
                      ) : (
                        row.stock
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Status row={row} />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
            </div>
            {loading && !rows.length ? <Text className="text-ui-fg-subtle px-6 py-10 text-center">Loading…</Text> : null}
            {!loading && !rows.length ? (
              <div className="px-6 py-12 text-center">
                <Text weight="plus">{debounced ? "No products match your search" : "Nothing here yet"}</Text>
                <Text size="small" className="text-ui-fg-subtle mt-1">
                  {view === "bundle"
                    ? "Create a product and choose Bundle under Product type."
                    : view === "draft"
                      ? "Products saved as drafts appear here."
                      : "Try another title, author or product number."}
                </Text>
              </div>
            ) : null}
            {count > PAGE ? (
              <div className="flex items-center justify-between px-6 py-3">
                <Text size="small" className="text-ui-fg-subtle mr-tabular">
                  {offset + 1}–{Math.min(offset + PAGE, count)} of {count}
                </Text>
                <div className="flex gap-2">
                  <Button size="small" variant="secondary" disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>
                    Previous
                  </Button>
                  <Button size="small" variant="secondary" disabled={offset + PAGE >= count} onClick={() => setOffset(offset + PAGE)}>
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Container>
    </div>
  )
}

export default function Products() {
  return (
    <Suspense fallback={null}>
      <ProductsPage />
    </Suspense>
  )
}
