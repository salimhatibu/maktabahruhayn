"use client"

import { Envelope } from "@medusajs/icons"
import { Button, Input, Select, StatusBadge, Switch, Table, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { ErrorNote, Field, PageHeader, Section } from "@/components/kit"
import { api, dateTime, useApi, useSettings } from "@/lib/api"

type TemplateKey = "order_placed" | "order_shipped" | "order_delivered" | "customer_welcome" | "abandoned_cart" | "newsletter_welcome"
type Template = { subject: string; body: string; enabled: boolean }
type EmailSettings = {
  fromName: string
  replyTo: string
  abandonedCartAfterHours: number
  abandonedCartAuto: boolean
  templates: Record<TemplateKey, Template>
}

const LABELS: Record<TemplateKey, string> = {
  order_placed: "Order confirmation",
  order_shipped: "Order shipped",
  order_delivered: "Order delivered",
  customer_welcome: "Welcome (new account)",
  abandoned_cart: "Abandoned cart reminder",
  newsletter_welcome: "Newsletter welcome",
}

const VARIABLES = "{{customer.first_name}} {{order.display_id}} {{order.items}} {{order.total}} {{tracking.number}} {{tracking.url}} {{cart.items}} {{store.name}} {{store.url}}"

const EmailsPage = () => {
  const settings = useSettings<EmailSettings>("email")
  const log = useApi<{ smtp_configured: boolean; emails: { id: string; to: string; template: string; subject: string | null; status: string; created_at: string }[] }>(
    "/api/emails"
  )
  const [form, setForm] = useState<EmailSettings | null>(null)
  const [selected, setSelected] = useState<TemplateKey>("order_placed")
  const [testTo, setTestTo] = useState("")
  const [testing, setTesting] = useState(false)
  useEffect(() => setForm(settings.value), [settings.value])

  const template = form?.templates[selected]
  const setTemplate = (patch: Partial<Template>) =>
    form && setForm({ ...form, templates: { ...form.templates, [selected]: { ...form.templates[selected], ...patch } } })

  const save = async () => {
    if (!form) return
    try {
      await settings.save({ ...form, abandonedCartAfterHours: Number(form.abandonedCartAfterHours) })
      toast.success("Email settings saved")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const sendTest = async () => {
    if (!template) return
    setTesting(true)
    try {
      await api("/api/emails/test", {
        method: "POST",
        json: { template: selected, to: testTo, subject: template.subject, body: template.body },
      })
      toast.success(log.data?.smtp_configured ? `Test sent to ${testTo}` : "Logged (SMTP is not configured)")
      log.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <PageHeader icon={Envelope} tone="rose" title="Emails" subtitle="Transactional emails, reminders and the outgoing email log." actions={<Button isLoading={settings.saving} onClick={save}>Save changes</Button>} />
      <ErrorNote message={settings.error || log.error} />

      <Section title="Sending">
        <StatusBadge color={log.data?.smtp_configured ? "green" : "orange"}>
          {log.data?.smtp_configured ? "SMTP connected: emails are delivered" : "SMTP not connected: emails are logged, not delivered (set SMTP_* in the backend .env)"}
        </StatusBadge>
        {form ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="From name">
              <Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
            </Field>
            <Field label="Reply-to address" hint="Defaults to the business email">
              <Input type="email" value={form.replyTo} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} />
            </Field>
            <label className="flex items-center gap-3">
              <Switch checked={form.abandonedCartAuto} onCheckedChange={(v) => setForm({ ...form, abandonedCartAuto: v })} />
              <Text size="small">Send abandoned cart reminders automatically (once per cart)</Text>
            </label>
            <Field label="Remind after (hours idle)">
              <Input type="number" min={1} value={form.abandonedCartAfterHours} onChange={(e) => setForm({ ...form, abandonedCartAfterHours: Number(e.target.value) })} />
            </Field>
          </div>
        ) : null}
      </Section>

      <Section
        title="Templates"
        description={`Variables: ${VARIABLES}`}
        actions={
          <div className="w-full sm:w-64">
            <Select value={selected} onValueChange={(v) => setSelected(v as TemplateKey)}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {(Object.keys(LABELS) as TemplateKey[]).map((k) => (
                  <Select.Item key={k} value={k}>
                    {LABELS[k]}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        }
      >
        {template ? (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-3">
              <Switch checked={template.enabled} onCheckedChange={(v) => setTemplate({ enabled: v })} />
              <Text size="small">Send this email</Text>
            </label>
            <Field label="Subject">
              <Input value={template.subject} onChange={(e) => setTemplate({ subject: e.target.value })} />
            </Field>
            <Field label="Message" hint="Plain text; blank lines become paragraphs and links are clickable.">
              <Textarea rows={12} value={template.body} onChange={(e) => setTemplate({ body: e.target.value })} />
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Send a test to">
                <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
              </Field>
              <Button variant="secondary" isLoading={testing} disabled={!testTo} onClick={sendTest}>
                Send test (sample data)
              </Button>
            </div>
          </div>
        ) : null}
      </Section>

      <Section title="Email log" flush actions={<Button size="small" variant="transparent" onClick={log.reload}>Refresh</Button>}>
        <div className="mr-scroll-x">
            <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Sent</Table.HeaderCell>
              <Table.HeaderCell>To</Table.HeaderCell>
              <Table.HeaderCell>Email</Table.HeaderCell>
              <Table.HeaderCell>Subject</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(log.data?.emails || []).map((e) => (
              <Table.Row key={e.id}>
                <Table.Cell>{dateTime(e.created_at)}</Table.Cell>
                <Table.Cell>{e.to}</Table.Cell>
                <Table.Cell>{LABELS[e.template as TemplateKey] || e.template}</Table.Cell>
                <Table.Cell>{e.subject}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={e.status === "success" ? "green" : e.status === "failure" ? "red" : "orange"}>
                    {e.status === "success" ? "Sent" : e.status === "failure" ? "Failed" : "Pending"}
                  </StatusBadge>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
            </div>
      </Section>
    </div>
  )
}


export default EmailsPage
