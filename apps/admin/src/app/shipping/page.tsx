"use client"

import { TruckFast } from "@medusajs/icons"
import { Button, Input, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import Link from "next/link"
import { ErrorNote, Field, PageHeader, Section } from "@/components/kit"
import { api, dateTime, money, useApi, useSettings } from "@/lib/api"
import { KENYA_COUNTIES, PRICED_CURRENCIES } from "@maktabah/shared"

type ShippingSettings = { freeThresholdUsd: number; freeThresholdKes: number; fallbackUsd: number; fallbackKes: number }
type ShippingMethod = {
  id: string
  name: string
  price_type: string
  provider_id: string
  amount: number | null
  currency_code: string | null
  countries: string[]
  county_prices: Record<string, number> | null
  is_active: boolean
  service_zone?: { name: string }
}
type ShippingMethodDraft = {
  id?: string
  name: string
  amount: number
  currency: string
  countries: string
  county_prices: Record<string, number> | null
  is_active: boolean
}

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
  delivery_address: { country_code: string; city: string; province?: string } | null
}

type Overview = {
  fulfillments: Fulfillment[]
  options: ShippingMethod[]
  zones: { id: string; name: string; countries: string[] }[]
}

function status(f: Fulfillment) {
  if (f.canceled_at) return { label: "Canceled", color: "grey" as const }
  if (f.delivered_at) return { label: "Delivered", color: "green" as const }
  if (f.shipped_at) return { label: "Shipped", color: "blue" as const }
  return { label: "Awaiting shipment", color: "orange" as const }
}

