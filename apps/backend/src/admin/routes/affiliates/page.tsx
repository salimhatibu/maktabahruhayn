import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Link as LinkIcon } from "@medusajs/icons"
import { Badge, Button, Input, Switch, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useState } from "react"
import { ErrorNote, Field, PageHeader, Section } from "../../components/kit"
import { api, money, useApi } from "../../lib/api"

type Affiliate = {
  id: string
  code: string
  name: string
  email: string | null
  phone: string | null
  commission_percent: number
  active: boolean
  orders: number
  sales: number
  commission: number
}

const AffiliatesPage = () => {
  const { data, error, reload } = useApi<{ currency: string; storefront_url: string; affiliates: Affiliate[] }>("/admin/maktabah/affiliates")
  const [form, setForm] = useState({ name: "", code: "", email: "", phone: "", commission_percent: "10" })
  const [saving, setSaving] = useState(false)
  const c = data?.currency || "kes"
  const prompt = usePrompt()

  const create = async () => {
    setSaving(true)
    try {
      await api("/admin/maktabah/affiliates", {
        method: "POST",
        json: {
          name: form.name,
          code: form.code,
          email: form.email || null,
          phone: form.phone || null,
          commission_percent: Number(form.commission_percent),
        },
      })
      toast.success("Affiliate added")
      setForm({ name: "", code: "", email: "", phone: "", commission_percent: "10" })
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const update = async (a: Affiliate, patch: Partial<Affiliate>) => {
    try {
      await api(`/admin/maktabah/affiliates/${a.id}`, { method: "POST", json: patch })
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const copyLink = async (a: Affiliate) => {
    const link = `${data?.storefront_url || ""}/?ref=${a.code}`
    await navigator.clipboard.writeText(link).catch(() => undefined)
    toast.success(`Copied ${link}`)
  }

  return (
    <div>
      <PageHeader icon={LinkIcon} tone="rose" title="Affiliates" subtitle="Partners (mosques, teachers, influencers) who earn commission on orders from their link." />
      <ErrorNote message={error} />
      <Section title="Add an affiliate">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Code" hint="Used in the link: ?ref=CODE">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Phone / WhatsApp">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Commission %">
            <Input type="number" min={0} max={100} value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button isLoading={saving} disabled={!form.name || form.code.length < 3} onClick={create}>
            Add affiliate
          </Button>
        </div>
      </Section>

      <Section title="Affiliates" description="Orders and commission over the last 12 months." flush>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Affiliate</Table.HeaderCell>
              <Table.HeaderCell>Code</Table.HeaderCell>
              <Table.HeaderCell>Rate</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Orders</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Sales</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Commission</Table.HeaderCell>
              <Table.HeaderCell>Active</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(data?.affiliates || []).map((a) => (
              <Table.Row key={a.id}>
                <Table.Cell>
                  <Text size="small" weight="plus">{a.name}</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">{[a.email, a.phone].filter(Boolean).join(" · ")}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge>{a.code}</Badge>
                </Table.Cell>
                <Table.Cell>{a.commission_percent}%</Table.Cell>
                <Table.Cell className="text-right mr-tabular">{a.orders}</Table.Cell>
                <Table.Cell className="text-right mr-tabular">{money(a.sales, c)}</Table.Cell>
                <Table.Cell className="text-right mr-tabular">{money(a.commission, c)}</Table.Cell>
                <Table.Cell>
                  <Switch checked={a.active} onCheckedChange={(v) => update(a, { active: v })} />
                </Table.Cell>
                <Table.Cell>
                  <div className="flex gap-2">
                    <Button size="small" variant="secondary" onClick={() => copyLink(a)}>
                      Copy link
                    </Button>
                    <Button
                      size="small"
                      variant="danger"
                      onClick={async () => {
                        const ok = await prompt({
                          title: `Delete ${a.name}?`,
                          description: "Their link stops earning commission. Past orders keep their affiliate code.",
                          confirmText: "Delete",
                          cancelText: "Cancel",
                        })
                        if (ok) {
                          await api(`/admin/maktabah/affiliates/${a.id}`, { method: "DELETE" })
                          reload()
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Section>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Affiliates", icon: LinkIcon, rank: 7 })

export default AffiliatesPage
