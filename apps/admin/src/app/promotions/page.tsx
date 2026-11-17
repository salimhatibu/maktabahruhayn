"use client"

import { Tag } from "@medusajs/icons"
import { Button, Input, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { ErrorNote, Field, PageHeader, Section } from "@/components/kit"
import { api, dateTime, money, useApi } from "@/lib/api"
import { storefrontBase } from "@/lib/media-src"

type Promotion = {
  id: string
  code: string
  description: string | null
  type: "percentage" | "fixed" | "free_shipping"
  value: number
  currency_code: string | null
  min_subtotal: number | null
  starts_at: string | null
  ends_at: string | null
  usage_limit: number | null
  used_count: number
  is_active: boolean
  automatic: boolean
}

type Form = {
  id: string | null
  automatic: boolean
  code: string
  description: string
  type: Promotion["type"]
  value: string
  currency_code: string
  min_subtotal: string
  starts_at: string
  ends_at: string
  usage_limit: string
  is_active: boolean
}

const EMPTY: Form = {
  id: null,
  automatic: false,
  code: "",
  description: "",
  type: "percentage",
  value: "10",
  currency_code: "kes",
  min_subtotal: "",
  starts_at: "",
  ends_at: "",
  usage_limit: "",
  is_active: true,
}

const selectClass =
  "bg-ui-bg-field border-ui-border-base text-ui-fg-base h-8 w-full rounded-md border px-2 text-sm shadow-borders-base"

const day = (value: string | null) => (value ? value.slice(0, 10) : "")

function state(p: Promotion): { label: string; color: "green" | "grey" | "orange" | "red" } {
  const now = new Date().toISOString()
  if (!p.is_active) return { label: "Paused", color: "grey" }
  if (p.usage_limit !== null && p.used_count >= p.usage_limit) return { label: "Used up", color: "red" }
  if (p.ends_at && p.ends_at < now) return { label: "Expired", color: "red" }
  if (p.starts_at && p.starts_at > now) return { label: "Scheduled", color: "orange" }
  return { label: "Live", color: "green" }
}

function describe(p: Promotion) {
  if (p.type === "percentage") return `${p.value}% off`
  if (p.type === "free_shipping") return "Free shipping"
  return `${money(p.value, p.currency_code || "usd")} off`
}

function period(p: Promotion) {
  if (!p.starts_at && !p.ends_at) return "Always"
  return `${p.starts_at ? dateTime(p.starts_at) : "Now"} to ${p.ends_at ? dateTime(p.ends_at) : "no end"}`
}

const PromotionsPage = () => {
  const { data, error, reload } = useApi<{ promotions: Promotion[] }>("/api/promotions")
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const set = (patch: Partial<Form>) => setForm((current) => (current ? { ...current, ...patch } : current))

  const edit = (p: Promotion) =>
    setForm({
      id: p.id,
      automatic: p.automatic,
      code: p.automatic ? "" : p.code,
      description: p.description || "",
      type: p.type,
      value: p.type === "free_shipping" ? "" : String(p.value),
      currency_code: p.currency_code || "kes",
      min_subtotal: p.min_subtotal ? String(p.min_subtotal) : "",
      starts_at: day(p.starts_at),
      ends_at: day(p.ends_at),
      usage_limit: p.usage_limit === null ? "" : String(p.usage_limit),
      is_active: p.is_active,
    })

  const save = async () => {
    if (!form) return
    setSaving(true)
    try {
      const body = {
        automatic: form.automatic,
        code: form.code,
        description: form.description,
        type: form.type,
        value: form.type === "free_shipping" ? 0 : Number(form.value),
        currency_code: form.type === "percentage" && !form.min_subtotal ? null : form.currency_code,
        min_subtotal: form.min_subtotal ? Number(form.min_subtotal) : null,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        is_active: form.is_active,
      }
      await api(form.id ? `/api/promotions/${form.id}` : "/api/promotions", {
        method: form.id ? "PUT" : "POST",
        json: body,
      })
      toast.success(form.id ? "Promotion saved" : "Promotion created")
      setForm(null)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (p: Promotion) => {
    setBusy(p.id)
    try {
      await api(`/api/promotions/${p.id}`, {
        method: "PUT",
        json: {
          automatic: p.automatic,
          code: p.code,
          description: p.description,
          type: p.type,
          value: p.value,
          currency_code: p.currency_code,
          min_subtotal: p.min_subtotal,
          starts_at: p.starts_at,
          ends_at: p.ends_at,
          usage_limit: p.usage_limit,
          is_active: !p.is_active,
        },
      })
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (p: Promotion) => {
    if (!window.confirm(`Delete ${p.automatic ? "this promotion" : p.code}? Orders that used it keep their discount.`)) return
    setBusy(p.id)
    try {
      await api(`/api/promotions/${p.id}`, { method: "DELETE" })
      toast.success("Promotion deleted")
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const link = (p: Promotion) => `${storefrontBase() || window.location.origin}/promo/${encodeURIComponent(p.code)}`

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`)
    } catch {
      toast.error("Could not copy. Select and copy it manually.")
    }
  }

  const promotions = data?.promotions || []

  return (
    <div>
      <PageHeader
        icon={Tag}
        tone="teal"
        title="Promotions"
        subtitle="Discount codes to share with customers, and time-limited offers that apply on their own."
      />
      <ErrorNote message={error} />

      {form ? (
        <Section title={form.id ? "Edit promotion" : "New promotion"}>
          <div className="grid gap-4 px-6 py-4 sm:grid-cols-2">
            <Field label="How customers get it" hint="A code is typed or shared as a link. An automatic offer applies to every qualifying cart.">
              <select
                className={selectClass}
                value={form.automatic ? "automatic" : "code"}
                onChange={(e) => set({ automatic: e.target.value === "automatic" })}
              >
                <option value="code">Discount code</option>
                <option value="automatic">Automatic (time period offer)</option>
              </select>
            </Field>
            {form.automatic ? (
              <Field label="Name" hint="Shown only to you and on the order.">
                <Input value={form.description} maxLength={120} onChange={(e) => set({ description: e.target.value })} />
              </Field>
            ) : (
              <Field label="Code" hint="Letters, numbers, dashes. Not case sensitive.">
                <Input value={form.code} maxLength={40} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
              </Field>
            )}
            <Field label="Discount">
              <select className={selectClass} value={form.type} onChange={(e) => set({ type: e.target.value as Form["type"] })}>
                <option value="percentage">Percentage off the books</option>
                <option value="fixed">Fixed amount off</option>
                <option value="free_shipping">Free shipping</option>
              </select>
            </Field>
            {form.type !== "free_shipping" ? (
              <Field label={form.type === "percentage" ? "Percent off" : "Amount off"}>
                <Input type="number" min={0} step={form.type === "percentage" ? 1 : 0.01} value={form.value} onChange={(e) => set({ value: e.target.value })} />
              </Field>
            ) : null}
            {form.type === "fixed" || form.min_subtotal ? (
              <Field label="Currency for amounts" hint="Converted for customers paying in another currency.">
                <select className={selectClass} value={form.currency_code} onChange={(e) => set({ currency_code: e.target.value })}>
                  <option value="kes">KES</option>
                  <option value="usd">USD</option>
                </select>
              </Field>
            ) : null}
            <Field label="Minimum spend (optional)">
              <Input type="number" min={0} value={form.min_subtotal} onChange={(e) => set({ min_subtotal: e.target.value })} />
            </Field>
            <Field label="Starts (optional)">
              <Input type="date" value={form.starts_at} onChange={(e) => set({ starts_at: e.target.value })} />
            </Field>
            <Field label="Ends (optional)" hint="Valid through the end of this day.">
              <Input type="date" value={form.ends_at} onChange={(e) => set({ ends_at: e.target.value })} />
            </Field>
            <Field label="Total uses allowed (optional)">
              <Input type="number" min={1} value={form.usage_limit} onChange={(e) => set({ usage_limit: e.target.value })} />
            </Field>
            {!form.automatic ? (
              <Field label="Description (optional)">
                <Input value={form.description} maxLength={120} onChange={(e) => set({ description: e.target.value })} />
              </Field>
            ) : null}
            <Field label="Active" plain>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
                Customers can use this now
              </label>
            </Field>
          </div>
          <div className="flex gap-2 px-6 pb-4">
            <Button size="small" isLoading={saving} onClick={save}>
              Save
            </Button>
            <Button size="small" variant="secondary" onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
        </Section>
      ) : null}

      <Section
        title="All promotions"
        flush
        actions={
          <Button size="small" onClick={() => setForm({ ...EMPTY })}>
            New promotion
          </Button>
        }
      >
        <div className="mr-scroll-x">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Promotion</Table.HeaderCell>
                <Table.HeaderCell>Discount</Table.HeaderCell>
                <Table.HeaderCell>Period</Table.HeaderCell>
                <Table.HeaderCell>Used</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {promotions.map((p) => {
                const s = state(p)
                return (
                  <Table.Row key={p.id}>
                    <Table.Cell>
                      <div className="font-medium">{p.automatic ? p.description || "Automatic offer" : p.code}</div>
                      <Text size="xsmall" className="text-ui-fg-muted">
                        {p.automatic ? "Applies automatically" : p.description || "Discount code"}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      {describe(p)}
                      {p.min_subtotal ? (
                        <Text size="xsmall" className="text-ui-fg-muted">
                          Over {money(p.min_subtotal, p.currency_code || "usd")}
                        </Text>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell>{period(p)}</Table.Cell>
                    <Table.Cell className="mr-tabular">
                      {p.used_count}
                      {p.usage_limit !== null ? ` / ${p.usage_limit}` : ""}
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={s.color}>{s.label}</StatusBadge>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap gap-2">
                        {!p.automatic ? (
                          <>
                            <Button size="small" variant="secondary" onClick={() => copy(p.code, "Code")}>
                              Copy code
                            </Button>
                            <Button size="small" variant="secondary" onClick={() => copy(link(p), "Link")}>
                              Copy link
                            </Button>
                          </>
                        ) : null}
                        <Button size="small" variant="secondary" onClick={() => edit(p)}>
                          Edit
                        </Button>
                        <Button size="small" variant="secondary" isLoading={busy === p.id} onClick={() => toggle(p)}>
                          {p.is_active ? "Pause" : "Resume"}
                        </Button>
                        <Button size="small" variant="danger" isLoading={busy === p.id} onClick={() => remove(p)}>
                          Delete
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        </div>
        {!promotions.length ? (
          <Text size="small" className="text-ui-fg-muted px-6 py-4">
            No promotions yet.
          </Text>
        ) : null}
      </Section>
    </div>
  )
}

export default PromotionsPage