const ShippingPage = () => {
  const { data, error, reload } = useApi<Overview>("/api/shipping")
  const settings = useSettings<ShippingSettings>("shipping")
  const [form, setForm] = useState<ShippingSettings | null>(null)
  const [methodForm, setMethodForm] = useState<ShippingMethodDraft | null>(null)
  const [savingMethod, setSavingMethod] = useState(false)
  const [deletingMethodId, setDeletingMethodId] = useState<string | null>(null)
  useEffect(() => setForm(settings.value), [settings.value])

  const addMethod = () =>
    setMethodForm({ name: "", amount: 750, currency: "kes", countries: "ke", county_prices: null, is_active: true })

  const editMethod = (option: ShippingMethod) => {
    if (option.provider_id !== "manual") return
    setMethodForm({
      id: option.id,
      name: option.name,
      amount: option.amount ?? 0,
      currency: option.currency_code || "usd",
      countries: option.countries.join(", "),
      county_prices: option.county_prices ? { ...option.county_prices } : null,
      is_active: option.is_active,
    })
  }

  const saveMethod = async () => {
    if (!methodForm) return
    setSavingMethod(true)
    try {
      await api("/api/shipping/options", {
        method: "POST",
        json: {
          ...methodForm,
          countries: methodForm.countries
            .split(",")
            .map((country) => country.trim().toLowerCase())
            .filter(Boolean),
        },
      })
      await reload()
      setMethodForm(null)
      toast.success("Shipping method saved")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingMethod(false)
    }
  }

  const deleteMethod = async (option: ShippingMethod) => {
    if (!window.confirm(`Delete "${option.name}"? Existing orders will keep their delivery details.`)) return
    setDeletingMethodId(option.id)
    try {
      await api(`/api/shipping/options?id=${encodeURIComponent(option.id)}`, { method: "DELETE" })
      await reload()
      toast.success("Shipping method deleted")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeletingMethodId(null)
    }
  }

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
      <PageHeader icon={TruckFast} tone="teal" title="Shipping" subtitle="Delivery rates, free-shipping rules, shipments and tracking." />
      <ErrorNote message={error || settings.error} />

      <Section
        title="Delivery methods"
        description="Add and edit the rates customers can choose at checkout."
        flush
        actions={
          <div className="flex flex-wrap gap-4">
            <Button size="small" onClick={addMethod}>
              Add delivery method
            </Button>
          </div>
        }
      >
        <div className="mr-scroll-x">
            <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Method</Table.HeaderCell>
              <Table.HeaderCell>Price</Table.HeaderCell>
              <Table.HeaderCell>Zone</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(data?.options || []).map((o) => (
              <Table.Row key={o.id}>
                <Table.Cell>{o.name}</Table.Cell>
                <Table.Cell>
                  {o.county_prices
                      ? "County rates (KES)"
                      : o.amount === null
                        ? "—"
                        : `${money(o.amount, o.currency_code || "usd")} flat`}
                </Table.Cell>
                <Table.Cell>{o.county_prices ? "Kenya" : o.service_zone?.name}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={o.is_active ? "green" : "grey"}>{o.is_active ? "Active" : "Inactive"}</StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  {o.provider_id === "manual" ? (
                    <div className="flex gap-2">
                      <Button size="small" variant="secondary" onClick={() => editMethod(o)}>
                        Edit
                      </Button>
                      {o.id.startsWith("ship_") ? (
                        <Button
                          size="small"
                          variant="danger"
                          isLoading={deletingMethodId === o.id}
                          onClick={() => deleteMethod(o)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
            </div>
        <Text size="xsmall" className="text-ui-fg-muted px-6 py-3">
          Ships to {data?.zones.reduce((n, z) => n + z.countries.length, 0) ?? 0} countries. Where no option above
          covers a destination, checkout offers standard delivery at the fallback rates below.
        </Text>
        {methodForm ? (
          <div className="border-t border-ui-border-base p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <Text weight="plus">{methodForm.id ? "Edit delivery method" : "Add delivery method"}</Text>
              <Button size="small" variant="secondary" onClick={() => setMethodForm(null)}>
                Cancel
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Method name">
                <Input value={methodForm.name} maxLength={100} onChange={(e) => setMethodForm({ ...methodForm, name: e.target.value })} />
              </Field>
              <Field label="Flat price" hint="Major currency units; KES prices must be whole shillings.">
                <Input type="number" min={0} step={methodForm.currency === "kes" ? 1 : 0.01} value={methodForm.amount} onChange={(e) => setMethodForm({ ...methodForm, amount: Number(e.target.value) })} />
              </Field>
              <Field label="Currency">
                <select
                  value={methodForm.currency}
                  onChange={(e) => setMethodForm({ ...methodForm, currency: e.target.value })}
                >
                  {PRICED_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency.toUpperCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Destination countries" hint="Comma-separated ISO country codes; leave blank for worldwide.">
                <Input value={methodForm.countries} onChange={(e) => setMethodForm({ ...methodForm, countries: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={methodForm.is_active}
                  onChange={(e) => setMethodForm({ ...methodForm, is_active: e.target.checked })}
                />
                Available at checkout
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(methodForm.county_prices)}
                  onChange={(e) =>
                    setMethodForm({
                      ...methodForm,
                      currency: e.target.checked ? "kes" : methodForm.currency,
                      countries: e.target.checked ? "ke" : methodForm.countries,
                      county_prices: e.target.checked
                        ? Object.fromEntries(KENYA_COUNTIES.map((county) => [county.code, methodForm.county_prices?.[county.code] ?? methodForm.amount]))
                        : null,
                    })
                  }
                />
                Set a different KES price per county
              </label>
            </div>
            {methodForm.county_prices ? (
              <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {KENYA_COUNTIES.map((county) => (
                  <Field key={county.code} label={county.name}>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={methodForm.county_prices?.[county.code] ?? ""}
                      onChange={(e) =>
                        setMethodForm({
                          ...methodForm,
                          county_prices: {
                            ...(methodForm.county_prices || {}),
                            [county.code]: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end">
              <Button isLoading={savingMethod} onClick={saveMethod}>
                Save method
              </Button>
            </div>
          </div>
        ) : null}
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
              <Field label="Fallback rate (USD)" hint="Used when no delivery method matches the destination">
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
        <div className="mr-scroll-x">
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
                  <Table.Cell>{f.order ? <Link href={`/orders/${f.order.id}`}>#{f.order.display_id}</Link> : "—"}</Table.Cell>
                  <Table.Cell>{dateTime(f.created_at)}</Table.Cell>
                  <Table.Cell>
                    {f.delivery_address?.city}
                    {f.delivery_address?.province ? `, ${f.delivery_address.province}` : ""}{" "}
                    {f.delivery_address?.country_code?.toUpperCase()}
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
            </div>
        {!data?.fulfillments.length ? (
          <Text size="small" className="text-ui-fg-muted px-6 py-4">
            No shipments yet.
          </Text>
        ) : null}
      </Section>
    </div>
  )
}


export default ShippingPage
