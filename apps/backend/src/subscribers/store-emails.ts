import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { formatAmount } from "../lib/email-render"
import { sendStoreEmailWorkflow } from "../workflows/send-store-email"

type OrderRow = {
  id: string
  display_id: number
  email: string
  total: number
  currency_code: string
  customer?: { first_name?: string | null } | null
  shipping_address?: { first_name?: string | null } | null
  items?: { product_title?: string | null; title: string; quantity: number; unit_price: number }[]
  fulfillments?: { id: string; labels?: { tracking_number?: string; tracking_url?: string }[] }[]
}

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "total",
  "currency_code",
  "customer.first_name",
  "shipping_address.first_name",
  "items.product_title",
  "items.title",
  "items.quantity",
  "items.unit_price",
  "fulfillments.id",
  "fulfillments.labels.*",
]

function orderVars(order: OrderRow, fulfillmentId?: string) {
  const label = order.fulfillments?.find((f) => !fulfillmentId || f.id === fulfillmentId)?.labels?.[0]
  return {
    customer: { first_name: order.customer?.first_name || order.shipping_address?.first_name || "" },
    order: {
      display_id: order.display_id,
      total: formatAmount(Number(order.total), order.currency_code),
      items: (order.items || [])
        .map((i) => `- ${i.product_title || i.title} x ${i.quantity}: ${formatAmount(Number(i.unit_price) * i.quantity, order.currency_code)}`)
        .join("\n"),
    },
    tracking: { number: label?.tracking_number || "", url: label?.tracking_url || "" },
  }
}

/**
 * Transactional emails: order placed, shipped and delivered, and the
 * welcome email for new customer accounts. Templates are edited in the
 * admin under Emails.
 */
export default async function storeEmails({ event, container }: SubscriberArgs<{ id: string; order_id?: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  try {
    if (event.name === "customer.created") {
      const { data } = await query.graph({
        entity: "customer",
        fields: ["email", "first_name", "has_account"],
        filters: { id: event.data.id },
      })
      const customer = data[0] as { email: string; first_name?: string; has_account?: boolean } | undefined
      if (customer?.has_account) {
        await sendStoreEmailWorkflow(container).run({
          input: { template: "customer_welcome", to: customer.email, vars: { customer } },
        })
      }
      return
    }

    let orderId = event.data.id
    let fulfillmentId: string | undefined
    if (event.name !== "order.placed") {
      // Shipment and delivery events carry the fulfillment id.
      fulfillmentId = event.data.id
      const { data } = await query.graph({
        entity: "fulfillment",
        fields: ["id", "order.id"],
        filters: { id: fulfillmentId },
      })
      orderId = (data[0] as { order?: { id: string } } | undefined)?.order?.id || ""
    }
    if (!orderId) {
      return
    }
    const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: orderId } })
    const order = data[0] as unknown as OrderRow | undefined
    if (!order?.email) {
      return
    }
    const template =
      event.name === "order.placed" ? "order_placed" : event.name === "shipment.created" ? "order_shipped" : "order_delivered"
    await sendStoreEmailWorkflow(container).run({
      input: { template, to: order.email, vars: orderVars(order, fulfillmentId) },
    })
  } catch (error) {
    logger.error(`Email for ${event.name} failed: ${String(error)}`)
  }
}

export const config: SubscriberConfig = {
  event: ["order.placed", "shipment.created", "delivery.created", "customer.created"],
}
