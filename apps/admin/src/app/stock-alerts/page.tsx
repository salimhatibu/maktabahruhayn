"use client"

import { BellAlert } from "@medusajs/icons"
import { Container, StatusBadge, Table, Text } from "@medusajs/ui"
import { Suspense } from "react"
import { IconChip } from "@/components/kit"
import { dateTime, useApi } from "@/lib/api"

type Alert = {
  id: string
  email: string
  status: string
  created_at: string
  notified_at: string | null
  product_title: string | null
  product_handle: string | null
  variant_title: string | null
}

function StockAlertsPage() {
  const { data, error, loading } = useApi<{ alerts: Alert[]; count: number }>("/api/stock-alerts")
  const alerts = data?.alerts || []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3.5">
        <IconChip icon={BellAlert} tone="gold" />
        <div>
          <h1 className="txt-large-plus">Stock Alerts</h1>
          <Text size="small" className="text-ui-fg-subtle mt-0.5">
            Customers waiting for out-of-stock items to come back.
          </Text>
        </div>
      </div>

      {error ? (
        <Container className="px-6 py-3">
          <Text size="small" className="text-ui-fg-error">{error}</Text>
        </Container>
      ) : null}

      <Container className="divide-y p-0">
        <div className="px-6 py-3">
          <Text size="small" className="text-ui-fg-subtle">
            {data?.count ?? 0} alert{data?.count === 1 ? "" : "s"}
          </Text>
        </div>

        {loading && !alerts.length ? (
          <Text size="small" className="text-ui-fg-subtle px-6 py-8">Loading…</Text>
        ) : alerts.length ? (
          <div className="mr-scroll-x">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Product</Table.HeaderCell>
                  <Table.HeaderCell>Variant</Table.HeaderCell>
                  <Table.HeaderCell>Email</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Requested</Table.HeaderCell>
                  <Table.HeaderCell>Notified</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {alerts.map((alert) => (
                  <Table.Row key={alert.id}>
                    <Table.Cell>
                      <span className="txt-compact-small-plus">{alert.product_title || "—"}</span>
                    </Table.Cell>
                    <Table.Cell>{alert.variant_title || "—"}</Table.Cell>
                    <Table.Cell>{alert.email}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={alert.status === "waiting" ? "orange" : alert.status === "notified" ? "green" : "grey"}>
                        {alert.status}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>{dateTime(alert.created_at)}</Table.Cell>
                    <Table.Cell>{alert.notified_at ? dateTime(alert.notified_at) : "—"}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        ) : (
          <Text size="small" className="text-ui-fg-subtle px-6 py-10 text-center">
            No stock alerts yet.
          </Text>
        )}
      </Container>
    </div>
  )
}

export default function StockAlerts() {
  return (
    <Suspense fallback={null}>
      <StockAlertsPage />
    </Suspense>
  )
}
