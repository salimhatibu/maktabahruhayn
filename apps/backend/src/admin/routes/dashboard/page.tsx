import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArchiveBox,
  ChartBar,
  ChevronRightMini,
  CreditCard,
  Envelope,
  ExclamationCircle,
  ShoppingCart,
} from "@medusajs/icons"
import { Button, Container, DropdownMenu, Heading, IconButton, Table, Tabs, Text } from "@medusajs/ui"
import { useEffect, useMemo, useState, type ComponentType } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  BarList,
  ErrorNote,
  FulfilmentStatus,
  KpiStrip,
  LineChart,
  PageHeader,
  PaymentStatus,
  Section,
  Segmented,
} from "../../components/kit"
import { api, isoDay, money, useApi } from "../../lib/api"

type Dashboard = {
  currency: string
  kpis: {
    gmv: { value: number; change: number | null }
    revenue: { value: number; change: number | null }
    orders: { value: number; change: number | null }
    average_order: { value: number; change: number | null }
    products: { value: number; new_in_period: number }
    active_customers: { value: number; change: number | null; accounts: number }
    abandoned_carts: { value: number; potential: number }
  }
  series: { date: string; orders: number; gmv: number }[]
  channels: { name: string; orders: number; value: number }[]
  regions: { name: string; orders: number; value: number }[]
  payments: { name: string; count: number; value: number }[]
  top_books: { product_id: string; title: string; thumbnail: string | null; quantity: number; value: number }[]
  recent_orders: {
    id: string
    display_id: number
    created_at: string
    email: string
    total: number
    currency_code: string
    payment_status: string
    fulfillment_status: string
  }[]
  low_stock: { inventory_item_id: string; title: string; sku: string | null; available: number; product_id: string | null }[]
  action_items: {
    orders_to_fulfil: number
    payments_to_capture: number
    out_of_stock: number
    low_stock: number
    carts_to_remind: number
  }
}

type Range = "7" | "30" | "90" | "365"

const RANGES: { value: Range; label: string }[] = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
  { value: "365", label: "12M" },
]

function greeting(name?: string | null) {
  const h = new Date().getHours()
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
  return name ? `${part}, ${name}` : part
}

function shortMoney(n: number, currency: string) {
  const abs = Math.abs(n)
  const code = currency.toUpperCase()
  if (abs >= 1_000_000) return `${code} ${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${code} ${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return `${code} ${Math.round(n)}`
}

function dayLabel(iso: string, span: number) {
  const d = new Date(`${iso}T00:00:00`)
  return span > 90
    ? d.toLocaleDateString("en", { month: "short" })
    : d.toLocaleDateString("en", { day: "numeric", month: "short" })
}

function AttentionRow({
  icon: Icon,
  count,
  label,
  to,
  tone,
}: {
  icon: ComponentType
  count: number
  label: string
  to: string
  tone: "orange" | "red" | "blue"
}) {
  const tones = {
    orange: "bg-ui-tag-orange-bg text-ui-tag-orange-icon",
    red: "bg-ui-tag-red-bg text-ui-tag-red-icon",
    blue: "bg-ui-tag-blue-bg text-ui-tag-blue-icon",
  }
  return (
    <Link to={to} className="hover:bg-ui-bg-base-hover group flex items-center gap-3 px-6 py-3 transition-colors">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${tones[tone]}`}>
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <Text size="small" weight="plus" className="mr-tabular">
          {count} {label}
        </Text>
      </div>
      <ChevronRightMini className="text-ui-fg-muted group-hover:text-ui-fg-subtle" />
    </Link>
  )
}

