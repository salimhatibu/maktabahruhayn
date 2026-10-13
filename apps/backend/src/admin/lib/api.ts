import { useCallback, useEffect, useState } from "react"

/** Admin API call using the dashboard's session cookie. */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {}
  const response = await fetch(path, {
    credentials: "include",
    ...rest,
    headers: { "Content-Type": "application/json", ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string }
    throw new Error(body.message || `${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(path))

  const reload = useCallback(() => {
    if (!path) {
      return
    }
    setLoading(true)
    api<T>(path)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [path])

  useEffect(reload, [reload])
  return { data, error, loading, reload, setData }
}

/** Loads and saves one store settings section. */
export function useSettings<T>(key: string) {
  const { data, error, loading, reload, setData } = useApi<{ value: T; defaults: T }>(`/admin/maktabah/settings/${key}`)
  const [saving, setSaving] = useState(false)

  const save = useCallback(
    async (value: T) => {
      setSaving(true)
      try {
        const result = await api<{ value: T }>(`/admin/maktabah/settings/${key}`, { method: "POST", json: { value } })
        setData((d) => (d ? { ...d, value: result.value } : d))
        return result.value
      } finally {
        setSaving(false)
      }
    },
    [key, setData]
  )

  return { value: data?.value ?? null, defaults: data?.defaults ?? null, error, loading, saving, save, reload }
}

export function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: ["kes", "ugx", "tzs", "rwf", "bif", "ngn"].includes(currency.toLowerCase()) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}

export function dateTime(value: string | Date) {
  return new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })
}

export function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}
