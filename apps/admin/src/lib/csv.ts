/**
 * One CSV cell, safe to open in a spreadsheet.
 *
 * Every value is quoted, so commas and line breaks stay inside their column.
 * A value a spreadsheet would read as a formula (=, +, -, @, tab, return) is
 * prefixed with an apostrophe: names and phone numbers come from shoppers,
 * and "=HYPERLINK(...)" in a name must arrive as text, not as a live link.
 */
export function csvCell(value: unknown): string {
  let text = String(value ?? "")
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`
  }
  return `"${text.replace(/"/g, '""')}"`
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",")
}
