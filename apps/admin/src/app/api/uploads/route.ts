import { NextResponse, type NextRequest } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { randomKey, sniffImage } from "@/lib/upload-check"

/**
 * POST /api/uploads — stores uploaded images in R2 and returns their URLs.
 *
 * The previous admin posted to Medusa's /admin/uploads, which wrote to the
 * server's disk. A Worker has no disk, so media goes to the bucket and is
 * served from its public URL.
 */
/** The slice of R2 this route uses, so no Workers type package is needed. */
type MediaBucket = {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
}

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true })
  const bucket = (env as unknown as { MEDIA?: MediaBucket }).MEDIA
  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "")
  if (!bucket || !publicUrl) {
    return NextResponse.json(
      { message: "Media storage is not configured. Add the MEDIA bucket and R2_PUBLIC_URL." },
      { status: 503 }
    )
  }

  const form = await request.formData()
  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File)
  if (!files.length) {
    return NextResponse.json({ message: "No files were uploaded." }, { status: 400 })
  }

  const uploaded: { url: string }[] = []
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ message: `${file.name} is larger than 10MB.` }, { status: 413 })
    }
    // The bytes decide, not the declared type. SVG is refused: it can carry script.
    const body = await file.arrayBuffer()
    const type = sniffImage(new Uint8Array(body.slice(0, 16)))
    if (!type) {
      return NextResponse.json(
        { message: `${file.name} is not a JPEG, PNG, GIF, WebP or AVIF image.` },
        { status: 415 }
      )
    }
    const key = randomKey("", file.name)
    await bucket.put(key, body, { httpMetadata: { contentType: type } })
    uploaded.push({ url: `${publicUrl}/${key}` })
  }

  return NextResponse.json({ files: uploaded })
}
