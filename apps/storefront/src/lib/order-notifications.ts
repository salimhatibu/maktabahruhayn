import { getCloudflareContext } from "@opennextjs/cloudflare"
import { digitalFileKey, notifyOrder, type D1 } from "@maktabah/db"

export async function notifyConfirmedOrder(database: D1, orderId: string) {
  const config = {
    endpoint: process.env.EMAIL_API_URL,
    token: process.env.EMAIL_API_KEY,
    from: process.env.SMTP_FROM,
    storeUrl: process.env.SITE_URL,
    async digitalFileAvailable(url: string) {
      const key = digitalFileKey(url, process.env.R2_PUBLIC_URL || "")
      if (!key) return false
      const { env } = await getCloudflareContext({ async: true })
      const bucket = (env as unknown as { MEDIA?: { head(key: string): Promise<unknown | null> } }).MEDIA
      if (!bucket) throw new Error("The MEDIA binding is not configured.")
      return (await bucket.head(key)) !== null
    },
  }
  const notification = await notifyOrder(database, orderId, "order_placed", config)
  const digital = await notifyOrder(database, orderId, "digital_delivery", config)
  if (!digital.ok) console.error(`Digital delivery for order ${orderId} failed: ${digital.error}`)
  return notification
}
