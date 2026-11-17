import { notifyOrder, type D1 } from "@maktabah/db"

export async function notifyConfirmedOrder(database: D1, orderId: string) {
  return notifyOrder(database, orderId, "order_placed", {
    endpoint: process.env.EMAIL_API_URL,
    token: process.env.EMAIL_API_KEY,
    from: process.env.SMTP_FROM,
    storeUrl: process.env.SITE_URL,
  })
}
