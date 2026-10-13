import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShoppingCart } from "@medusajs/icons"
import { Button, Select, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useState } from "react"
import { Link } from "react-router-dom"
import { ErrorNote, PageHeader, Section } from "../../components/kit"
import { api, dateTime, money, useApi } from "../../lib/api"

type Cart = {
  id: string
  email: string | null
  currency_code: string
  updated_at: string
  item_total: number
  items: { title: string; quantity: number }[]
  customer_name: string | null
  reminder_sent_at: string | null
}

const AbandonedCartsPage = () => {
  const [hours, setHours] = useState("1")
  const { data, error, reload } = useApi<{ carts: Cart[] }>(`/admin/maktabah/abandoned-carts?hours=${hours}`)
  const [busy, setBusy] = useState<string | null>(null)

  const remind = async (cart: Cart) => {
    setBusy(cart.id)
    try {
      await api(`/admin/maktabah/abandoned-carts/${cart.id}/remind`, { method: "POST" })
      toast.success(`Reminder sent to ${cart.email}`)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader icon={ShoppingCart} tone="rose"
        title="Abandoned Carts"
        subtitle="Shoppers who added books but did not check out. Email them a reminder, or turn on automatic reminders under Emails."
        actions={<Link to="/emails"><Button variant="secondary" size="small">Reminder settings</Button></Link>}
      />
      <ErrorNote message={error} />
      <Section
        title={`${data?.carts.length ?? 0} carts`}
        flush
        actions={
          <div className="w-48">
            <Select value={hours} onValueChange={setHours}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="1">Idle 1 hour+</Select.Item>
                <Select.Item value="24">Idle 1 day+</Select.Item>
                <Select.Item value="72">Idle 3 days+</Select.Item>
              </Select.Content>
            </Select>
          </div>
        }
      >
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Books</Table.HeaderCell>
              <Table.HeaderCell>Last active</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Value</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(data?.carts || []).map((cart) => (
              <Table.Row key={cart.id}>
                <Table.Cell>
                  <Text size="small" weight="plus">{cart.customer_name || cart.email || "Guest (no email)"}</Text>
                  {cart.customer_name && cart.email ? <Text size="xsmall" className="text-ui-fg-subtle">{cart.email}</Text> : null}
                </Table.Cell>
                <Table.Cell>
                  {cart.items.map((i) => (
                    <Text size="xsmall" key={i.title}>
                      {i.title} × {i.quantity}
                    </Text>
                  ))}
                </Table.Cell>
                <Table.Cell>{dateTime(cart.updated_at)}</Table.Cell>
                <Table.Cell className="text-right mr-tabular">{money(cart.item_total, cart.currency_code)}</Table.Cell>
                <Table.Cell>
                  {cart.reminder_sent_at ? (
                    <StatusBadge color="green">Reminded {dateTime(cart.reminder_sent_at)}</StatusBadge>
                  ) : cart.email ? (
                    <Button size="small" variant="secondary" isLoading={busy === cart.id} onClick={() => remind(cart)}>
                      Send reminder
                    </Button>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Section>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Abandoned Carts", icon: ShoppingCart, rank: 3 })

export default AbandonedCartsPage
