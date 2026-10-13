/**
 * Product descriptions arrive either as plain text (seeded or imported books)
 * or as HTML from the admin editor. The backend sanitises on save; this keeps
 * the same allowlist as a second line of defence before rendering.
 */

const TAGS = "p|br|h2|h3|strong|b|em|i|u|ul|ol|li|blockquote|a|code|pre|table|thead|tbody|tr|th|td"
const ALLOWED = new RegExp(`<\\/?(${TAGS})(\\s[^>]*)?>`, "gi")
const OTHER = new RegExp(`<(?!\\/?(${TAGS})\\b)[^>]*>`, "gi")
const LOOKS_LIKE_HTML = new RegExp(`<\\/?(${TAGS})\\b[^>]*>`, "i")

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function isHtml(value: string) {
  return LOOKS_LIKE_HTML.test(value)
}

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
  return value
    .replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, "")
    .replace(OTHER, "")
    .replace(ALLOWED, (tag) => {
      const name = tag.match(/^<\/?([a-z0-9]+)/i)?.[1]?.toLowerCase() || ""
      if (tag.startsWith("</")) {
        return `</${name}>`
      }
      if (name === "a") {
        const href = tag.match(/href\s*=\s*"([^"]*)"/i)?.[1] || ""
        if (!/^(https?:|mailto:|\/(?!\/))/i.test(href)) {
          return "<a>"
        }
        const external = /^https?:/i.test(href)
        return `<a href="${escapeHtml(href)}"${external ? ' rel="noopener noreferrer nofollow" target="_blank"' : ""}>`
      }
      return `<${name}>`
    })
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
