import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Star } from "@medusajs/icons"
import { Badge, Button, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ErrorNote, PageHeader, Section, Segmented } from "../../components/kit"
import { api, dateTime, useApi } from "../../lib/api"

type Review = {
  id: string
  product_id: string
  display_name: string
  rating: number
  title: string | null
  content: string
  status: "published" | "hidden"
  verified_purchase: boolean
  created_at: string
}

const ReviewsPage = () => {
  const [filter, setFilter] = useState<"all" | "published" | "hidden">("all")
  const { data, error, loading, reload } = useApi<{ reviews: Review[] }>(
    `/admin/reviews?limit=200${filter !== "all" ? `&status=${filter}` : ""}`
  )
  const products = useApi<{ products: { id: string; title: string }[] }>("/admin/maktabah/catalog?limit=200")
  const titles = useMemo(() => new Map((products.data?.products || []).map((p) => [p.id, p.title])), [products.data])
  const [busy, setBusy] = useState<string | null>(null)

  const setStatus = async (r: Review) => {
    const status = r.status === "published" ? "hidden" : "published"
    setBusy(r.id)
    try {
      await api(`/admin/reviews/${r.id}`, { method: "POST", json: { status } })
      toast.success(status === "hidden" ? "Review hidden" : "Review published")
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const reviews = data?.reviews || []

  return (
    <div>
      <PageHeader icon={Star} tone="plum" title="Reviews" subtitle="Reviews publish immediately. Hide anything that breaks the review guidelines." />
      <ErrorNote message={error} />
      <Section
        title="Customer reviews"
        flush
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "published", label: "Published" },
              { value: "hidden", label: "Hidden" },
            ]}
          />
        }
      >
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Review</Table.HeaderCell>
              <Table.HeaderCell>Book</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {reviews.map((r) => (
              <Table.Row key={r.id} className="align-top">
                <Table.Cell className="max-w-[34rem] py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-ui-tag-orange-icon tracking-tight" aria-label={`${r.rating} out of 5`}>
                      {"★".repeat(r.rating)}
                      <span className="text-ui-fg-disabled">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    {r.title ? (
                      <Text size="small" weight="plus" className="truncate">
                        {r.title}
                      </Text>
                    ) : null}
                  </div>
                  <Text size="small" className="text-ui-fg-subtle mt-1 whitespace-normal">
                    {r.content}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted mt-1">
                    {r.display_name} · {dateTime(r.created_at)}
                    {r.verified_purchase ? (
                      <Badge size="2xsmall" color="green" className="ml-2">
                        Verified purchase
                      </Badge>
                    ) : null}
                  </Text>
                </Table.Cell>
                <Table.Cell className="py-3">
                  <Link to={`/products/catalog/${r.product_id}`} className="txt-compact-small text-ui-fg-interactive hover:underline">
                    {titles.get(r.product_id) || "View book"}
                  </Link>
                </Table.Cell>
                <Table.Cell className="py-3">
                  <StatusBadge color={r.status === "published" ? "green" : "grey"}>{r.status === "published" ? "Published" : "Hidden"}</StatusBadge>
                </Table.Cell>
                <Table.Cell className="py-3 text-right">
                  <Button size="small" variant="secondary" isLoading={busy === r.id} onClick={() => setStatus(r)}>
                    {r.status === "published" ? "Hide" : "Publish"}
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {!loading && !reviews.length ? <Text className="text-ui-fg-subtle px-6 py-10 text-center">No reviews yet.</Text> : null}
      </Section>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Reviews", icon: Star, rank: 8 })

export default ReviewsPage
