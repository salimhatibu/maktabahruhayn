import { getCloudflareContext } from "@opennextjs/cloudflare"
import { digitalFileKey } from "@maktabah/db"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

type MediaBucket = {
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array>
    httpMetadata?: { contentType?: string }
  } | null>
}

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string; itemId: string }> }) {
  const { orderId, itemId } = await params
  const row = await (await db()).prepare(
    `SELECT p.digital_file_url FROM "order" o
     JOIN order_item oi ON oi.order_id = o.id
     JOIN variant v ON v.id = oi.variant_id
     JOIN product p ON p.id = v.product_id
     WHERE o.id = ?1 AND oi.id = ?2 AND o.payment_status = 'captured'
       AND o.status != 'cancelled' AND p.delivery_type = 'digital'`
  ).bind(orderId, itemId).first<{ digital_file_url: string | null }>()

  if (!row?.digital_file_url) return new Response("Digital file not found.", { status: 404 })
  const publicUrl = process.env.R2_PUBLIC_URL
  if (!publicUrl) return new Response("Digital file storage is not configured.", { status: 503 })

  const key = digitalFileKey(row.digital_file_url, publicUrl)
  if (!key) return new Response("Digital file is not available.", { status: 404 })
  const { env } = await getCloudflareContext({ async: true })
  const bucket = (env as unknown as { MEDIA?: MediaBucket }).MEDIA
  if (!bucket) return new Response("Digital file storage is not configured.", { status: 503 })
  const file = await bucket.get(key)
  if (!file) return new Response("Digital file not found.", { status: 404 })
  return new Response(file.body, {
    headers: {
      "Content-Type": file.httpMetadata?.contentType || "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  })
}
