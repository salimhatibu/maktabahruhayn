import { ArrowDownTray, ArrowUpTray, MagnifyingGlass, Plus, Tag } from "@medusajs/icons"
import { Badge, Button, Container, Heading, StatusBadge, Table, Text, clx } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { StockTable } from "../../../components/catalog/stock-table"
import { IconChip } from "../../../components/kit"
import { money, useApi } from "../../../lib/api"

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
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = (VIEWS.some((v) => v.value === params.get("view")) ? params.get("view") : "all") as View
  const [q, setQ] = useState(params.get("q") || "")
  const [debounced, setDebounced] = useState(q)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => setOffset(0), [debounced, view])

  const { data, error, loading } = useApi<{ products: Row[]; count: number; counts: Counts }>(
    view === "stock" ? null : `/admin/maktabah/catalog?view=${view}&q=${encodeURIComponent(debounced)}&limit=${PAGE}&offset=${offset}`
  )
  const counts = useApi<{ counts: Counts }>(view === "stock" ? "/admin/maktabah/catalog?limit=1" : null)
  const tabCounts = data?.counts || counts.data?.counts
  const rows = data?.products || []
  const count = data?.count || 0

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
          <Button size="small" variant="secondary" onClick={() => navigate("/products/import")}>
            <ArrowUpTray /> Import
          </Button>
          <Button size="small" variant="secondary" onClick={() => navigate("/products/export")}>
            <ArrowDownTray /> Export
          </Button>
          <Button size="small" onClick={() => navigate("/products/catalog/new")}>
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

      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <nav className="-mb-3 flex gap-1 overflow-x-auto" aria-label="Product views">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                aria-current={view === v.value ? "page" : undefined}
                onClick={() => setParams(v.value === "all" ? {} : { view: v.value })}
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
            <Table>
              <Table.Header>
                <Table.Row>
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
                  <Table.Row key={row.id} className="cursor-pointer" onClick={() => navigate(`/products/catalog/${row.id}`)}>
                    <Table.Cell className="mr-tabular text-ui-fg-muted">{row.product_number ?? "—"}</Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-3 py-2">
                        <div className="bg-ui-bg-subtle border-ui-border-base flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded border">
                          {row.thumbnail ? <img src={row.thumbnail} alt="" className="h-full w-full object-contain" loading="lazy" /> : null}
                        </div>
                        <div className="min-w-0">
                          <Link
                            to={`/products/catalog/${row.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-ui-fg-base txt-compact-small-plus block max-w-[30rem] truncate hover:underline"
                          >
                            {row.title}
                          </Link>
                          <div className="text-ui-fg-subtle txt-compact-xsmall mt-0.5 flex items-center gap-1.5">
                            <span className="truncate">{row.author || row.categories[0] || " "}</span>
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

export default ProductsPage
