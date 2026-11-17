import { newId, toMajor, toMinor } from "@maktabah/db"

export type PromotionInput = {
  code?: string
  description?: string | null
  type?: string
  value?: number
  currency_code?: string | null
  min_subtotal?: number | null
  starts_at?: string | null
  ends_at?: string | null
  usage_limit?: number | null
  is_active?: boolean
  automatic?: boolean
}

export type PromotionColumns = {
  code: string
  description: string | null
  type: string
  value: number
  currency_code: string | null
  min_subtotal_minor: number | null
  starts_at: string | null
  ends_at: string | null
  usage_limit: number | null
  is_active: number
  automatic: number
}

const TYPES = ["percentage", "fixed", "free_shipping"]

function date(value: string | null | undefined, end: boolean): string | null {
  if (!value) return null
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${end ? "23:59:59" : "00:00:00"}Z` : value)
  if (Number.isNaN(parsed.getTime())) throw new Error("Dates must be valid.")
  return parsed.toISOString()
}

/** Turns the form into table columns, or throws a message fit for the admin. */
export function toColumns(input: PromotionInput): PromotionColumns {
  const automatic = Boolean(input.automatic)
  const type = String(input.type || "")
  if (!TYPES.includes(type)) throw new Error("Choose a discount type.")

  let code = String(input.code || "").trim().toUpperCase()
  if (automatic) {
    code = code || `AUTO-${newId("p").slice(-8).toUpperCase()}`
  } else if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    throw new Error("A code needs 3-40 letters, numbers, dashes or underscores.")
  }

  const currency = input.currency_code ? String(input.currency_code).toLowerCase() : null
  let value = 0
  if (type === "percentage") {
    value = Number(input.value)
    if (!Number.isFinite(value) || value <= 0 || value > 100) throw new Error("A percentage must be between 1 and 100.")
    value = Math.round(value)
  } else if (type === "fixed") {
    const amount = Number(input.value)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter the amount to take off.")
    if (!currency) throw new Error("Choose a currency for a fixed amount.")
    value = toMinor(amount)
  }

  const min = input.min_subtotal === null || input.min_subtotal === undefined || input.min_subtotal === ("" as unknown) ? null : Number(input.min_subtotal)
  if (min !== null && (!Number.isFinite(min) || min < 0)) throw new Error("The minimum spend must be zero or more.")
  if (min && !currency) throw new Error("Choose a currency for the minimum spend.")

  const limit = input.usage_limit === null || input.usage_limit === undefined || input.usage_limit === ("" as unknown) ? null : Number(input.usage_limit)
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error("The usage limit must be a whole number.")

  const starts = date(input.starts_at, false)
  const ends = date(input.ends_at, true)
  if (starts && ends && ends < starts) throw new Error("The end date must be after the start date.")

  return {
    code,
    description: input.description?.trim() || null,
    type,
    value,
    currency_code: type === "free_shipping" && !min ? null : currency,
    min_subtotal_minor: min ? toMinor(min) : null,
    starts_at: starts,
    ends_at: ends,
    usage_limit: limit,
    is_active: input.is_active === false ? 0 : 1,
    automatic: automatic ? 1 : 0,
  }
}

export function present(row: Record<string, unknown>) {
  const type = String(row.type)
  return {
    id: row.id,
    code: row.code,
    description: row.description ?? null,
    type,
    value: type === "fixed" ? toMajor(Number(row.value)) : Number(row.value),
    currency_code: row.currency_code ?? null,
    min_subtotal: row.min_subtotal_minor ? toMajor(Number(row.min_subtotal_minor)) : null,
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at ?? null,
    usage_limit: row.usage_limit ?? null,
    used_count: Number(row.used_count || 0),
    is_active: row.is_active === 1,
    automatic: row.automatic === 1,
  }
}
