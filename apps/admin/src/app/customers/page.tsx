"use client"

import { ArrowDownTray, ArrowUpTray, PencilSquare, Plus, Trash, Users, XMark } from "@medusajs/icons"
import { Button, Checkbox, Container, Input, Label, Table, Text, toast } from "@medusajs/ui"
import { Suspense, useEffect, useRef, useState } from "react"
import { IconChip } from "@/components/kit"
import { api, dateTime, money, useApi } from "@/lib/api"
import { csvRow } from "@/lib/csv"

type Customer = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  created_at: string
  orders: number
  spent: number
  addresses: number
}

const CSV_HEADER = "email,first_name,last_name,phone"
const CSV_TEMPLATE = `${CSV_HEADER}\njohn@example.com,John,Doe,+254700000000\n`

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

function splitCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      values.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  values.push(current.trim())
  return values
}

function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "")
  const lines = clean.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []

  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
  const firstCols = splitCsvLine(lines[0])
  const firstVal = firstCols[0].toLowerCase().replace(/[^a-z_]/g, "")
  const hasHeader = firstVal === "email" || firstVal === "name" || firstVal === "first_name"

  if (hasHeader) {
    if (lines.length < 2) return []
    const headers = firstCols.map((h) => h.toLowerCase().replace(/[^a-z_]/g, ""))
    return lines.slice(1).map((line) => {
      const values = splitCsvLine(line)
      const row: Record<string, string> = {}
      headers.forEach((h, i) => {
        row[h] = (values[i] || "").replace(/^'(?=[=+\-@\t\r])/, "")
      })
      return row
    }).filter((r) => r.email)
  }

  return lines
    .map((line) => {
      const cols = splitCsvLine(line)
      const email = cols.find((c) => emailRe.test(c.trim()))
      return email ? { email: email.trim() } as Record<string, string> : null
    })
    .filter((r): r is Record<string, string> => r !== null)
}

type EditForm = {
  email: string
  first_name: string
  last_name: string
  phone: string
}

function EditModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<EditForm>({
    email: customer.email,
    first_name: customer.first_name || "",
    last_name: customer.last_name || "",
    phone: customer.phone || "",
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.email.trim()) {
      toast.error("Email is required")
      return
    }
    setSaving(true)
    try {
      await api(`/api/customers/${customer.id}`, {
        method: "PUT",
        json: {
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
        },
      })
      toast.success("Customer updated")
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-ui-bg-base shadow-elevation-modal w-full max-w-md rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <Text size="large" weight="plus">Edit Customer</Text>
          <button onClick={onClose} className="text-ui-fg-subtle hover:text-ui-fg-base">
            <XMark />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          <div>
            <Label size="xsmall" weight="plus">Email</Label>
            <Input
              size="small"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label size="xsmall" weight="plus">First Name</Label>
              <Input
                size="small"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div>
              <Label size="xsmall" weight="plus">Last Name</Label>
              <Input
                size="small"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label size="xsmall" weight="plus">Phone</Label>
            <Input
              size="small"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <Button size="small" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="small" onClick={handleSave} isLoading={saving}>Save</Button>
        </div>
      </div>
    </div>
  )
}

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<EditForm>({ email: "", first_name: "", last_name: "", phone: "" })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const email = form.email.trim()
    if (!email) {
      toast.error("Email is required")
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Enter a valid email address")
      return
    }
    setSaving(true)
    try {
      const res = await api<{ imported: number; skipped: number }>("/api/customers", {
        method: "POST",
        json: {
          customers: [{
            email,
            first_name: form.first_name,
            last_name: form.last_name,
            phone: form.phone,
          }],
        },
      })
      if (res.skipped > 0) {
        toast.error("A customer with this email already exists")
      } else {
        toast.success("Customer added")
        onSaved()
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-ui-bg-base shadow-elevation-modal w-full max-w-md rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <Text size="large" weight="plus">Add Customer</Text>
          <button onClick={onClose} className="text-ui-fg-subtle hover:text-ui-fg-base">
            <XMark />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          <div>
            <Label size="xsmall" weight="plus">Email *</Label>
            <Input
              size="small"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="customer@example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label size="xsmall" weight="plus">First Name</Label>
              <Input
                size="small"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div>
              <Label size="xsmall" weight="plus">Last Name</Label>
              <Input
                size="small"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label size="xsmall" weight="plus">Phone</Label>
            <Input
              size="small"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+254700000000"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <Button size="small" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="small" onClick={handleSave} isLoading={saving}>Add Customer</Button>
        </div>
      </div>
    </div>
  )
}

