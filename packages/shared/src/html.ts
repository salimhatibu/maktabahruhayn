/**
 * Allowlist sanitiser for product descriptions written in the admin editor.
 *
 * It tokenises rather than pattern-matching whole tags, so an unclosed or
 * malformed tag cannot survive and swallow the next one: every `<` that does
 * not open a complete allowed tag is escaped as text. Allowed tags are
 * re-emitted with no attributes, except a checked `href` on links. Used when
 * a description is saved and again when it is rendered.
 */
const ALLOWED = new Set([
  "p", "br", "hr", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "ul", "ol", "li", "blockquote", "a", "code", "pre", "table", "thead", "tbody", "tr", "th", "td",
])
const VOID = new Set(["br", "hr"])

/** Elements whose content is never wanted as text either. */
const DROP_WITH_CONTENT =
  /<(script|style|iframe|object|embed|svg|math|template|noscript|textarea|title|xmp|noembed|noframes|select|option)\b[\s\S]*?(?:<\/\1\s*>|$)/gi

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^<>]*)>/g
const LOOKS_LIKE_HTML = /<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^<>]*)?>/

const ENTITY = /^&(?:#\d{1,7}|#x[0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/

function escapeText(text: string): string {
  let out = ""
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "<") out += "&lt;"
    else if (ch === ">") out += "&gt;"
    else if (ch === "&") out += ENTITY.test(text.slice(i, i + 40)) ? "&" : "&amp;"
    else out += ch
  }
  return out
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** http(s), mailto, or a same-site path. Anything else (javascript:, data:, //host, /\host) is dropped. */
export function safeHref(raw: string): string | null {
  const href = raw.replace(/[\u0000- \u007f]/g, "")
  if (/^https?:\/\/[^\s/\\]/i.test(href) || /^mailto:[^\s]+$/i.test(href)) {
    return href
  }
  if (/^\/(?![/\\])/.test(href) && !href.includes("\\")) {
    return href
  }
  return null
}

export function isHtml(value: string): boolean {
  return LOOKS_LIKE_HTML.test(value)
}

export function sanitizeHtml(input: string): string {
  const source = input.replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(DROP_WITH_CONTENT, "")
  const open: string[] = []
  let out = ""
  let last = 0

  for (const match of source.matchAll(TAG)) {
    out += escapeText(source.slice(last, match.index))
    last = (match.index ?? 0) + match[0].length

    const closing = match[1] === "/"
    const name = match[2].toLowerCase()
    if (!ALLOWED.has(name)) {
      continue
    }
    if (closing) {
      const at = open.lastIndexOf(name)
      if (at === -1) {
        continue
      }
      // Closing an outer tag closes everything opened inside it.
      while (open.length > at) {
        out += `</${open.pop()}>`
      }
      continue
    }
    if (VOID.has(name)) {
      out += `<${name}>`
      continue
    }
    if (name === "a") {
      const value = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(match[3])
      const href = value ? safeHref(value[1] ?? value[2] ?? value[3] ?? "") : null
      out += href
        ? `<a href="${escapeAttribute(href)}"${/^https?:/i.test(href) ? ' rel="noopener noreferrer nofollow" target="_blank"' : ""}>`
        : "<a>"
    } else {
      out += `<${name}>`
    }
    open.push(name)
  }
  out += escapeText(source.slice(last))
  while (open.length) {
    out += `</${open.pop()}>`
  }
  return out
}
