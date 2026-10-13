import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CreditCard } from "@medusajs/icons"
import { Button, Input, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { Link } from "react-router-dom"
import { ErrorNote, Field, PageHeader, Section, Segmented } from "../../components/kit"
import { api, dateTime, isoDay, money, useApi } from "../../lib/api"

type PaymentsData = {
  payments: { order_id: string; display_id: number; email: string; created_at: string; provider_id: string; amount: number; currency_code: string; captured: boolean; refunded: number }[]
  totals: { provider_id: string; currency_code: string; captured: number; pending: number; refunded: number; count: number }[]
  providers: { stripe: boolean; mpesa: boolean }
}

type PaymentRequest = {
  id: string
  phone: string
  amount: number
  reference: string
  status: "pending" | "paid" | "failed" | "cancelled"
  mpesa_receipt: string | null
  result_description: string | null
  created_at: string
}

const PROVIDERS: Record<string, string> = {
  pp_daraja_daraja: "M-Pesa",
  pp_stripe_stripe: "Card (Stripe)",
  pp_system_default: "Manual / Test",
}

const STATUS_COLOR = { pending: "orange", paid: "green", failed: "red", cancelled: "grey" } as const

const PaymentsPage = () => {
  const [range, setRange] = useState<"7" | "30" | "90" | "365">("30")
  const today = new Date()
  const from = isoDay(new Date(today.getTime() - (Number(range) - 1) * 86400000))
  const to = isoDay(today)
  const payments = useApi<PaymentsData>(`/admin/maktabah/payments?from=${from}&to=${to}`)
  const requests = useApi<{ requests: PaymentRequest[] }>("/admin/maktabah/payment-requests")
  const [form, setForm] = useState({ phone: "", amount: "", reference: "", description: "" })
  const [sending, setSending] = useState(false)

  const send = async () => {
    setSending(true)
    try {
      const { request } = await api<{ request: PaymentRequest }>("/admin/maktabah/payment-requests", {
        method: "POST",
        json: { ...form, amount: Number(form.amount), description: form.description || undefined },
      })
      if (request.status === "failed") {
        toast.error(request.result_description || "The request failed")
      } else {
        toast.success(`STK push sent to ${request.phone}`)
        setForm({ phone: "", amount: "", reference: "", description: "" })
      }
      requests.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <PageHeader icon={CreditCard} tone="green"
        title="Payments"
        subtitle="Payments across orders, plus M-Pesa requests for phone and WhatsApp orders."
        actions={
          <Segmented
            options={[
              { value: "7", label: "7D" },
              { value: "30", label: "30D" },
              { value: "90", label: "90D" },
              { value: "365", label: "12M" },
            ]}
            value={range}
            onChange={setRange}
          />
        }
      />
      <ErrorNote message={payments.error} />

      <Section
        title="Payment methods"
        description="Authorized card and test payments are captured from the order page when you fulfil the order."
        flush
        actions={
          <div className="flex flex-wrap gap-4">
            <StatusBadge color={payments.data?.providers.mpesa ? "green" : "orange"}>
              M-Pesa {payments.data?.providers.mpesa ? "connected" : "not connected"}
            </StatusBadge>
            <StatusBadge color={payments.data?.providers.stripe ? "green" : "orange"}>
              Stripe {payments.data?.providers.stripe ? "connected" : "not connected"}
            </StatusBadge>
          </div>
        }
      >
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Method</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Payments</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Captured</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Authorized</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Refunded</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(payments.data?.totals || []).map((t) => (
              <Table.Row key={`${t.provider_id}-${t.currency_code}`}>
                <Table.Cell>{PROVIDERS[t.provider_id] || t.provider_id}</Table.Cell>
                <Table.Cell className="text-right mr-tabular">{t.count}</Table.Cell>
                <Table.Cell className="text-right mr-tabular">{money(t.captured, t.currency_code)}</Table.Cell>
                <Table.Cell className="text-right mr-tabular">{money(t.pending, t.currency_code)}</Table.Cell>
                <Table.Cell className="text-right mr-tabular">{money(t.refunded, t.currency_code)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Section>

      <Section title="M-Pesa STK Push" description="Send a payment prompt to a customer's phone (Kenya, KES).">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="Phone">
            <Input placeholder="07XX XXX XXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Amount (KES)">
            <Input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Account reference" hint="Up to 12 characters, e.g. an order number">
            <Input maxLength={12} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Field label="Description (optional)">
            <Input maxLength={100} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button isLoading={sending} disabled={!form.phone || !form.amount || !form.reference} onClick={send}>
            Send STK Push
          </Button>
        </div>
      </Section>

      <Section
        title="Recent M-Pesa requests"
        flush
        actions={
          <Button size="small" variant="transparent" onClick={requests.reload}>
            Refresh
          </Button>
        }
      >
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Sent</Table.HeaderCell>
              <Table.HeaderCell>Phone</Table.HeaderCell>
              <Table.HeaderCell>Reference</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Receipt / note</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Amount</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(requests.data?.requests || []).map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>{dateTime(r.created_at)}</Table.Cell>
                <Table.Cell>{r.phone}</Table.Cell>
                <Table.Cell>{r.reference}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={STATUS_COLOR[r.status]}>{r.status[0].toUpperCase() + r.status.slice(1)}</StatusBadge>
                </Table.Cell>
                <Table.Cell className="text-ui-fg-subtle max-w-[320px] truncate">{r.mpesa_receipt || r.result_description}</Table.Cell>
                <Table.Cell className="text-right mr-tabular">{money(r.amount, "kes")}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        {!requests.data?.requests.length ? (
          <Text size="small" className="text-ui-fg-muted px-6 py-4">
            No requests yet.
          </Text>
        ) : null}
      </Section>

      <Section title="Order payments" flush>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Method</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Amount</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(payments.data?.payments || []).map((p, i) => (
              <Table.Row key={`${p.order_id}-${i}`}>
                <Table.Cell>
                  <Link to={`/orders/${p.order_id}`}>#{p.display_id}</Link>
                </Table.Cell>
                <Table.Cell>{dateTime(p.created_at)}</Table.Cell>
                <Table.Cell>{p.email}</Table.Cell>
                <Table.Cell>{PROVIDERS[p.provider_id] || p.provider_id}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={p.refunded ? "grey" : p.captured ? "green" : "blue"}>
                    {p.refunded ? "Refunded" : p.captured ? "Captured" : "Authorized"}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell className="text-right mr-tabular">{money(p.amount, p.currency_code)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Section>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Payments", icon: CreditCard, rank: 4 })

export default PaymentsPage
