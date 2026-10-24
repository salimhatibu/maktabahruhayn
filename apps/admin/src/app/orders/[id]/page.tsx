"use client"

import { PencilSquare, XMark } from "@medusajs/icons"
import { Button, Container, Heading, Input, Label, Select, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import Link from "next/link"
import { use, useState } from "react"
import { api, dateTime, money, useApi } from "@/lib/api"

type Item = {
  id: string
  product_title: string
  variant_title: string
  quantity: number
  unit_price: number
  total: number
  thumbnail: string | null
}

type Order = {
  id: string
  display_id: number
  email: string
  currency_code: string
  status: string
  payment_status: string
  fulfillment_status: string
  created_at: string
  subtotal: number
  discount: number
  shipping: number
  total: number
  promotion_code: string | null
  gift_note: string | null
  shipping_address: Record<string, string>
  items: Item[]
  payments: { id: string; provider: string; status: string; amount: number; reference: string | null }[]
  shipments: { id: string; tracking_number: string | null; tracking_url: string | null; created_at: string }[]
}

const STATUS_COLORS: Record<string, "green" | "orange" | "red" | "grey"> = {
  completed: "green",
  captured: "green",
  delivered: "green",
  shipped: "orange",
  authorized: "orange",
  pending: "orange",
  awaiting: "orange",
  not_fulfilled: "grey",
  cancelled: "red",
  failed: "red",
  refunded: "red",
  returned: "red",
}

function statusColor(s: string) {
  return STATUS_COLORS[s] || "grey"
}

function EditAddressModal({
  address,
  onClose,
  onSave,
}: {
  address: Record<string, string>
  onClose: () => void
  onSave: (addr: Record<string, string>) => void
}) {
  const [form, setForm] = useState({ ...address })
  const set = (key: string, value: string) => setForm({ ...form, [key]: value })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-ui-bg-base shadow-elevation-modal w-full max-w-md rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <Text size="large" weight="plus">Edit Shipping Address</Text>
          <button onClick={onClose} className="text-ui-fg-subtle hover:text-ui-fg-base">
            <XMark />
          </button>
        </div>
        <div className="flex flex-col gap-3 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label size="xsmall" weight="plus">First Name</Label>
              <Input size="small" value={form.first_name || ""} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div>
              <Label size="xsmall" weight="plus">Last Name</Label>
              <Input size="small" value={form.last_name || ""} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>
          <div>
            <Label size="xsmall" weight="plus">Address</Label>
            <Input size="small" value={form.address_1 || ""} onChange={(e) => set("address_1", e.target.value)} />
          </div>
          <div>
            <Label size="xsmall" weight="plus">Address 2</Label>
            <Input size="small" value={form.address_2 || ""} onChange={(e) => set("address_2", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label size="xsmall" weight="plus">City</Label>
              <Input size="small" value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label size="xsmall" weight="plus">Postal Code</Label>
              <Input size="small" value={form.postal_code || ""} onChange={(e) => set("postal_code", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label size="xsmall" weight="plus">Country Code</Label>
              <Input size="small" value={form.country_code || ""} onChange={(e) => set("country_code", e.target.value)} />
            </div>
            <div>
              <Label size="xsmall" weight="plus">Phone</Label>
              <Input size="small" value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <Button size="small" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="small" onClick={() => onSave(form)}>Save</Button>
        </div>
      </div>
    </div>
  )
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, error, loading, reload } = useApi<{ order: Order }>(`/api/orders/${id}`)
  const [tracking, setTracking] = useState("")
  const [saving, setSaving] = useState(false)
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailDraft, setEmailDraft] = useState("")
  const [editingAddress, setEditingAddress] = useState(false)
  const order = data?.order

  const update = async (body: Record<string, unknown>) => {
    setSaving(true)
    try {
      await api(`/api/orders/${id}`, { method: "POST", json: body })
      toast.success("Order updated")
      reload()
    } catch (updateError) {
      toast.error((updateError as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <Container className="px-6 py-6">
        <Text className="text-ui-fg-error">{error}</Text>
        <Link href="/orders" className="txt-compact-small mt-3 inline-block">
          Back to orders
        </Link>
      </Container>
    )
  }
  if (loading || !order) {
    return <Container className="bg-ui-bg-component h-64 animate-pulse" />
  }

  const address = order.shipping_address || {}
  const isCancelled = order.status === "cancelled"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Heading level="h1">Order #{order.display_id}</Heading>
            <StatusBadge color={statusColor(order.status)}>{order.status}</StatusBadge>
            <StatusBadge color={statusColor(order.payment_status)}>{order.payment_status}</StatusBadge>
            <StatusBadge color={statusColor(order.fulfillment_status)}>{order.fulfillment_status}</StatusBadge>
          </div>
          <div className="mt-1 flex items-center gap-1">
            <Text size="small" className="text-ui-fg-subtle">
              {dateTime(order.created_at)} ·{" "}
              {editingEmail ? (
                <span className="inline-flex items-center gap-1">
                  <Input
                    size="small"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    className="w-56"
                  />
                  <Button
                    size="small"
                    disabled={!emailDraft.trim() || saving}
                    onClick={async () => {
                      await update({ email: emailDraft.trim() })
                      setEditingEmail(false)
                    }}
                  >
                    Save
                  </Button>
                  <Button size="small" variant="secondary" onClick={() => setEditingEmail(false)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <span>
                  {order.email}{" "}
                  <button
                    onClick={() => {
                      setEmailDraft(order.email)
                      setEditingEmail(true)
                    }}
                    className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                    title="Edit email"
                  >
                    <PencilSquare className="inline h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </Text>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isCancelled && order.fulfillment_status !== "shipped" && order.fulfillment_status !== "delivered" && (
            <Button size="small" variant="secondary" disabled={saving} onClick={() => update({ fulfillment_status: "shipped" })}>
              Mark shipped
            </Button>
          )}
          {!isCancelled && order.fulfillment_status === "shipped" && (
            <Button size="small" variant="secondary" disabled={saving} onClick={() => update({ fulfillment_status: "delivered" })}>
              Mark delivered
            </Button>
          )}
          {!isCancelled && order.payment_status === "awaiting" && (
            <Button size="small" disabled={saving} onClick={() => update({ payment_status: "captured" })}>
              Confirm payment
            </Button>
          )}
          {!isCancelled && order.status !== "completed" && (
            <Button
              size="small"
              variant="danger"
              disabled={saving}
              onClick={async () => {
                if (!confirm("Cancel this order? This cannot be undone.")) return
                await update({ status: "cancelled" })
              }}
            >
              Cancel order
            </Button>
          )}
          {!isCancelled && order.status === "pending" && order.payment_status === "captured" && (
            <Button size="small" disabled={saving} onClick={() => update({ status: "completed" })}>
              Complete order
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Container className="p-0">
          <div className="mr-scroll-x">
            <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Item</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Qty</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Price</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Total</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {order.items.map((item) => (
                <Table.Row key={item.id}>
                  <Table.Cell>
                    <span className="txt-compact-small-plus">{item.product_title}</span>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {item.variant_title}
                    </Text>
                  </Table.Cell>
                  <Table.Cell className="text-right">{item.quantity}</Table.Cell>
                  <Table.Cell className="text-right">{money(item.unit_price, order.currency_code)}</Table.Cell>
                  <Table.Cell className="text-right">{money(item.total, order.currency_code)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
            </div>
          <div className="flex flex-col gap-1 px-6 py-4">
            {[
              ["Subtotal", order.subtotal],
              ["Discount", -order.discount],
              ["Shipping", order.shipping],
            ].map(([label, value]) => (
              <div key={String(label)} className="txt-compact-small flex justify-between">
                <span className="text-ui-fg-subtle">{label}</span>
                <span>{money(Number(value), order.currency_code)}</span>
              </div>
            ))}
            <div className="txt-compact-small-plus mt-1 flex justify-between border-t pt-2">
              <span>Total</span>
              <span>{money(order.total, order.currency_code)}</span>
            </div>
          </div>
        </Container>

        <div className="flex flex-col gap-3">
          <Container className="flex flex-col gap-2 px-6 py-4">
            <div className="flex items-center justify-between">
              <Heading level="h2">Delivery</Heading>
              <button
                onClick={() => setEditingAddress(true)}
                className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                title="Edit address"
              >
                <PencilSquare className="h-4 w-4" />
              </button>
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {[address.first_name, address.last_name].filter(Boolean).join(" ")}
              <br />
              {address.address_1}
              {address.address_2 ? <>, {address.address_2}</> : null}
              <br />
              {[address.city, address.postal_code].filter(Boolean).join(" ")}
              <br />
              {(address.country_code || "").toUpperCase()}
              {address.phone ? <><br />{address.phone}</> : null}
            </Text>
            <div className="mt-2 flex gap-2">
              <Input
                size="small"
                placeholder="Tracking number"
                value={tracking}
                onChange={(event) => setTracking(event.target.value)}
              />
              <Button
                size="small"
                disabled={!tracking.trim() || saving}
                onClick={() => {
                  void update({ tracking_number: tracking.trim(), fulfillment_status: "shipped" })
                  setTracking("")
                }}
              >
                Add
              </Button>
            </div>
            {order.shipments.map((shipment) => (
              <Text key={shipment.id} size="xsmall" className="text-ui-fg-subtle">
                {shipment.tracking_number} · {dateTime(shipment.created_at)}
              </Text>
            ))}
          </Container>

          <Container className="flex flex-col gap-2 px-6 py-4">
            <Heading level="h2">Payment</Heading>
            {order.payments.length ? (
              order.payments.map((payment) => (
                <div key={payment.id} className="txt-compact-small flex items-center justify-between">
                  <span>
                    {payment.provider}
                    {payment.reference ? (
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {payment.reference}
                      </Text>
                    ) : null}
                  </span>
                  <StatusBadge color={statusColor(payment.status)}>
                    {money(payment.amount, order.currency_code)}
                  </StatusBadge>
                </div>
              ))
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                No payment recorded.
              </Text>
            )}
            {order.promotion_code ? (
              <Text size="xsmall" className="text-ui-fg-subtle">
                Promo code {order.promotion_code}
              </Text>
            ) : null}
          </Container>
        </div>
      </div>

      {editingAddress && (
        <EditAddressModal
          address={address}
          onClose={() => setEditingAddress(false)}
          onSave={async (addr) => {
            await update({ shipping_address: addr })
            setEditingAddress(false)
          }}
        />
      )}
    </div>
  )
}
