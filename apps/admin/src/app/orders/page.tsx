"use client"

import { MagnifyingGlass, ShoppingCart } from "@medusajs/icons"
import { Button, Container, Input, StatusBadge, Table, Text } from "@medusajs/ui"
import Link from "next/link"
import { Suspense, useEffect, useState } from "react"
import { IconChip } from "@/components/kit"
import { dateTime, money, useApi } from "@/lib/api"

type Order = {
  id: string
  display_id: number
  email: string
  currency_code: string
  customer_name: string | null
  customer_phone: string | null
  discount: number
  item_count: number
  items_value: number
  shipping_method: string | null
  shipping_cost: number
  total: number
  status: string
  payment_status: string
  fulfillment_status: string
  provider: string | null
  promotion_code: string | null
  created_at: string
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "not_fulfilled", label: "To fulfil" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
]

function Fulfillment({ status }: { status: string }) {
  if (status === "delivered") return <StatusBadge color="green">Delivered</StatusBadge>
  if (status === "shipped") return <StatusBadge color="blue">Shipped</StatusBadge>
  if (status === "returned") return <StatusBadge color="red">Returned</StatusBadge>
  return <StatusBadge color="orange">Awaiting fulfilment</StatusBadge>
}

function Payment({ status }: { status: string }) {
  if (status === "captured") return <StatusBadge color="green">Paid</StatusBadge>
  if (status === "failed") return <StatusBadge color="red">Failed</StatusBadge>
  if (status === "refunded") return <StatusBadge color="grey">Refunded</StatusBadge>
  return <StatusBadge color="orange">Awaiting</StatusBadge>
}

function OrdersPage() {
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [filter, setFilter] = useState("all")

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(timer)
  }, [q])

  const { data, error, loading } = useApi<{ orders: Order[]; count: number }>(
    `/api/orders?q=${encodeURIComponent(debounced)}&status=${filter}`
  )
  const orders = data?.orders || []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3.5">
        <IconChip icon={ShoppingCart} tone="green" />
        <div>
          <h1 className="txt-large-plus">Orders</h1>
          <Text size="small" className="text-ui-fg-subtle mt-0.5">
            Every order placed, newest first.
          </Text>
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
          <nav className="flex gap-1" aria-label="Order views">
            {FILTERS.map((option) => (
              <Button
                key={option.value}
                size="small"
                variant={filter === option.value ? "secondary" : "transparent"}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </nav>
          <Input
            size="small"
            placeholder="Order number or email"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="w-full sm:w-64"
          />
        </div>

        {loading && !orders.length ? (
          <Text size="small" className="text-ui-fg-subtle px-6 py-8">
            Loading orders…
          </Text>
        ) : orders.length ? (
          <div className="mr-scroll-x">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Order</Table.HeaderCell>
                  <Table.HeaderCell>Customer</Table.HeaderCell>
                  <Table.HeaderCell>Discounts</Table.HeaderCell>
                  <Table.HeaderCell>Fulfilment</Table.HeaderCell>
                  <Table.HeaderCell>Items</Table.HeaderCell>
                  <Table.HeaderCell>Shipping</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Total</Table.HeaderCell>
                  <Table.HeaderCell>Payment</Table.HeaderCell>
                  <Table.HeaderCell>Date</Table.HeaderCell>
                  <Table.HeaderCell>Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {orders.map((order) => (
                  <Table.Row key={order.id}>
                    <Table.Cell>
                      <Link href={`/orders/${order.id}`} className="txt-compact-small-plus">
                        #{order.display_id}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="txt-compact-small-plus block">
                        {order.customer_name || "—"}
                      </span>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {order.email}
                      </Text>
                      {order.customer_phone ? (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {order.customer_phone}
                        </Text>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell>
                      {order.discount ? (
                        <span className="txt-compact-small">
                          {money(order.discount, order.currency_code)}
                          {order.promotion_code ? (
                            <Text size="xsmall" className="text-ui-fg-subtle block">
                              {order.promotion_code}
                            </Text>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-ui-fg-muted">—</span>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Fulfillment status={order.fulfillment_status} />
                    </Table.Cell>
                    <Table.Cell>
                      <span className="txt-compact-small">
                        {order.item_count} {order.item_count === 1 ? "item" : "items"}
                      </span>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {money(order.items_value, order.currency_code)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="txt-compact-small">
                        {order.shipping_method || "—"}
                      </span>
                      {order.shipping_cost ? (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {money(order.shipping_cost, order.currency_code)}
                        </Text>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell className="text-right txt-compact-small-plus">
                      {money(order.total, order.currency_code)}
                    </Table.Cell>
                    <Table.Cell>
                      <Payment status={order.payment_status} />
                      {order.provider ? (
                        <Text size="xsmall" className="text-ui-fg-subtle capitalize">
                          {order.provider}
                        </Text>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell>{dateTime(order.created_at)}</Table.Cell>
                    <Table.Cell>
                      <Link href={`/orders/${order.id}`}>
                        <Button size="small" variant="transparent">View</Button>
                      </Link>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        ) : (
          <div className="px-6 py-10 text-center">
            <MagnifyingGlass className="text-ui-fg-muted mx-auto" />
            <Text size="small" className="text-ui-fg-subtle mt-2">
              No orders match.
            </Text>
          </div>
        )}
      </Container>
    </div>
  )
}

export default function Orders() {
  return (
    <Suspense fallback={null}>
      <OrdersPage />
    </Suspense>
  )
}
