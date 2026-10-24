import { isHtml, sanitizeHtml } from "@maktabah/shared"

/**
 * Product descriptions arrive either as plain text (seeded or imported books)
 * or as HTML from the admin editor. The admin sanitises on save; this runs the
 * same allowlist again before rendering, so a row written any other way
 * (a CSV import, a direct SQL edit) still cannot carry script onto the page.
 */

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export { isHtml }

/** Safe HTML for rendering: sanitised editor HTML, or plain text turned into paragraphs. */
export function descriptionHtml(value: string): string {
  if (!isHtml(value)) {
    return value
      .split(/\n{2,}/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
      .join("")
  }
  return sanitizeHtml(value)
}

/** Plain text for meta descriptions, JSON-LD and card blurbs. */
export function plainText(value: string): string {
  if (!isHtml(value)) {
    return value.trim()
  }
  return value
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|h2|h3|li|blockquote|pre|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
}
