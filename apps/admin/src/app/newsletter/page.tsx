"use client"

import { Newspaper } from "@medusajs/icons"
import { Button, StatusBadge, Table, Text } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { ErrorNote, PageHeader, Section } from "@/components/kit"
import { dateTime, useApi } from "@/lib/api"
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
  const { data, error, loading } = useApi<{ subscribers: Subscriber[]; count: number }>("/api/newsletter?limit=500")
  const [q, setQ] = useState("")
  const rows = useMemo(
    () =>
      (data?.subscribers || []).filter((s) =>
        q ? [s.email, s.name, s.phone].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q.toLowerCase())) : true
      ),
    [data, q]
  )

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
          <Button size="small" variant="secondary" onClick={exportCsv} disabled={!rows.length}>
            Export CSV
          </Button>
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
