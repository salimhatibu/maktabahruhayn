export function formatMoney(amount: number, currency?: string | null) {
  const code = (currency || "usd").toUpperCase()
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      maximumFractionDigits: code === "KES" ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${code}`
  }
}

export function formatDate(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

const BINDING_LABELS: Record<string, string> = {
  hardcover: "Hardcover",
  softcover: "Softcover",
  faux_leather: "Faux Leather",
  multi_volume_box_set: "Multi-volume Box Set",
}

const SCRIPT_LABELS: Record<string, string> = {
  madani: "Madani (Uthmani)",
  indo_pak: "Indo-Pak",
  other: "Other",
}

export function bindingLabel(value?: string | null) {
  return value ? BINDING_LABELS[value] || titleCase(value) : null
}

export function scriptLabel(value?: string | null) {
  return value ? SCRIPT_LABELS[value] || titleCase(value) : null
}

export function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code
  } catch {
    return code
  }
}
