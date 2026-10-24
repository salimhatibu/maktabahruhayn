"use client"

import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js"
import { useEffect, useMemo, useRef, useState } from "react"

export type PhoneValue = { country: CountryCode; national: string; e164: string; valid: boolean }

function flag(code: string) {
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

let cachedOptions: { code: CountryCode; name: string; dial: string }[] | null = null

/** Every country libphonenumber knows, named in English and sorted by name. */
export function phoneCountries() {
  if (!cachedOptions) {
    const names = new Intl.DisplayNames(["en"], { type: "region" })
    cachedOptions = getCountries()
      .map((code) => ({ code, name: names.of(code) || code, dial: getCountryCallingCode(code) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  return cachedOptions
}

function normaliseCountry(code?: string | null): CountryCode {
  const upper = (code || "").toUpperCase()
  return (getCountries() as string[]).includes(upper) ? (upper as CountryCode) : "KE"
}

function evaluate(country: CountryCode, national: string): PhoneValue {
  const digits = national.replace(/[^\d]/g, "")
  const parsed = digits ? parsePhoneNumberFromString(national, country) : undefined
  return {
    country,
    national,
    e164: parsed?.number || (digits ? `+${getCountryCallingCode(country)}${digits.replace(/^0+/, "")}` : ""),
    valid: Boolean(parsed?.isValid()),
  }
}

/** Splits a stored number ("+254712…", "0712…", "254712…") into country and local part. */
function initialValue(value: string | null | undefined, fallbackCountry: CountryCode): { country: CountryCode; national: string } {
  const raw = (value || "").trim()
  if (!raw) {
    return { country: fallbackCountry, national: "" }
  }
  const withPlus = raw.startsWith("+") ? raw : /^\d{11,15}$/.test(raw) ? `+${raw}` : raw
  const parsed = parsePhoneNumberFromString(withPlus, fallbackCountry)
  if (parsed?.country) {
    return { country: parsed.country, national: parsed.formatNational() }
  }
  return { country: fallbackCountry, national: raw.replace(/^\+/, "") }
}

/**
 * Phone number with a country code picker. Submits the number in
 * international format (+254712345678) under `name`.
 */
export function PhoneInput({
  name,
  label,
  defaultValue,
  defaultCountry,
  required = false,
  hint,
  id,
  className,
  onChange,
}: {
  name: string
  label: string
  defaultValue?: string | null
  defaultCountry?: string | null
  required?: boolean
  hint?: string
  id?: string
  className?: string
  onChange?: (value: PhoneValue) => void
}) {
  // `name` is unique inside a form, so it gives the field a stable id without
  // useId(), whose value is derived from the React tree and can come out
  // different on the server than during hydration - the label's htmlFor then
  // mismatches and React discards the server HTML for this subtree. Pass `id`
  // where two of these share a name on one page.
  const inputId = id || `phone-${name}`
  const fallback = normaliseCountry(defaultCountry)
  const start = useMemo(() => initialValue(defaultValue, fallback), [defaultValue, fallback])
  const [country, setCountry] = useState<CountryCode>(start.country)
  const [national, setNational] = useState(start.national)
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Country names come from the runtime's Intl data, which can differ between
  // server and browser, so the full list renders after hydration.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const options = mounted
    ? phoneCountries()
    : [{ code: country, name: country, dial: getCountryCallingCode(country) }]
  const value = evaluate(country, national)
  const invalid = Boolean(national.trim()) && !value.valid
  const countryName = options.find((o) => o.code === country)?.name || country

  useEffect(() => {
    inputRef.current?.setCustomValidity(
      invalid ? `Enter a valid phone number for ${countryName}.` : required && !national.trim() ? "Enter your phone number." : ""
    )
  }, [invalid, required, national, countryName])

  useEffect(() => {
    onChange?.(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.e164, value.valid])

  return (
    <div className={`phone-field ${className || ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <div className={`phone-control ${touched && invalid ? "is-invalid" : ""}`}>
        <span className="phone-country">
          <span className="phone-flag" aria-hidden="true">
            {flag(country)}
          </span>
          <span className="phone-dial">+{getCountryCallingCode(country)}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <select
            aria-label="Country code"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value as CountryCode)
              inputRef.current?.focus()
            }}
          >
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {flag(o.code)} {o.name} (+{o.dial})
              </option>
            ))}
          </select>
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          placeholder={country === "KE" ? "0712 345 678" : "Phone number"}
          value={national}
          onChange={(e) => setNational(e.target.value.replace(/[^\d\s()-]/g, ""))}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && invalid ? true : undefined}
          aria-describedby={hint || (touched && invalid) ? `${inputId}-hint` : undefined}
        />
      </div>
      <input type="hidden" name={name} value={value.e164} />
      {touched && invalid ? (
        <span id={`${inputId}-hint`} className="field-error">
          Check the number for {countryName}.
        </span>
      ) : hint ? (
        <span id={`${inputId}-hint`} className="field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  )
}
