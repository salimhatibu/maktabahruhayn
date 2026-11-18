"use client"

import { useEffect, useState } from "react"
import { findKenyaCounty, KENYA_COUNTIES } from "@maktabah/shared"
import { checkoutPlaces, fetchCheckoutTowns, selectedCheckoutTown, type TownsByCounty } from "@/lib/checkout-towns"
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
 * Name, street, sub-county/city, county/region, postcode, country and phone.
 * Field names are prefixed (e.g. "ship_city") so several sets can share one form.
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
  const [countyCode, setCountyCode] = useState(findKenyaCounty(value.province)?.code || "")
  const county = KENYA_COUNTIES.find((item) => item.code === countyCode) || null
  const [towns, setTowns] = useState<TownsByCounty>({})
  const [townStatus, setTownStatus] = useState<"loading" | "ready" | "error">("loading")
  const [townAttempt, setTownAttempt] = useState(0)
  const [subCounty, setSubCounty] = useState(value.city)
  useEffect(() => {
    const refresh = () => setTownAttempt((attempt) => attempt + 1)
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [])
  useEffect(() => {
    let active = true
    setTownStatus("loading")
    fetchCheckoutTowns()
      .then((data) => {
        if (active) {
          setTowns(data)
          setTownStatus("ready")
        }
      })
      .catch(() => {
        if (active) setTownStatus("error")
      })
    return () => { active = false }
  }, [townAttempt])
  const places = county ? checkoutPlaces(county.subCounties, towns, county.code) : []
  const selected = selectedCheckoutTown(places, subCounty)
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
        {country === "ke" ? "Exact address (house/building and street)" : "Street address"}
        <input name={n("address_1")} autoComplete="address-line1" required={required} defaultValue={value.address_1} placeholder="House number and street" />
      </label>
      <label className="span-2">
        {country === "ke" ? "Estate, landmark, apartment" : "Apartment, building, estate"} <span className="optional">(optional)</span>
        <input name={n("address_2")} autoComplete="address-line2" defaultValue={value.address_2} />
      </label>
      {country === "ke" ? (
        <>
          <label>
            County
            <select
              name={n("province")}
              autoComplete="address-level1"
              required={required}
              value={countyCode}
              onChange={(event) => {
                setCountyCode(event.target.value)
                setSubCounty("")
              }}
            >
              <option value="">Choose a county</option>
              {KENYA_COUNTIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Town / Sub-county
            <select
              name={n("city")}
              autoComplete="address-level2"
              required={required}
              value={selected}
              disabled={!county}
              onChange={(event) => setSubCounty(event.target.value)}
            >
              <option value="">Choose a town or sub-county</option>
              {places.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {townStatus === "loading" ? <span className="field-hint span-2" role="status">Loading delivery towns...</span> : null}
          {townStatus === "error" ? (
            <div className="field-hint span-2" role="alert">
              Delivery towns could not be loaded.{" "}
              <button type="button" onClick={() => setTownAttempt((attempt) => attempt + 1)}>Try again</button>
            </div>
          ) : null}
          {townStatus === "ready" ? (
            <div className="field-hint span-2">
              <button type="button" onClick={() => setTownAttempt((attempt) => attempt + 1)}>Refresh delivery towns</button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <label>
            Town / City
            <input name={n("city")} autoComplete="address-level2" required={required} defaultValue={value.city} />
          </label>
          <label>
            {country === "us" ? "State" : country === "gb" ? "County" : "County / Region"} <span className="optional">(optional)</span>
            <input name={n("province")} autoComplete="address-level1" defaultValue={value.province} />
          </label>
        </>
      )}
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
