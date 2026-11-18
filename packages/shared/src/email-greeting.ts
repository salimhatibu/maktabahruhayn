const greetingLine = /^(?:as[-\s]?salaam\s+aleikum\s+warahmatullahi\s+wabarakatuh,\s+.+|(?:assalamu\s+alaikum|as[-\s]?salaam\s+aleikum(?:\s+warahmatullahi\s+wabarakatuh)?)[,!]?|(?:assalamu\s+alaikum|as[-\s]?salaam\s+aleikum(?:\s+warahmatullahi\s+wabarakatuh)?|dear|hello|hi)[\s,]+[^,!<>]{1,100}[,!])$/i

function stripTextGreeting(text: string): string {
  const trimmed = text.trimStart()
  const newline = trimmed.indexOf("\n")
  const firstLine = (newline === -1 ? trimmed : trimmed.slice(0, newline)).trim()
  return greetingLine.test(firstLine)
    ? (newline === -1 ? "" : trimmed.slice(newline + 1).trimStart())
    : trimmed
}

function stripHtmlGreeting(html: string): string {
  const trimmed = html.trimStart()
  const paragraph = /^<(p|div)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(trimmed)
  if (paragraph && greetingLine.test(paragraph[2].replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim())) {
    return trimmed.slice(paragraph[0].length).trimStart()
  }
  const line = /^([^<]*)(?:<br\s*\/?>|\r?\n)/i.exec(trimmed)
  if (line && greetingLine.test(line[1].trim())) return trimmed.slice(line[0].length).replace(/^(?:\s|<br\s*\/?>)*/i, "")
  return trimmed
}

/** Prefix the visible email body and text with the customer's greeting. */
export function greetCustomerEmail({
  html,
  text,
  customerName,
}: {
  html: string
  text: string
  customerName?: string | null
}): { html: string; text: string } {
  const name = customerName?.replace(/\s+/g, " ").trim() || "Customer"
  const greeting = `As-Salaam Aleikum Warahmatullahi Wabarakatuh, ${name}`
  const escaped = greeting.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  const remainingHtml = stripHtmlGreeting(html)
  const remainingText = stripTextGreeting(text)
  return {
    html: `<p>${escaped}</p>${remainingHtml}`,
    text: `${greeting}${remainingText ? `\n\n${remainingText}` : ""}`,
  }
}
