"use client"

import { useActionState, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import {
  deleteAddressAction,
  loginAction,
  registerAction,
  saveAddressBookAction,
  setDefaultAddressAction,
  updatePaymentPreferenceAction,
  updateProfileAction,
  type AccountFormState,
} from "@/app/actions/account"
import { AddressFields, EMPTY_ADDRESS, type AddressValue, type CountryOption } from "@/components/address-fields"
import { PhoneInput } from "@/components/phone-input"

const initial: AccountFormState = { error: null }

function Submit({ label, block = true }: { label: string; block?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={`btn btn-primary ${block ? "btn-block" : ""}`} disabled={pending} aria-busy={pending}>
      {pending ? "Please wait…" : label}
    </button>
  )
}

function Feedback({ state }: { state: AccountFormState }) {
  if (state.error) {
    return (
      <p className="form-banner" role="alert">
        {state.error}
      </p>
    )
  }
  return state.message ? (
    <p className="form-success" role="status">
      {state.message}
    </p>
  ) : null
}

function PasswordField({ autoComplete }: { autoComplete: "current-password" | "new-password" }) {
  const [show, setShow] = useState(false)
  return (
    <label>
      Password
      <span className="password-control">
        <input
          name="password"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={autoComplete === "new-password" ? 8 : undefined}
          required
        />
        <button type="button" className="password-toggle" onClick={() => setShow((s) => !s)} aria-pressed={show}>
          {show ? "Hide" : "Show"}
        </button>
      </span>
      {autoComplete === "new-password" ? <span className="field-hint">At least 8 characters.</span> : null}
    </label>
  )
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, initial)
  return (
    <form action={action} className="stack auth-form">
      <Feedback state={state} />
      <input type="hidden" name="next" value={next} />
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <PasswordField autoComplete="current-password" />
      <Submit label="Sign In" />
    </form>
  )
}

export type PaymentChoiceKey = "mpesa" | "card" | "none"

