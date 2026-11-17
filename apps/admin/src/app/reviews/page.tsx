"use client"

import { Star } from "@medusajs/icons"
import { Badge, Button, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useMemo, useState } from "react"
import Link from "next/link"
import { ErrorNote, PageHeader, Section, Segmented } from "@/components/kit"
import { api, dateTime, useApi } from "@/lib/api"

type Review = {
  id: string
  product_id: string
  display_name: string
  rating: number
  title: string | null
  content: string
  status: "pending" | "approved" | "rejected"
  photo_url: string | null
  verified_purchase: boolean
  created_at: string
}

const ReviewsPage = () => {
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending")
  const { data, error, loading, reload } = useApi<{ reviews: Review[] }>(
    `/api/reviews?status=${filter}`
  )
  const products = useApi<{ products: { id: string; title: string }[] }>("/api/catalog?limit=200")
  const titles = useMemo(() => new Map((products.data?.products || []).map((p) => [p.id, p.title])), [products.data])
  const [busy, setBusy] = useState<string | null>(null)

  const setStatus = async (r: Review, status: "approved" | "rejected") => {
    setBusy(r.id)
    try {
      await api(`/api/reviews/${r.id}`, { method: "POST", json: { status } })
      toast.success(status === "rejected" ? "Review hidden" : "Review published")
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
      <PageHeader icon={Star} tone="plum" title="Reviews" subtitle="New reviews wait here until you publish them. Hide anything that breaks the review guidelines." />
      <ErrorNote message={error} />
      <Section
        title="Customer reviews"
        flush
        actions={
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "pending", label: "Awaiting approval" },
              { value: "approved", label: "Published" },
              { value: "rejected", label: "Hidden" },
              { value: "all", label: "All" },
            ]}
          />
        }
      >
        <div className="mr-scroll-x">
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
                  {r.photo_url ? (
                    <a href={r.photo_url} target="_blank" rel="noopener noreferrer">
                      <img src={r.photo_url} alt="Customer photo" className="mt-2 h-24 w-24 rounded-md object-cover" />
                    </a>
                  ) : null}
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
                  <Link href={`/products/catalog/${r.product_id}`} className="txt-compact-small text-ui-fg-interactive hover:underline">
                    {titles.get(r.product_id) || "View book"}
                  </Link>
                </Table.Cell>
                <Table.Cell className="py-3">
                  <StatusBadge color={r.status === "approved" ? "green" : r.status === "pending" ? "orange" : "grey"}>
                    {r.status === "approved" ? "Published" : r.status === "pending" ? "Awaiting approval" : "Hidden"}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell className="py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {r.status !== "approved" ? (
                      <Button size="small" isLoading={busy === r.id} onClick={() => setStatus(r, "approved")}>
                        Publish
                      </Button>
                    ) : null}
                    {r.status !== "rejected" ? (
                      <Button size="small" variant="secondary" isLoading={busy === r.id} onClick={() => setStatus(r, "rejected")}>
                        Hide
                      </Button>
                    ) : null}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
            </div>
        {!loading && !reviews.length ? <Text className="text-ui-fg-subtle px-6 py-10 text-center">No reviews yet.</Text> : null}
      </Section>
    </div>
  )
}


export default ReviewsPage