function CustomersPage() {
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [adding, setAdding] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(timer)
  }, [q])

  const { data, error, loading, reload } = useApi<{ customers: Customer[]; count: number }>(
    `/api/customers?q=${encodeURIComponent(debounced)}`
  )
  const customers = data?.customers || []

  const allSelected = customers.length > 0 && customers.every((c) => selected.has(c.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(customers.map((c) => c.id)))
    }
  }

  const toggleOne = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleDeleteOne = async (customer: Customer) => {
    const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.email
    if (!confirm(`Delete customer "${name}"? This cannot be undone.`)) return
    try {
      await api(`/api/customers/${customer.id}`, { method: "DELETE" })
      toast.success("Customer deleted")
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(customer.id)
        return next
      })
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} customer(s)? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api("/api/customers", { method: "DELETE", json: { ids } })
      toast.success(`Deleted ${ids.length} customer(s)`)
      setSelected(new Set())
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const handleDownloadTemplate = () => {
    downloadCsv(CSV_TEMPLATE, "customers-template.csv")
    toast.success("Template downloaded")
  }

  const handleExport = () => {
    if (!customers.length) {
      toast.warning("No customers to export")
      return
    }
    const rows = customers.map((c) =>
      csvRow([c.email, c.first_name || "", c.last_name || "", c.phone || ""])
    )
    downloadCsv([CSV_HEADER, ...rows].join("\n"), "customers-export.csv")
    toast.success(`Exported ${customers.length} customers`)
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (!rows.length) {
        toast.error("No data rows found in CSV")
        return
      }
      const missing = rows.filter((r) => !r.email)
      if (missing.length) {
        toast.error(`${missing.length} row(s) missing an email address`)
        return
      }
      const result = await api<{ imported: number; skipped: number }>("/api/customers", {
        method: "POST",
        json: { customers: rows },
      })
      toast.success(`Imported ${result.imported} customers (${result.skipped} skipped as duplicates)`)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3.5">
        <IconChip icon={Users} tone="plum" />
        <div>
          <h1 className="txt-large-plus">Customers</h1>
          <Text size="small" className="text-ui-fg-subtle mt-0.5">
            Everyone with an account, and what they have spent.
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
          <div className="flex items-center gap-2">
            <Text size="small" className="text-ui-fg-subtle">
              {data?.count ?? 0} {data?.count === 1 ? "customer" : "customers"}
            </Text>
            {selected.size > 0 && (
              <Button
                size="small"
                variant="danger"
                onClick={handleBulkDelete}
                isLoading={deleting}
              >
                <Trash />
                Delete {selected.size} selected
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="small" variant="transparent" onClick={handleDownloadTemplate}>
              <ArrowDownTray />
              CSV Template
            </Button>
            <Button size="small" variant="transparent" onClick={handleExport} disabled={!customers.length}>
              <ArrowDownTray />
              Export
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              isLoading={importing}
            >
              <ArrowUpTray />
              Import CSV
            </Button>
            <Button size="small" onClick={() => setAdding(true)}>
              <Plus />
              Add Customer
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleImport(file)
                e.target.value = ""
              }}
            />
            <Input
              size="small"
              placeholder="Name or email"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              className="w-full sm:w-48"
            />
          </div>
        </div>

        {loading && !customers.length ? (
          <Text size="small" className="text-ui-fg-subtle px-6 py-8">
            Loading customers…
          </Text>
        ) : customers.length ? (
          <div className="mr-scroll-x">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </Table.HeaderCell>
                  <Table.HeaderCell>Customer</Table.HeaderCell>
                  <Table.HeaderCell>Phone</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Orders</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Spent</Table.HeaderCell>
                  <Table.HeaderCell>Joined</Table.HeaderCell>
                  <Table.HeaderCell className="w-24">Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {customers.map((customer) => (
                  <Table.Row key={customer.id}>
                    <Table.Cell>
                      <Checkbox
                        checked={selected.has(customer.id)}
                        onCheckedChange={() => toggleOne(customer.id)}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <span className="txt-compact-small-plus">
                        {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"}
                      </span>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {customer.email}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{customer.phone || "—"}</Table.Cell>
                    <Table.Cell className="text-right">{customer.orders}</Table.Cell>
                    <Table.Cell className="text-right">{money(customer.spent, "kes")}</Table.Cell>
                    <Table.Cell>{dateTime(customer.created_at)}</Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditing(customer)}
                          className="text-ui-fg-subtle hover:text-ui-fg-base rounded p-1"
                          title="Edit"
                        >
                          <PencilSquare className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteOne(customer)}
                          className="text-ui-fg-subtle hover:text-ui-tag-red-text rounded p-1"
                          title="Delete"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        ) : (
          <Text size="small" className="text-ui-fg-subtle px-6 py-10 text-center">
            No customers yet.
          </Text>
        )}
      </Container>

      {editing && (
        <EditModal
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}

      {adding && (
        <AddModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

export default function Customers() {
  return (
    <Suspense fallback={null}>
      <CustomersPage />
    </Suspense>
  )
}
