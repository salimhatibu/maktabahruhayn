"use client"

import { useRouter } from "next/navigation"

/** Variant choice shown as a dropdown when the product is set to "Dropdown" in the admin. */
export function FormatSelect({
  handle,
  selected,
  options,
}: {
  handle: string
  selected: string
  options: { value: string; label: string }[]
}) {
  const router = useRouter()
  return (
    <label className="format-select">
      <span className="sr-only">Choose a format</span>
      <select
        value={selected}
        onChange={(e) => router.replace(`/books/${handle}?format=${encodeURIComponent(e.target.value)}`, { scroll: false })}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
