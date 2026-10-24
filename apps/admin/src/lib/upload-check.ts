/**
 * What an uploaded file really is, from its first bytes. The browser's
 * declared type is whatever the uploader says, so it is never trusted: an
 * "image/png" that is really HTML would otherwise be served from the media
 * bucket as a page.
 */
export function sniffImage(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif" | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png"
  if (ascii(0, 4) === "GIF8") return "image/gif"
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp"
  if (ascii(4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(8, 12))) return "image/avif"
  return null
}

/** Digital products customers download: documents, archives and audio. */
const DIGITAL: Record<string, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  zip: "application/zip",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
}

export function digitalType(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() || ""
  return DIGITAL[ext] || null
}

/** A key no one can guess from the file name or the upload time. */
export function randomKey(prefix: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9.\-_]/g, "-").slice(-80)
  return `${prefix}${crypto.randomUUID()}-${safe}`
}
