"use client"

import { Button, Input, StatusBadge, Switch, Table, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { api, useApi } from "@/lib/api"

type Row = {
  variant_id: string
  sku: string | null
  product_id: string
  product_title: string
  variant_title: string | null
  location_id: string | null
  location_name: string | null
  stocked_quantity: number
  reserved_quantity: number
  low_stock_threshold: number | null
}

/** Copies on hand per variant, editable in place. */
export function StockTable({ q }: { q: string }) {
  const router = useRouter()
  const [lowOnly, setLowOnly] = useState(false)
  const { data, error, loading, reload } = useApi<{ stock: Row[] }>(
    `/api/stock?q=${encodeURIComponent(q)}${lowOnly ? "&low=1" : ""}`
  )
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const save = async (row: Row) => {
    const value = Number(edits[row.variant_id])
    if (!row.location_id || !Number.isInteger(value) || value < 0) {
      toast.error("Enter a whole number of copies")
      return
    }
    setSaving(row.variant_id)
    try {
      await api("/api/stock", {
        method: "POST",
        json: { variant_id: row.variant_id, location_id: row.location_id, stocked_quantity: value },
      })
      toast.success(`${row.product_title}: ${value} on hand`)
      setEdits((e) => {
        const next = { ...e }
        delete next[row.variant_id]
        return next
      })
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  const rows = data?.stock || []

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Text size="small" className="text-ui-fg-subtle">
          Reserved copies belong to orders that have not shipped yet. Press Enter to save a row.
        </Text>
        <label className="flex items-center gap-2">
          <Switch size="small" checked={lowOnly} onCheckedChange={setLowOnly} />
          <Text size="small">Low stock only</Text>
        </label>
      </div>
      {error ? (
        <Text size="small" className="text-ui-fg-error px-6 pb-3">
          {error}
        </Text>
      ) : null}
      <div className="mr-scroll-x">
            <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Book</Table.HeaderCell>
            <Table.HeaderCell>SKU</Table.HeaderCell>
            <Table.HeaderCell className="text-right">Reserved</Table.HeaderCell>
            <Table.HeaderCell className="text-right">Available</Table.HeaderCell>
            <Table.HeaderCell className="w-44 text-right">On hand</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => {
            const available = row.stocked_quantity - row.reserved_quantity
            const edit = edits[row.variant_id]
            const changed = edit !== undefined && edit !== String(row.stocked_quantity)
            return (
              <Table.Row key={row.variant_id}>
                <Table.Cell>
                  <button
                    type="button"
                    className="txt-compact-small-plus text-ui-fg-base max-w-[26rem] truncate text-left hover:underline"
                    onClick={() => router.push(`/products/${row.product_id}`)}
                  >
                    {row.product_title}
                  </button>
                  {row.variant_title && row.variant_title !== "Default" ? (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {row.variant_title}
                    </Text>
                  ) : null}
                </Table.Cell>
                <Table.Cell className="text-ui-fg-subtle font-mono text-xs">{row.sku || "—"}</Table.Cell>
                <Table.Cell className="mr-tabular text-right">{row.reserved_quantity}</Table.Cell>
                <Table.Cell className="text-right">
                  <StatusBadge color={available <= 0 ? "red" : (row.low_stock_threshold !== null && available <= row.low_stock_threshold) ? "orange" : "green"}>
                    <span className="mr-tabular">{available}</span>
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  <form
                    className="flex items-center justify-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (changed) {
                        void save(row)
                      }
                    }}
                  >
                    <Input
                      size="small"
                      inputMode="numeric"
                      className="mr-tabular w-20 text-right"
                      value={edit ?? String(row.stocked_quantity)}
                      onChange={(e) => setEdits((s) => ({ ...s, [row.variant_id]: e.target.value.replace(/\D/g, "") }))}
                      aria-label={`Copies on hand for ${row.product_title}`}
                    />
                    <Button size="small" type="submit" variant={changed ? "primary" : "transparent"} disabled={!changed} isLoading={saving === row.variant_id}>
                      Save
                    </Button>
                  </form>
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table>
            </div>
      {!loading && !rows.length ? (
        <Text className="text-ui-fg-subtle px-6 py-10 text-center">
          {lowOnly ? "Nothing is running low." : "No tracked stock matches."}
        </Text>
      ) : null}
    </div>
  )
}
