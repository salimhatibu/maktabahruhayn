"use client"

import { ArrowDownTray, Newspaper } from "@medusajs/icons"
import { Button, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useRef, useMemo, useState } from "react"
import { ErrorNote, PageHeader, Section } from "@/components/kit"
import { api, dateTime, useApi } from "@/lib/api"
import { csvCell } from "@/lib/csv"

type Subscriber = {
  id: string
  email: string
  name: string | null
  phone: string | null
  status: string
  source: string | null
  country_code: string | null
  created_at: string
}

const SOURCES: Record<string, string> = { popup: "Pop-up", footer: "Footer", register: "Sign-up", checkout: "Checkout" }

const NewsletterPage = () => {
  const { data, error, loading, reload } = useApi<{ subscribers: Subscriber[]; count: number }>("/api/newsletter?limit=500")
  const [q, setQ] = useState("")
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const rows = useMemo(
    () =>
      (data?.subscribers || []).filter((s) =>
        q ? [s.email, s.name, s.phone].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q.toLowerCase())) : true
      ),
    [data, q]
  )

  const importCsv = async (file: File) => {
    setImporting(true)
    try {
      const text = await file.text()
      const res = await api<{ imported: number; skipped: number }>("/api/newsletter", { method: "POST", body: text, headers: { "Content-Type": "text/plain" } })
      toast.success(`Imported ${res.imported} subscribers (${res.skipped} duplicates skipped)`)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const exportCsv = () => {
    const lines = [
      ["Name", "Email", "Phone", "Status", "Source", "Country", "Joined"].join(","),
      ...rows.map((s) =>
        [s.name || "", s.email, s.phone || "", s.status, s.source || "", (s.country_code || "").toUpperCase(), s.created_at.slice(0, 10)]
          .map(csvCell)
          .join(",")
      ),
    ]
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `newsletter-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader icon={Newspaper} tone="rose"
        title="Newsletter"
        subtitle={`${data?.count ?? "…"} subscribers from the sign-up pop-up, footer and account forms.`}
        actions={
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
            <Button size="small" variant="secondary" isLoading={importing} onClick={() => fileRef.current?.click()}>
              <ArrowDownTray /> Import CSV
            </Button>
            <Button size="small" variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              Export CSV
            </Button>
          </div>
        }
      />
      <ErrorNote message={error} />
      <Section
        title="Subscribers"
        flush
        actions={
          <input
            type="search"
            placeholder="Search name, email or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="bg-ui-bg-field shadow-borders-base txt-compact-small placeholder:text-ui-fg-muted h-8 w-full rounded-md sm:w-64 px-2.5 outline-none"
          />
        }
      >
        <div className="mr-scroll-x">
            <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Subscriber</Table.HeaderCell>
              <Table.HeaderCell>Phone</Table.HeaderCell>
              <Table.HeaderCell>Source</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Joined</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((s) => (
              <Table.Row key={s.id}>
                <Table.Cell>
                  <Text size="small" weight="plus">
                    {s.name || "—"}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {s.email}
                  </Text>
                </Table.Cell>
                <Table.Cell className="mr-tabular">{s.phone || "—"}</Table.Cell>
                <Table.Cell className="text-ui-fg-subtle">
                  {SOURCES[s.source || ""] || s.source || "—"}
                  {s.country_code ? ` · ${s.country_code.toUpperCase()}` : ""}
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge color={s.status === "subscribed" ? "green" : "grey"}>
                    {s.status === "subscribed" ? "Subscribed" : "Unsubscribed"}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell className="text-ui-fg-subtle whitespace-nowrap">{dateTime(s.created_at)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
            </div>
        {!loading && !rows.length ? <Text className="text-ui-fg-subtle px-6 py-10 text-center">No subscribers yet.</Text> : null}
      </Section>
    </div>
  )
}


export default NewsletterPage
