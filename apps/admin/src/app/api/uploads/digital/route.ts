import { NextResponse, type NextRequest } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { digitalType, randomKey } from "@/lib/upload-check"

type MediaBucket = {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string; contentDisposition?: string } }
  ): Promise<unknown>
}

const MAX_BYTES = 100 * 1024 * 1024

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
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "No file was uploaded." }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: `${file.name} is larger than 100 MB.` }, { status: 413 })
  }

  const type = digitalType(file.name)
  if (!type) {
    return NextResponse.json({ message: "Upload a PDF, EPUB, ZIP, MP3, M4A or MP4 file." }, { status: 415 })
  }
  // A random key, so a paid download cannot be found by guessing its name or
  // upload time; served as an attachment of a fixed type, never rendered.
  const key = randomKey("digital/", file.name)
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: type,
      contentDisposition: `attachment; filename="${file.name.replace(/[^a-zA-Z0-9.\-_ ]/g, "_").slice(-100)}"`,
    },
  })

  return NextResponse.json({ url: `${publicUrl}/${key}`, name: file.name, size: file.size })
}
