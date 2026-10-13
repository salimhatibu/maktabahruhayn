"use client"

import { useState } from "react"
import { PhoneInput } from "./phone-input"

export type AddressValue = {
  first_name: string
  last_name: string
  address_1: string
  address_2: string
  city: string
  province: string
  postal_code: string
  country_code: string
  phone: string
}

export type CountryOption = { code: string; name: string; currency: string }

export const EMPTY_ADDRESS: AddressValue = {
  first_name: "",
  last_name: "",
  address_1: "",
  address_2: "",
  city: "",
  province: "",
  postal_code: "",
  country_code: "",
  phone: "",
}

/**
 * Name, street, city, region, postcode, country and phone. Field names are
 * prefixed (e.g. "ship_city") so several sets can share one form.
 */
export function AddressFields({
  value,
  countries,
  prefix = "",
  required = true,
  withName = true,
  withPhone = true,
  currentCurrency,
}: {
  value: AddressValue
  countries: CountryOption[]
  prefix?: string
  required?: boolean
  withName?: boolean
  withPhone?: boolean
  /** When set, warns that picking a country in another currency region changes the prices. */
  currentCurrency?: string
}) {
  const [country, setCountry] = useState(value.country_code)
  const chosen = countries.find((c) => c.code === country)
  const n = (field: string) => `${prefix}${field}`

  return (
    <div className="form-grid">
      {withName ? (
        <>
          <label>
            First name
            <input name={n("first_name")} autoComplete="given-name" required={required} defaultValue={value.first_name} />
          </label>
          <label>
            Last name
            <input name={n("last_name")} autoComplete="family-name" required={required} defaultValue={value.last_name} />
          </label>
        </>
      ) : null}
      <label className="span-2">
        Country
        <select
          name={n("country_code")}
          autoComplete="country"
          required={required}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          <option value="" disabled>
            Choose a country
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {currentCurrency && chosen && chosen.currency !== currentCurrency ? (
          <span className="field-hint">
            Orders to {chosen.name} are charged in {chosen.currency.toUpperCase()}. Your cart will switch from{" "}
            {currentCurrency.toUpperCase()} when you continue.
          </span>
        ) : null}
      </label>
      <label className="span-2">
        Street address
        <input name={n("address_1")} autoComplete="address-line1" required={required} defaultValue={value.address_1} placeholder="House number and street" />
      </label>
      <label className="span-2">
        Apartment, building, estate <span className="optional">(optional)</span>
        <input name={n("address_2")} autoComplete="address-line2" defaultValue={value.address_2} />
      </label>
      <label>
        Town / City
        <input name={n("city")} autoComplete="address-level2" required={required} defaultValue={value.city} />
      </label>
      <label>
        {country === "us" ? "State" : country === "gb" ? "County" : "County / Region"} <span className="optional">(optional)</span>
        <input name={n("province")} autoComplete="address-level1" defaultValue={value.province} />
      </label>
      <label>
        {country === "us" ? "ZIP code" : "Postcode"} <span className="optional">(optional)</span>
        <input name={n("postal_code")} autoComplete="postal-code" defaultValue={value.postal_code} />
      </label>
      {withPhone ? (
        <PhoneInput
          name={n("phone")}
          label="Phone"
          required={required}
          defaultValue={value.phone}
          defaultCountry={country || "ke"}
          hint="For delivery updates from the courier."
        />
      ) : (
        <div />
      )}
    </div>
  )
}
