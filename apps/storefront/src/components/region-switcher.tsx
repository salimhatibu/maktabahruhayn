"use client"

import { useRef } from "react"
import { setRegionAction } from "@/app/actions/cart"
import { GlobeIcon } from "./icons"

export type RegionOption = { group: string; currency: string; countries: { code: string; name: string }[] }

export function RegionSwitcher({
  current,
  currency,
  options,
}: {
  current: string
  currency: string
  options: RegionOption[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const currentCurrency =
    (options.find((o) => o.countries.some((c) => c.code === current))?.currency || currency).toUpperCase()

  return (
    <form ref={formRef} action={setRegionAction} className="region-switcher">
      <GlobeIcon size={20} />
      <label htmlFor="ship-to">
        <span className="util-label">Ship to</span>
        <span className="util-value">
          {current} · {currentCurrency}
        </span>
      </label>
      <select
        id="ship-to"
        name="country"
        defaultValue={current}
        onChange={() => formRef.current?.requestSubmit()}
      >
        {options.map((group) => (
          <optgroup key={group.group} label={`${group.group} (${group.currency.toUpperCase()})`}>
            {group.countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <noscript>
        <button type="submit">Update</button>
      </noscript>
    </form>
  )
}
