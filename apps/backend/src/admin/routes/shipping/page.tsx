import { defineRouteConfig } from "@medusajs/admin-sdk"
import { TruckFast } from "@medusajs/icons"
import { Button, Input, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ErrorNote, Field, PageHeader, Section } from "../../components/kit"
import { dateTime, useApi, useSettings } from "../../lib/api"

type ShippingSettings = { freeThresholdUsd: number; freeThresholdKes: number; fallbackUsd: number; fallbackKes: number }

type Fulfillment = {
  id: string
  created_at: string
  shipped_at: string | null
  delivered_at: string | null
  canceled_at: string | null
  data: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  labels: { tracking_number: string; tracking_url: string; label_url: string }[]
  order: { id: string; display_id: number; email: string } | null
  delivery_address: { country_code: string; city: string } | null
}

type Overview = {
  shippo_configured: boolean
  webhook_configured: boolean
  fulfillments: Fulfillment[]
  options: { id: string; name: string; price_type: string; provider_id: string; service_zone?: { name: string } }[]
  zones: { id: string; name: string; countries: string[] }[]
}

function status(f: Fulfillment) {
  if (f.canceled_at) return { label: "Canceled", color: "grey" as const }
  if (f.delivered_at) return { label: "Delivered", color: "green" as const }
  if (f.shipped_at) return { label: "Shipped", color: "blue" as const }
  return { label: "Awaiting shipment", color: "orange" as const }
}

const ShippingPage = () => {
  const { data, error } = useApi<Overview>("/admin/maktabah/shipping")
  const settings = useSettings<ShippingSettings>("shipping")
  const [form, setForm] = useState<ShippingSettings | null>(null)
  useEffect(() => setForm(settings.value), [settings.value])

  const save = async () => {
    if (!form) return
    try {
      await settings.save({
        freeThresholdUsd: Number(form.freeThresholdUsd),
        freeThresholdKes: Number(form.freeThresholdKes),
        fallbackUsd: Number(form.fallbackUsd),
        fallbackKes: Number(form.fallbackKes),
      })
      toast.success("Shipping settings saved")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <PageHeader icon={TruckFast} tone="teal" title="Shipping" subtitle="Shippo rates, free-shipping rules, shipments and tracking." />
      <ErrorNote message={error || settings.error} />

      <Section
        title="Delivery options"
        flush
        actions={
          <div className="flex flex-wrap gap-4">
            <StatusBadge color={data?.shippo_configured ? "green" : "orange"}>
              Shippo {data?.shippo_configured ? "connected" : "using fallback rates"}
            </StatusBadge>
            <StatusBadge color={data?.webhook_configured ? "green" : "grey"}>
              Tracking webhook {data?.webhook_configured ? "on" : "off"}
            </StatusBadge>
          </div>
        }
      >
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Option</Table.HeaderCell>
              <Table.HeaderCell>Pricing</Table.HeaderCell>
              <Table.HeaderCell>Zone</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(data?.options || []).map((o) => (
              <Table.Row key={o.id}>
                <Table.Cell>{o.name}</Table.Cell>
                <Table.Cell>{o.price_type === "calculated" ? "Live (Shippo)" : "Flat rate"}</Table.Cell>
                <Table.Cell>{o.service_zone?.name}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <Text size="xsmall" className="text-ui-fg-muted px-6 py-3">
          Ships to {data?.zones.reduce((n, z) => n + z.countries.length, 0) ?? 0} countries. Edit zones and options in{" "}
          <Link to="/settings/locations">Settings → Locations & Shipping</Link>.
        </Text>
      </Section>

      <Section title="Free shipping & fallback rates" description="Free standard (postal) shipping above these order values. Other currencies use the USD threshold converted at today's rate.">
        {form ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Field label="Free above (USD)" hint="0 turns free shipping off">
                <Input type="number" min={0} value={form.freeThresholdUsd} onChange={(e) => setForm({ ...form, freeThresholdUsd: Number(e.target.value) })} />
              </Field>
              <Field label="Free above (KES)">
                <Input type="number" min={0} value={form.freeThresholdKes} onChange={(e) => setForm({ ...form, freeThresholdKes: Number(e.target.value) })} />
              </Field>
              <Field label="Fallback rate (USD)" hint="Used when Shippo has no quote">
                <Input type="number" min={0} value={form.fallbackUsd} onChange={(e) => setForm({ ...form, fallbackUsd: Number(e.target.value) })} />
              </Field>
              <Field label="Fallback rate (KES)">
                <Input type="number" min={0} value={form.fallbackKes} onChange={(e) => setForm({ ...form, fallbackKes: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button isLoading={settings.saving} onClick={save}>
                Save
              </Button>
            </div>
          </>
        ) : (
          <Text>Loading…</Text>
        )}
      </Section>

      <Section title="Shipments" description="Create shipments and labels from each order's Fulfillment section." flush>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Created</Table.HeaderCell>
              <Table.HeaderCell>Destination</Table.HeaderCell>
              <Table.HeaderCell>Carrier</Table.HeaderCell>
              <Table.HeaderCell>Tracking</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Documents</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(data?.fulfillments || []).map((f) => {
              const s = status(f)
              const label = f.labels?.[0]
              const invoice = f.data?.commercial_invoice_url as string | undefined
              return (
                <Table.Row key={f.id}>
                  <Table.Cell>{f.order ? <Link to={`/orders/${f.order.id}`}>#{f.order.display_id}</Link> : "—"}</Table.Cell>
                  <Table.Cell>{dateTime(f.created_at)}</Table.Cell>
                  <Table.Cell>
                    {f.delivery_address?.city} {f.delivery_address?.country_code?.toUpperCase()}
                  </Table.Cell>
                  <Table.Cell>{(f.data?.carrier as string) || "—"}</Table.Cell>
                  <Table.Cell>
                    {label?.tracking_url ? (
                      <a href={label.tracking_url} target="_blank" rel="noreferrer">
                        {label.tracking_number}
                      </a>
                    ) : (
                      label?.tracking_number || "—"
                    )}
                    {f.metadata?.tracking_status ? (
                      <Text size="xsmall" className="text-ui-fg-subtle">{String(f.metadata.tracking_status)}</Text>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={s.color}>{s.label}</StatusBadge>
                  </Table.Cell>
                  <Table.Cell>
                    {label?.label_url ? (
                      <a href={label.label_url} target="_blank" rel="noreferrer">Label</a>
                    ) : null}
                    {invoice ? (
                      <>
                        {" · "}
                        <a href={invoice} target="_blank" rel="noreferrer">Invoice</a>
                      </>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
        {!data?.fulfillments.length ? (
          <Text size="small" className="text-ui-fg-muted px-6 py-4">
            No shipments yet.
          </Text>
        ) : null}
      </Section>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Shipping", icon: TruckFast, rank: 5 })

export default ShippingPage
