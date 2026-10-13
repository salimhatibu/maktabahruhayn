/** Renders {{dotted.path}} placeholders; unknown paths render as empty. */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path.split(".").reduce<unknown>((acc, part) => {
      return acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined
    }, vars)
    return value === undefined || value === null ? "" : String(value)
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

/** Plain-text body into a simple, branded HTML email. */
export function toEmailHtml(text: string, opts: { storeName: string; brand: string; storeUrl: string }) {
  const body = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`)
    .join("")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:' + opts.brand + '">$1</a>')
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Segoe UI,Arial,sans-serif;color:#222">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:6px;overflow:hidden">
<tr><td style="background:${opts.brand};color:#fff;padding:18px 24px;font-size:18px;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(opts.storeName)}</td></tr>
<tr><td style="padding:24px;font-size:15px">${body}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eee;font-size:12px;color:#777"><a href="${opts.storeUrl}" style="color:#777">${escapeHtml(opts.storeUrl.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`
}

export function formatAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}
