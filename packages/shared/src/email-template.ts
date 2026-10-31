/**
 * Wraps editor HTML in an email shell.
 *
 * Mail clients drop <style> blocks and most CSS, so every rule has to ride on
 * the element as a style attribute and the layout has to be tables. The shape
 * and the type scale follow the broadcast design: one 600px column, a system
 * font stack, and a small footer carrying the unsubscribe link.
 */

/** Our defaults go first so any style the writer set wins the cascade. */
const TAG_STYLES: Record<string, string> = {
  h1: "margin:0;padding:0;padding-top:0.389em;font-size:2.25em;line-height:1.44em;font-weight:600",
  h2: "margin:0;padding:0;padding-top:0.389em;font-size:1.8em;line-height:1.44em;font-weight:600",
  h3: "margin:0;padding:0;padding-top:0.389em;font-size:1.4em;line-height:1.44em;font-weight:600",
  h4: "margin:0;padding:0;padding-top:0.389em;font-size:1.15em;line-height:1.44em;font-weight:600",
  p: "margin:0;padding:0;padding-top:0.5em;padding-bottom:0.5em;font-size:1em",
  a: "color:#0670DB;text-decoration:underline",
  img: "display:block;outline:none;border:none;text-decoration:none;max-width:100%;height:auto;border-radius:8px",
  ul: "margin:0;padding-top:0.5em;padding-bottom:0.5em;padding-left:1.5em",
  ol: "margin:0;padding-top:0.5em;padding-bottom:0.5em;padding-left:1.5em",
  li: "padding-top:0.15em;padding-bottom:0.15em;font-size:1em",
  blockquote: "margin:0.5em 0;padding-left:1em;border-left:3px solid #dcdcdc;color:#555555",
  hr: "border:none;border-top:1px solid #e5e5e5;margin-top:1em;margin-bottom:1em",
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif"

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Puts each tag's base declarations on the element itself. */
export function inlineEmailStyles(html: string): string {
  let out = html
  for (const [tag, base] of Object.entries(TAG_STYLES)) {
    // Opening tag only, with or without attributes, never the closing one.
    const open = new RegExp(`<${tag}(\\s[^>]*)?>`, "gi")
    out = out.replace(open, (match, attrs: string | undefined) => {
      const rest = attrs || ""
      const existing = /style\s*=\s*"([^"]*)"/i.exec(rest)
      if (existing) {
        const merged = `${base};${existing[1]}`
        return `<${tag}${rest.replace(existing[0], `style="${merged}"`)}>`
      }
      return `<${tag}${rest} style="${base}">`
    })
  }
  // A link opened in the inbox should not navigate inside the client.
  return out.replace(/<a(\s[^>]*)?>/gi, (match, attrs: string | undefined) => {
    const rest = attrs || ""
    if (/target\s*=/i.test(rest)) return match
    return `<a${rest} target="_blank" rel="noopener noreferrer">`
  })
}

export type EmailShell = {
  bodyHtml: string
  storeName: string
  storeUrl?: string
  /** Omitted for transactional mail, which carries no unsubscribe link. */
  unsubscribeUrl?: string
  /** Shown above the unsubscribe line, e.g. "Nairobi • Kenya". */
  address?: string
  preheader?: string
}

export function renderEmailHtml({
  bodyHtml,
  storeName,
  storeUrl,
  unsubscribeUrl,
  address,
  preheader,
}: EmailShell): string {
  const year = new Date().getUTCFullYear()
  const body = inlineEmailStyles(bodyHtml)
  const footerBits: string[] = []
  if (address) footerBits.push(escapeAttr(address))
  const legal = `© ${year} ${escapeAttr(storeName)}`
  const unsub = unsubscribeUrl
    ? `<a href="${escapeAttr(unsubscribeUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0670DB;text-decoration:underline">Unsubscribe</a> • ${legal}`
    : legal

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en"><head>
<meta content="width=device-width" name="viewport"/>
<meta content="text/html; charset=UTF-8" http-equiv="Content-Type"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection"/>
</head>
<body dir="ltr" lang="en" style="margin:0;padding:0;background-color:#ffffff">
${preheader ? `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${escapeAttr(preheader)}</div>` : ""}
<table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center"><tbody><tr>
<td style="font-family:${FONT};font-size:1em;line-height:155%;color:#000000">
<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;line-height:155%">
<tbody><tr style="width:100%"><td style="padding:24px 16px">
${body}
<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-size:0.8em;margin-top:1.5em"><tbody><tr><td>
<p style="margin:0;padding:0;padding-top:0.5em;padding-bottom:0.5em;font-size:1em;color:#666666">
${footerBits.length ? `${footerBits.join(" • ")}<br/>` : ""}${unsub}
</p>
${storeUrl ? `<p style="margin:0;padding:0;font-size:1em"><a href="${escapeAttr(storeUrl)}" target="_blank" rel="noopener noreferrer" style="color:#0670DB;text-decoration:underline">${escapeAttr(storeName)}</a></p>` : ""}
</td></tr></tbody></table>
</td></tr></tbody></table>
</td></tr></tbody></table>
</body></html>`
}

/** Plain-text alternative, so the message is not flagged as HTML-only. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|div|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