function PaymentPreferenceFields({
  method,
  mpesaPhone,
}: {
  method: PaymentChoiceKey
  mpesaPhone: string | null
}) {
  const [choice, setChoice] = useState<PaymentChoiceKey>(method)
  return (
    <div className="stack-sm">
      <fieldset className="option-cards">
        <legend className="sr-only">Preferred payment method</legend>
        {(
          [
            ["mpesa", "M-Pesa", "Approve with your PIN on your phone (Kenya)."],
            ["card", "Card", "Visa, Mastercard, Apple Pay or Google Pay."],
            ["none", "Decide at checkout", "Choose each time you order."],
          ] as const
        ).map(([value, title, body]) => (
          <label key={value} className={`option-card ${choice === value ? "is-selected" : ""}`}>
            <input type="radio" name="preferred_payment" value={value} checked={choice === value} onChange={() => setChoice(value)} />
            <span>
              <strong>{title}</strong>
              <small>{body}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {choice === "mpesa" ? (
        <PhoneInput
          name="mpesa_phone"
          label="M-Pesa number"
          defaultValue={mpesaPhone}
          defaultCountry="KE"
          required
          hint="We send the payment request (STK push) to this number."
        />
      ) : null}
      {choice === "card" ? (
        <p className="field-hint secure-note">
          Card details are entered securely with Stripe when you pay. Maktabah Ruhayn never sees or stores your card number.
        </p>
      ) : null}
    </div>
  )
}

export function RegisterForm({
  next,
  countries,
  defaultCountry,
}: {
  next: string
  countries: CountryOption[]
  defaultCountry: string
}) {
  const [state, action] = useActionState(registerAction, initial)
  const [addAddress, setAddAddress] = useState(false)
  const [addPayment, setAddPayment] = useState(false)
  return (
    <form action={action} className="stack auth-form">
      <Feedback state={state} />
      <input type="hidden" name="next" value={next} />
      <div className="form-grid">
        <label>
          First name
          <input name="first_name" autoComplete="given-name" required />
        </label>
        <label>
          Last name
          <input name="last_name" autoComplete="family-name" required />
        </label>
      </div>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <PhoneInput name="phone" label="Phone (optional)" defaultCountry={defaultCountry} hint="For delivery updates and M-Pesa payments." />
      <PasswordField autoComplete="new-password" />

      <div className="optional-section">
        <label className="check-row">
          <input type="checkbox" name="add_address" checked={addAddress} onChange={(e) => setAddAddress(e.target.checked)} />
          <span>
            <strong>Add a shipping address</strong>
            <small>Saved to your account so checkout is quicker.</small>
          </span>
        </label>
        {addAddress ? (
          <AddressFields
            value={{ ...EMPTY_ADDRESS, country_code: defaultCountry.toLowerCase() }}
            countries={countries}
            prefix="ship_"
            withName={false}
          />
        ) : null}
      </div>

      <div className="optional-section">
        <label className="check-row">
          <input type="checkbox" name="add_payment" checked={addPayment} onChange={(e) => setAddPayment(e.target.checked)} />
          <span>
            <strong>Choose how you like to pay</strong>
            <small>We&apos;ll have it ready at checkout.</small>
          </span>
        </label>
        {addPayment ? <PaymentPreferenceFields method={defaultCountry.toUpperCase() === "KE" ? "mpesa" : "card"} mpesaPhone={null} /> : null}
      </div>

      <label className="check-row">
        <input type="checkbox" name="newsletter" />
        <span>
          <strong>Email me bookseller recommendations and offers</strong>
          <small>New arrivals and pre-orders. Unsubscribe anytime.</small>
        </span>
      </label>
      <Submit label="Create Account" />
    </form>
  )
}

export function ProfileForm({
  customer,
  defaultCountry,
}: {
  customer: { first_name: string | null; last_name: string | null; phone: string | null; email: string }
  defaultCountry: string
}) {
  const [state, action] = useActionState(updateProfileAction, initial)
  return (
    <form action={action} className="stack auth-form">
      <Feedback state={state} />
      <div className="form-grid">
        <label>
          First name
          <input name="first_name" autoComplete="given-name" required defaultValue={customer.first_name || ""} />
        </label>
        <label>
          Last name
          <input name="last_name" autoComplete="family-name" required defaultValue={customer.last_name || ""} />
        </label>
      </div>
      <label>
        Email
        <input value={customer.email} readOnly disabled />
        <span className="field-hint">Contact us to change the email on your account.</span>
      </label>
      <PhoneInput name="phone" label="Phone" defaultValue={customer.phone} defaultCountry={defaultCountry} />
      <div>
        <Submit label="Save Details" block={false} />
      </div>
    </form>
  )
}

export function PaymentPreferenceForm({ method, mpesaPhone }: { method: PaymentChoiceKey; mpesaPhone: string | null }) {
  const [state, action] = useActionState(updatePaymentPreferenceAction, initial)
  return (
    <form action={action} className="stack auth-form">
      <Feedback state={state} />
      <PaymentPreferenceFields method={method} mpesaPhone={mpesaPhone} />
      <div>
        <Submit label="Save Preference" block={false} />
      </div>
    </form>
  )
}

export type SavedAddress = AddressValue & { id: string; is_default_shipping?: boolean }

function AddressEditor({
  address,
  countries,
  onDone,
}: {
  address: SavedAddress | null
  countries: CountryOption[]
  onDone: () => void
}) {
  const [state, action] = useActionState(saveAddressBookAction, initial)
  useEffect(() => {
    if (state.message && !state.error) {
      onDone()
    }
  }, [state, onDone])
  return (
    <form action={action} className="stack auth-form address-editor">
      <Feedback state={state} />
      {address ? <input type="hidden" name="address_id" value={address.id} /> : null}
      <AddressFields value={address || EMPTY_ADDRESS} countries={countries} />
      <label className="check-row">
        <input type="checkbox" name="is_default" defaultChecked={!address || address.is_default_shipping} />
        <span>
          <strong>Use as my default address</strong>
        </span>
      </label>
      <div className="button-row">
        <Submit label={address ? "Save Address" : "Add Address"} block={false} />
        <button type="button" className="btn btn-outline" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export function AddressBook({ addresses, countries }: { addresses: SavedAddress[]; countries: CountryOption[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const name = (code: string) => countries.find((c) => c.code === code)?.name || code.toUpperCase()

  return (
    <div className="stack">
      {addresses.length ? (
        <ul className="address-list">
          {addresses.map((a) =>
            editing === a.id ? (
              <li key={a.id} className="address-item is-editing">
                <AddressEditor address={a} countries={countries} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={a.id} className="address-item">
                <address>
                  <strong>
                    {a.first_name} {a.last_name}
                  </strong>
                  {a.is_default_shipping ? <span className="pill">Default</span> : null}
                  <br />
                  {a.address_1}
                  {a.address_2 ? `, ${a.address_2}` : ""}
                  <br />
                  {[a.city, a.province, a.postal_code].filter(Boolean).join(", ")}
                  <br />
                  {name(a.country_code)}
                  {a.phone ? (
                    <>
                      <br />
                      {a.phone}
                    </>
                  ) : null}
                </address>
                <div className="address-actions">
                  <button type="button" className="link-btn" onClick={() => setEditing(a.id)}>
                    Edit
                  </button>
                  {!a.is_default_shipping ? (
                    <form action={setDefaultAddressAction}>
                      <input type="hidden" name="address_id" value={a.id} />
                      <button type="submit" className="link-btn">
                        Make default
                      </button>
                    </form>
                  ) : null}
                  <form action={deleteAddressAction}>
                    <input type="hidden" name="address_id" value={a.id} />
                    <button type="submit" className="link-btn danger">
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            )
          )}
        </ul>
      ) : (
        <p className="muted">No saved addresses yet. Add one to check out faster.</p>
      )}
      {editing === "new" ? (
        <AddressEditor address={null} countries={countries} onDone={() => setEditing(null)} />
      ) : (
        <div>
          <button type="button" className="btn btn-outline" onClick={() => setEditing("new")}>
            Add an Address
          </button>
        </div>
      )}
    </div>
  )
}
