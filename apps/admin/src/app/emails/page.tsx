"use client"

import { Envelope, Trash } from "@medusajs/icons"
import { Button, Checkbox, Input, Select, StatusBadge, Switch, Table, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { ErrorNote, Field, PageHeader, Section } from "@/components/kit"
import { RichEditor } from "@/components/rich-editor"
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

type EmailRow = { id: string; to: string; template: string; subject: string | null; status: string; provider_id: string | null; created_at: string }

const STATUS_COLOR: Record<string, "green" | "orange" | "red" | "blue" | "grey"> = {
  sent: "blue",
  delivered: "green",
  opened: "green",
  clicked: "green",
  bounced: "orange",
  complained: "red",
  failed: "red",
}
const STATUS_LABEL: Record<string, string> = {
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  bounced: "Bounced",
  complained: "Complained",
  failed: "Failed",
}

type Audience = "all" | "subscribers"
type RecipientCounts = { subscribers: number; customers: number; all: number }

const BATCH_SIZE = 50

const EmailsPage = () => {
  const settings = useSettings<EmailSettings>("email")
  const log = useApi<{ smtp_configured: boolean; emails: EmailRow[] }>("/api/emails")
  const recipients = useApi<RecipientCounts>("/api/emails/recipients")
  const [form, setForm] = useState<EmailSettings | null>(null)
  const [selected, setSelected] = useState<TemplateKey>("order_placed")
  const [testTo, setTestTo] = useState("")
  const [testing, setTesting] = useState(false)
  const [logSelected, setLogSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [bulkSubject, setBulkSubject] = useState("")
  const [bulkBody, setBulkBody] = useState("")
  const [bulkAudience, setBulkAudience] = useState<Audience>("subscribers")
  const [bulkLimit, setBulkLimit] = useState(BATCH_SIZE)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState<{ sent: number; failed: number; total: number } | null>(null)
  useEffect(() => setForm(settings.value), [settings.value])

  const toggleAllLogs = () => {
    const emails = log.data?.emails || []
    if (logSelected.size === emails.length) {
      setLogSelected(new Set())
    } else {
      setLogSelected(new Set(emails.map((e) => e.id)))
    }
  }

  const toggleLog = (id: string) => {
    const next = new Set(logSelected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setLogSelected(next)
  }

  const deleteLogs = async () => {
    const ids = [...logSelected]
    if (!ids.length) return
    if (!window.confirm(`Delete ${ids.length} log entr${ids.length > 1 ? "ies" : "y"}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await api("/api/emails", { method: "DELETE", json: { ids } })
      toast.success(`Deleted ${ids.length} log entr${ids.length > 1 ? "ies" : "y"}`)
      setLogSelected(new Set())
      log.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const syncStatus = async () => {
    setSyncing(true)
    try {
      const res = await api<{ synced: number }>("/api/emails/sync", { method: "POST" })
      if (res.synced > 0) {
        toast.success(`Updated status of ${res.synced} email${res.synced > 1 ? "s" : ""}`)
        log.reload()
      } else {
        toast.info("All statuses are up to date")
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const audienceCount = bulkAudience === "all" ? (recipients.data?.all ?? 0) : (recipients.data?.subscribers ?? 0)

  const sendBulk = async () => {
    if (!bulkSubject.trim() || !bulkBody.trim()) {
      toast.error("Subject and message are required")
      return
    }
    const count = Math.min(bulkLimit, audienceCount)
    if (!window.confirm(`Send "${bulkSubject}" to ${count} ${bulkAudience === "all" ? "customers and subscribers" : "newsletter subscribers"}? This cannot be undone.`)) return
    setSending(true)
    setSendProgress({ sent: 0, failed: 0, total: 0 })
    let offset = 0
    let totalSent = 0
    let totalFailed = 0

    while (offset < bulkLimit) {
      try {
        const batchSize = Math.min(BATCH_SIZE, bulkLimit - offset)
        const res = await api<{ sent: number; failed: number; total: number; done: boolean }>("/api/emails/bulk", {
          method: "POST",
          json: {
            subject: bulkSubject,
            body: bulkBody,
            recipients: bulkAudience,
            limit: batchSize,
            offset,
          },
        })
        totalSent += res.sent
        totalFailed += res.failed
        setSendProgress({ sent: totalSent, failed: totalFailed, total: totalSent + totalFailed })
        offset += res.total
        if (res.done || res.total === 0) break
      } catch (e) {
        toast.error((e as Error).message)
        break
      }
    }

    setSending(false)
    toast.success(`Done: ${totalSent} sent, ${totalFailed} failed`)
    log.reload()
    recipients.reload()
  }

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
            <Field label="Message">
              <RichEditor value={template.body} onChange={(html) => setTemplate({ body: html })} placeholder="Write your email template..." />
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

      <Section title="Send to subscribers" description="Compose and send an email to your customers or newsletter subscribers in batches.">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Audience">
              <Select value={bulkAudience} onValueChange={(v) => setBulkAudience(v as Audience)}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="subscribers">Newsletter subscribers ({recipients.data?.subscribers ?? "…"})</Select.Item>
                  <Select.Item value="all">All customers + subscribers ({recipients.data?.all ?? "…"})</Select.Item>
                </Select.Content>
              </Select>
            </Field>
            <Field label="How many to send">
              <Select value={String(bulkLimit)} onValueChange={(v) => setBulkLimit(v === "all" ? audienceCount : Number(v))}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="50">First 50</Select.Item>
                  <Select.Item value="100">First 100</Select.Item>
                  <Select.Item value="150">First 150</Select.Item>
                  <Select.Item value="200">First 200</Select.Item>
                  <Select.Item value="all">All ({audienceCount})</Select.Item>
                </Select.Content>
              </Select>
            </Field>
          </div>
          <Field label="Subject">
            <Input value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)} placeholder="Your subject line" />
          </Field>
          <Field label="Message">
            <RichEditor value={bulkBody} onChange={setBulkBody} placeholder="Write your email here..." />
          </Field>
          <div className="flex items-center gap-3">
            <Button
              isLoading={sending}
              disabled={!bulkSubject.trim() || !bulkBody.trim() || !audienceCount}
              onClick={sendBulk}
            >
              Send {Math.min(bulkLimit, audienceCount)} email{Math.min(bulkLimit, audienceCount) !== 1 ? "s" : ""}
            </Button>
            {sendProgress ? (
              <Text size="small" className="text-ui-fg-subtle">
                {sendProgress.sent} sent{sendProgress.failed > 0 ? `, ${sendProgress.failed} failed` : ""} of {Math.min(bulkLimit, audienceCount)}
              </Text>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Email log" flush actions={
        <div className="flex items-center gap-2">
          {logSelected.size > 0 ? (
            <Button size="small" variant="secondary" isLoading={deleting} onClick={deleteLogs}>
              <Trash /> Delete {logSelected.size}
            </Button>
          ) : null}
          <Button size="small" variant="secondary" isLoading={syncing} onClick={syncStatus}>
            Sync status
          </Button>
        </div>
      }>
        <div className="mr-scroll-x">
            <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell className="w-8">
                <Checkbox checked={(log.data?.emails || []).length > 0 && logSelected.size === (log.data?.emails || []).length} onCheckedChange={toggleAllLogs} />
              </Table.HeaderCell>
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
                <Table.Cell>
                  <Checkbox checked={logSelected.has(e.id)} onCheckedChange={() => toggleLog(e.id)} />
                </Table.Cell>
                <Table.Cell>{dateTime(e.created_at)}</Table.Cell>
                <Table.Cell>{e.to}</Table.Cell>
                <Table.Cell>{LABELS[e.template as TemplateKey] || e.template}</Table.Cell>
                <Table.Cell>{e.subject}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={STATUS_COLOR[e.status] || "grey"}>
                    {STATUS_LABEL[e.status] || e.status}
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
