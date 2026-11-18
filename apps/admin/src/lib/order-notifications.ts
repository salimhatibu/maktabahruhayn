import { getCloudflareContext } from "@opennextjs/cloudflare"
import { digitalFileKey } from "@maktabah/db"

export const orderNotificationConfig = () => ({
  endpoint: process.env.EMAIL_API_URL,
  token: process.env.EMAIL_API_KEY,
  from: process.env.SMTP_FROM,
  storeUrl: process.env.STOREFRONT_URL,
  async digitalFileAvailable(url: string) {
    const key = digitalFileKey(url, process.env.R2_PUBLIC_URL || "")
    if (!key) return false
    const { env } = await getCloudflareContext({ async: true })
    const bucket = (env as unknown as { MEDIA?: { head(key: string): Promise<unknown | null> } }).MEDIA
    if (!bucket) throw new Error("The MEDIA binding is not configured.")
    return (await bucket.head(key)) !== null
  },
})
