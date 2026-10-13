import { Badge, Button, Input, StatusBadge, Switch, Table, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, useApi } from "../../lib/api"

type Row = {
  inventory_item_id: string
  sku: string | null
  title: string
  product_id: string | null
  variant_title: string | null
  location_id: string | null
  stocked: number
  reserved: number
  available: number
  allow_backorder: boolean
}

/** Copies on hand per variant, editable in place. */
export function StockTable({ q }: { q: string }) {
  const navigate = useNavigate()
  const [lowOnly, setLowOnly] = useState(false)
  const { data, error, loading, reload } = useApi<{ rows: Row[] }>(
    `/admin/maktabah/stock?q=${encodeURIComponent(q)}${lowOnly ? "&max=5" : ""}`
  )
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const save = async (row: Row) => {
    const value = Number(edits[row.inventory_item_id])
    if (!row.location_id || !Number.isInteger(value) || value < 0) {
      toast.error("Enter a whole number of copies")
      return
    }
    setSaving(row.inventory_item_id)
    try {
      await api("/admin/maktabah/stock", {
        method: "POST",
        json: { inventory_item_id: row.inventory_item_id, location_id: row.location_id, stocked_quantity: value },
      })
      toast.success(`${row.title}: ${value} on hand`)
      setEdits((e) => {
        const next = { ...e }
        delete next[row.inventory_item_id]
        return next
      })
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  const rows = data?.rows || []

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Text size="small" className="text-ui-fg-subtle">
          Reserved copies belong to orders that have not shipped yet. Press Enter to save a row.
        </Text>
        <label className="flex items-center gap-2">
          <Switch size="small" checked={lowOnly} onCheckedChange={setLowOnly} />
          <Text size="small">5 or fewer available</Text>
        </label>
      </div>
      {error ? (
        <Text size="small" className="text-ui-fg-error px-6 pb-3">
          {error}
        </Text>
      ) : null}
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
            const edit = edits[row.inventory_item_id]
            const changed = edit !== undefined && edit !== String(row.stocked)
            return (
              <Table.Row key={row.inventory_item_id}>
                <Table.Cell>
                  <button
                    type="button"
                    className="txt-compact-small-plus text-ui-fg-base max-w-[26rem] truncate text-left hover:underline"
                    onClick={() => row.product_id && navigate(`/products/catalog/${row.product_id}`)}
                  >
                    {row.title}
                  </button>
                  {row.variant_title && row.variant_title !== "Default" ? (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {row.variant_title}
                    </Text>
                  ) : null}
                  {row.allow_backorder ? (
                    <Badge size="2xsmall" className="mt-0.5">
                      Backorders allowed
                    </Badge>
                  ) : null}
                </Table.Cell>
                <Table.Cell className="text-ui-fg-subtle font-mono text-xs">{row.sku || "—"}</Table.Cell>
                <Table.Cell className="mr-tabular text-right">{row.reserved}</Table.Cell>
                <Table.Cell className="text-right">
                  <StatusBadge color={row.available <= 0 ? "red" : row.available <= 5 ? "orange" : "green"}>
                    <span className="mr-tabular">{row.available}</span>
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
                      value={edit ?? String(row.stocked)}
                      onChange={(e) => setEdits((s) => ({ ...s, [row.inventory_item_id]: e.target.value.replace(/\D/g, "") }))}
                      aria-label={`Copies on hand for ${row.title}`}
                    />
                    <Button size="small" type="submit" variant={changed ? "primary" : "transparent"} disabled={!changed} isLoading={saving === row.inventory_item_id}>
                      Save
                    </Button>
                  </form>
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table>
      {!loading && !rows.length ? (
        <Text className="text-ui-fg-subtle px-6 py-10 text-center">
          {lowOnly ? "Nothing is running low." : "No tracked stock matches."}
        </Text>
      ) : null}
    </div>
  )
}
