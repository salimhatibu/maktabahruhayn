"use client"

import { ShoppingCart } from "@medusajs/icons"
import { Button, Container, Input, Table, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { PageHeader } from "@/components/kit"
import { dateTime, money } from "@/lib/api"

type Cart = {
  customer_type: "linked" | "anonymous"
  name: string | null
  email: string | null
  phone: string | null
  currency: string
  items: { title: string; variant: string; quantity: number; unit_price: number }[]
  subtotal: number
  discount: number
  shipping: number
  total: number
  created_at: string
  updated_at: string
  payment: { provider: string; status: string } | null
  reminder: { status: string; error: string | null } | null
}

export default function AbandonedCartsPage() {
  const [view, setView] = useState<"inactive" | "all">("inactive")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ carts: Cart[]; has_more: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError(null)
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ view, q: search.trim(), page: String(page) })
      fetch(`/api/abandoned-carts?${params}`, { credentials: "include", signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not load carts.")
          return response.json() as Promise<{ carts: Cart[]; has_more: boolean }>
        })
        .then(setData)
        .catch((err: Error) => {
          if (err.name !== "AbortError") setError(err.message)
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [view, search, page])

  return (
    <div className="flex flex-col gap-3">
      <PageHeader icon={ShoppingCart} title="Abandoned Carts" subtitle="Review incomplete carts with items, most recently updated first." />
      <Container className="px-6 py-4">
        <Text size="small">
          Inactive means no recorded cart update for at least 24 hours, not confirmed abandonment.
          Last activity is the last saved cart update, not a visit or payment update. The exact abandonment time
          and item change history are not recorded. Completed and empty carts are excluded.
        </Text>
      </Container>
      {error ? <Container className="px-6 py-3"><Text size="small" className="text-ui-fg-error" role="alert">{error}</Text></Container> : null}
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
          <nav className="flex gap-1" aria-label="Cart views">
            {([{ value: "inactive", label: "Inactive 24+ hours" }, { value: "all", label: "All incomplete" }] as const).map((option) => (
              <Button key={option.value} size="small" variant={view === option.value ? "secondary" : "transparent"}
                onClick={() => { setView(option.value); setPage(0) }}>
                {option.label}
              </Button>
            ))}
          </nav>
          <Input size="small" aria-label="Search carts by customer or contact" placeholder="Search customer or contact"
            value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} className="w-full sm:w-64" />
        </div>
        {!data && !error ? <Text size="small" className="text-ui-fg-subtle px-6 py-8">Loading carts…</Text> : null}
        {data?.carts.length ? (
          <div className="mr-scroll-x">
            <Table>
              <Table.Header><Table.Row>
                <Table.HeaderCell>Shopper and contact</Table.HeaderCell>
                <Table.HeaderCell>Current items</Table.HeaderCell>
                <Table.HeaderCell>Total</Table.HeaderCell>
                <Table.HeaderCell>Latest payment attempt</Table.HeaderCell>
                <Table.HeaderCell>Reminder</Table.HeaderCell>
                <Table.HeaderCell>Last cart update</Table.HeaderCell>
                <Table.HeaderCell>Created</Table.HeaderCell>
              </Table.Row></Table.Header>
              <Table.Body>
                {data.carts.map((cart, index) => (
                  <Table.Row key={index}>
                    <Table.Cell>
                      <span className="txt-compact-small-plus block">{cart.name || (cart.customer_type === "linked" ? "Linked customer" : "Unidentified shopper")}</span>
                      <Text size="xsmall" className="text-ui-fg-subtle">{cart.customer_type === "linked" ? "Customer record linked" : "No customer record linked"}</Text>
                      <Text size="xsmall">{cart.email || "No email"}</Text>
                      <Text size="xsmall">{cart.phone || "No phone"}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <details>
                        <summary>{cart.items.reduce((sum, item) => sum + item.quantity, 0)} items · View</summary>
                        <ul>
                          {cart.items.map((item, i) => <li key={i} className="py-1">
                            {item.quantity} × {item.title}{item.variant ? ` — ${item.variant}` : ""} ({money(item.unit_price, cart.currency)} each)
                          </li>)}
                        </ul>
                      </details>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="txt-compact-small-plus">{money(cart.total, cart.currency)}</span>
                      <Text size="xsmall" className="text-ui-fg-subtle">Items {money(cart.subtotal, cart.currency)}</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">Discount {money(cart.discount, cart.currency)} · Shipping {money(cart.shipping, cart.currency)}</Text>
                    </Table.Cell>
                    <Table.Cell>{cart.payment ? <span className="capitalize">{cart.payment.provider}: {cart.payment.status}</span> : "No attempt recorded"}</Table.Cell>
                    <Table.Cell>
                      {cart.reminder ? <><span className="capitalize">{cart.reminder.status}</span>{cart.reminder.error ? <Text size="xsmall" className="text-ui-fg-error">{cart.reminder.error}</Text> : null}</> : "Not sent"}
                    </Table.Cell>
                    <Table.Cell>{dateTime(cart.updated_at)}</Table.Cell>
                    <Table.Cell>{dateTime(cart.created_at)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        ) : data ? <Text size="small" className="text-ui-fg-subtle px-6 py-8">No carts match this view.</Text> : null}
        <div className="flex items-center justify-between px-6 py-3">
          <Text size="small">Page {page + 1}</Text>
          <div className="flex gap-2">
            <Button size="small" variant="secondary" disabled={page === 0 || !data} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="small" variant="secondary" disabled={!data?.has_more} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Container>
      <Text size="small" className="text-ui-fg-subtle">
        Totals use current promotions and saved shipping; they can change. Contact details are not validated and do not imply
        marketing consent. The inactive filter does not indicate reminder eligibility. Payment status is the latest recorded
        attempt, not proof that an order was placed or that other attempts have finished.
      </Text>
    </div>
  )
}