const DashboardPage = () => {
  const navigate = useNavigate()
  const [range, setRange] = useState<Range>("30")
  const [metric, setMetric] = useState<"gmv" | "orders">("gmv")
  const [name, setName] = useState<string | null>(null)

  const { from, to } = useMemo(() => {
    const end = new Date()
    return { from: isoDay(new Date(end.getTime() - (Number(range) - 1) * 86400000)), to: isoDay(end) }
  }, [range])

  const { data, error, loading } = useApi<Dashboard>(`/admin/maktabah/dashboard?from=${from}&to=${to}`)
  const c = data?.currency || "kes"
  const span = Number(range)

  useEffect(() => {
    api<{ user: { first_name: string | null } }>("/admin/users/me")
      .then((r) => setName(r.user.first_name))
      .catch(() => undefined)
  }, [])

  const series = data?.series || []
  // Long ranges read better as weekly points.
  const points = useMemo(() => {
    const bucket = span > 90 ? 7 : 1
    const out: { label: string; value: number }[] = []
    for (let i = 0; i < series.length; i += bucket) {
      const slice = series.slice(i, i + bucket)
      out.push({
        label: dayLabel(slice[0].date, span),
        value: slice.reduce((n, d) => n + (metric === "gmv" ? d.gmv : d.orders), 0),
      })
    }
    return out
  }, [series, metric, span])

  const total = metric === "gmv" ? data?.kpis.gmv.value ?? 0 : data?.kpis.orders.value ?? 0
  const attention = data?.action_items
  const attentionCount = attention
    ? attention.orders_to_fulfil + attention.payments_to_capture + attention.out_of_stock + attention.low_stock + attention.carts_to_remind
    : 0

  return (
    <div className="flex flex-col gap-y-1">
      <PageHeader icon={ChartBar} tone="green"
        title={greeting(name)}
        subtitle={`Store performance for the last ${range === "365" ? "12 months" : `${range} days`}. All amounts in ${c.toUpperCase()}.`}
        actions={
          <>
            <Segmented options={RANGES} value={range} onChange={setRange} />
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <Button size="small" variant="secondary">
                  Quick actions
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item onClick={() => navigate("/products/catalog/new")}>Add product</DropdownMenu.Item>
                <DropdownMenu.Item onClick={() => navigate("/draft-orders/create")}>Create order</DropdownMenu.Item>
                <DropdownMenu.Item onClick={() => navigate("/payments")}>Request M-Pesa payment</DropdownMenu.Item>
                <DropdownMenu.Item onClick={() => navigate("/promotions/create")}>Create promotion</DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onClick={() => navigate("/storefront")}>Edit storefront</DropdownMenu.Item>
                <DropdownMenu.Item onClick={() => navigate("/appearance")}>Theme</DropdownMenu.Item>
                <DropdownMenu.Item onClick={() => navigate("/settings/roles")}>Roles &amp; permissions</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </>
        }
      />
      <ErrorNote message={error} />

      <KpiStrip
        items={[
          {
            label: "Total sales",
            tone: "green",
            value: data ? money(data.kpis.gmv.value, c) : "—",
            change: data?.kpis.gmv.change,
            trend: series.map((d) => d.gmv),
          },
          {
            label: "Orders",
            tone: "gold",
            value: data ? String(data.kpis.orders.value) : "—",
            change: data?.kpis.orders.change,
            trend: series.map((d) => d.orders),
          },
          {
            label: "Average order value",
            tone: "teal",
            value: data ? money(data.kpis.average_order.value, c) : "—",
            change: data?.kpis.average_order.change,
          },
          {
            label: "Customers",
            tone: "plum",
            value: data ? String(data.kpis.active_customers.value) : "—",
            change: data?.kpis.active_customers.change,
            hint: data ? `${data.kpis.active_customers.accounts} registered accounts` : undefined,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Container className="divide-y p-0 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
            <div>
              <Text size="small" className="text-ui-fg-subtle">
                {metric === "gmv" ? "Sales" : "Orders"} over time
              </Text>
              <Heading level="h2" className="mr-tabular mt-0.5">
                {metric === "gmv" ? money(total, c) : `${total} orders`}
              </Heading>
            </div>
            <Segmented
              options={[
                { value: "gmv", label: "Sales" },
                { value: "orders", label: "Orders" },
              ]}
              value={metric}
              onChange={setMetric}
            />
          </div>
          <div className="px-4 pb-3 pt-4">
            {loading && !data ? (
              <div className="bg-ui-bg-component h-64 animate-pulse rounded-md" />
            ) : (
              <LineChart
                tone={metric === "gmv" ? "green" : "gold"}
                data={points}
                format={(n) => (metric === "gmv" ? money(n, c) : `${n} order${n === 1 ? "" : "s"}`)}
                axisFormat={(n) => (metric === "gmv" ? shortMoney(n, c).replace(`${c.toUpperCase()} `, "") : String(Math.round(n)))}
              />
            )}
          </div>
        </Container>

        <Container className="flex flex-col divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <Heading level="h2">Needs attention</Heading>
            {attentionCount ? (
              <span className="txt-compact-xsmall-plus bg-ui-tag-orange-bg text-ui-tag-orange-text rounded-full px-2 py-0.5 mr-tabular">
                {attentionCount}
              </span>
            ) : null}
          </div>
          {attention && attentionCount ? (
            <div className="divide-y">
              {attention.orders_to_fulfil ? (
                <AttentionRow icon={ShoppingCart} count={attention.orders_to_fulfil} label={`order${attention.orders_to_fulfil === 1 ? "" : "s"} to fulfil`} to="/orders" tone="orange" />
              ) : null}
              {attention.payments_to_capture ? (
                <AttentionRow icon={CreditCard} count={attention.payments_to_capture} label={`payment${attention.payments_to_capture === 1 ? "" : "s"} to capture`} to="/payments" tone="blue" />
              ) : null}
              {attention.out_of_stock ? (
                <AttentionRow icon={ExclamationCircle} count={attention.out_of_stock} label={`book${attention.out_of_stock === 1 ? "" : "s"} out of stock`} to="/products/catalog?view=stock" tone="red" />
              ) : null}
              {attention.low_stock ? (
                <AttentionRow icon={ArchiveBox} count={attention.low_stock} label={`book${attention.low_stock === 1 ? "" : "s"} running low`} to="/products/catalog?view=stock" tone="orange" />
              ) : null}
              {attention.carts_to_remind ? (
                <AttentionRow icon={Envelope} count={attention.carts_to_remind} label={`abandoned cart${attention.carts_to_remind === 1 ? "" : "s"} to follow up`} to="/abandoned-carts" tone="blue" />
              ) : null}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-10 text-center">
              <Text size="small" weight="plus">
                You&apos;re all caught up
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                No orders, payments or stock need action.
              </Text>
            </div>
          )}
          {data ? (
            <div className="mt-auto grid grid-cols-2 divide-x">
              <div className="px-6 py-3">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Captured revenue
                </Text>
                <Text size="small" weight="plus" className="mr-tabular">
                  {money(data.kpis.revenue.value, c)}
                </Text>
              </div>
              <div className="px-6 py-3">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Left in carts
                </Text>
                <Text size="small" weight="plus" className="mr-tabular">
                  {money(data.kpis.abandoned_carts.potential, c)}
                </Text>
              </div>
            </div>
          ) : null}
        </Container>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Section title="Top books" description="By copies sold" flush>
          {data?.top_books.length ? (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Book</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Sold</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Sales</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.top_books.map((b) => (
                  <Table.Row
                    key={b.product_id || b.title}
                    className={b.product_id ? "cursor-pointer" : undefined}
                    onClick={() => b.product_id && navigate(`/products/catalog/${b.product_id}`)}
                  >
                    <Table.Cell>
                      <div className="flex items-center gap-3">
                        <div className="bg-ui-bg-component h-10 w-7 shrink-0 overflow-hidden rounded-sm">
                          {b.thumbnail ? <img src={b.thumbnail} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <span className="truncate">{b.title}</span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-right mr-tabular">{b.quantity}</Table.Cell>
                    <Table.Cell className="text-right mr-tabular">{money(b.value, c)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          ) : (
            <Text size="small" className="text-ui-fg-muted px-6 py-6">
              No sales in this period yet.
            </Text>
          )}
        </Section>

        <Section title="Sales breakdown">
          <Tabs defaultValue="channel">
            <Tabs.List>
              <Tabs.Trigger value="channel">Channel</Tabs.Trigger>
              <Tabs.Trigger value="payment">Payment</Tabs.Trigger>
              <Tabs.Trigger value="region">Region</Tabs.Trigger>
            </Tabs.List>
            <div className="pt-4">
              <Tabs.Content value="channel">
                <BarList tone="teal" items={(data?.channels || []).map((x) => ({ label: x.name, value: x.value, hint: `${x.orders} order${x.orders === 1 ? "" : "s"}` }))} format={(n) => money(n, c)} />
              </Tabs.Content>
              <Tabs.Content value="payment">
                <BarList tone="green" items={(data?.payments || []).map((x) => ({ label: x.name, value: x.value, hint: `${x.count} payment${x.count === 1 ? "" : "s"}` }))} format={(n) => money(n, c)} />
              </Tabs.Content>
              <Tabs.Content value="region">
                <BarList tone="plum" items={(data?.regions || []).map((x) => ({ label: x.name, value: x.value, hint: `${x.orders} order${x.orders === 1 ? "" : "s"}` }))} format={(n) => money(n, c)} />
              </Tabs.Content>
            </div>
          </Tabs>
        </Section>
      </div>

      <Section
        title="Recent orders"
        flush
        actions={
          <Link to="/orders">
            <Button size="small" variant="transparent">
              View all
            </Button>
          </Link>
        }
      >
        {data?.recent_orders.length ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Order</Table.HeaderCell>
                <Table.HeaderCell>Date</Table.HeaderCell>
                <Table.HeaderCell>Customer</Table.HeaderCell>
                <Table.HeaderCell>Payment</Table.HeaderCell>
                <Table.HeaderCell>Fulfilment</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Total</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.recent_orders.map((o) => (
                <Table.Row key={o.id} className="cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)}>
                  <Table.Cell className="mr-tabular">#{o.display_id}</Table.Cell>
                  <Table.Cell>{new Date(o.created_at).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}</Table.Cell>
                  <Table.Cell className="max-w-[220px] truncate">{o.email}</Table.Cell>
                  <Table.Cell>
                    <PaymentStatus status={o.payment_status} />
                  </Table.Cell>
                  <Table.Cell>
                    <FulfilmentStatus status={o.fulfillment_status} />
                  </Table.Cell>
                  <Table.Cell className="text-right mr-tabular">{money(o.total, o.currency_code)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <Text size="small" className="text-ui-fg-muted px-6 py-6">
            No orders in this period.
          </Text>
        )}
      </Section>

      {data?.low_stock.length ? (
        <Section
          title="Low stock"
          flush
          actions={
            <Link to="/products/catalog?view=stock">
              <IconButton size="small" variant="transparent" aria-label="Manage stock">
                <ChevronRightMini />
              </IconButton>
            </Link>
          }
        >
          <Table>
            <Table.Body>
              {data.low_stock.map((s) => (
                <Table.Row key={s.inventory_item_id}>
                  <Table.Cell>{s.title}</Table.Cell>
                  <Table.Cell className="text-ui-fg-subtle mr-tabular">{s.sku}</Table.Cell>
                  <Table.Cell className="text-right mr-tabular">
                    <span className={s.available <= 0 ? "text-ui-fg-error" : "text-ui-tag-orange-text"}>{s.available} available</span>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Section>
      ) : null}
    </div>
  )
}

export const config = defineRouteConfig({ label: "Dashboard", icon: ChartBar, rank: 0 })

export default DashboardPage
