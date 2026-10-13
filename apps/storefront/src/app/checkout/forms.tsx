"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import {
  completeOrderAction,
  saveAddressAction,
  startPaymentAction,
  type FormState,
} from "@/app/actions/cart"
import type { PaymentChoice, ShippingOption } from "@/lib/cart"
import { formatMoney } from "@/lib/format"
import { AddressFields, type AddressValue, type CountryOption } from "@/components/address-fields"
import { PhoneInput } from "@/components/phone-input"
import { StripePay } from "./stripe-pay"
import { callAction } from "@/lib/stale-action"

const initial: FormState = { error: null }

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending} aria-busy={pending}>
      {pending ? "Please wait…" : children}
    </button>
  )
}

function ErrorBanner({ message }: { message: string | null }) {
  return message ? (
    <p className="form-banner" role="alert">
      {message}
    </p>
  ) : null
}

export type AddressDefaults = AddressValue & { email: string }

export type SavedCheckoutAddress = AddressValue & { id: string; label: string }

export function AddressForm({
  defaults,
  countries,
  currency,
  saved,
  signedIn,
}: {
  defaults: AddressDefaults
  countries: CountryOption[]
  currency: string
  saved: SavedCheckoutAddress[]
  signedIn: boolean
}) {
  const [state, action] = useActionState(saveAddressAction, initial)
  const [choice, setChoice] = useState<string>(() => {
    const match = saved.find((a) => a.address_1 === defaults.address_1 && a.city === defaults.city)
    return match ? match.id : saved.length && !defaults.address_1 ? saved[0].id : "new"
  })
  const picked = saved.find((a) => a.id === choice)
  const value: AddressValue = picked || (choice === "new" && saved.some((a) => a.address_1 === defaults.address_1) ? { ...defaults, address_1: "", address_2: "", city: "", province: "", postal_code: "" } : defaults)

  return (
    <form action={action} className="stack checkout-address">
      <ErrorBanner message={state.error} />
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required defaultValue={defaults.email} />
        <span className="field-hint">Your receipt and tracking updates go here.</span>
      </label>

      {saved.length ? (
        <fieldset className="option-cards saved-addresses">
          <legend>Ship to</legend>
          {saved.map((a) => (
            <label key={a.id} className={`option-card ${choice === a.id ? "is-selected" : ""}`}>
              <input type="radio" name="saved_choice" value={a.id} checked={choice === a.id} onChange={() => setChoice(a.id)} />
              <span>
                <strong>
                  {a.first_name} {a.last_name}
                </strong>
                <small>{a.label}</small>
              </span>
            </label>
          ))}
          <label className={`option-card ${choice === "new" ? "is-selected" : ""}`}>
            <input type="radio" name="saved_choice" value="new" checked={choice === "new"} onChange={() => setChoice("new")} />
            <span>
              <strong>A new address</strong>
              <small>Enter it below</small>
            </span>
          </label>
        </fieldset>
      ) : null}

      {picked
        ? (() => {
            const target = countries.find((c) => c.code === picked.country_code)
            return target && target.currency !== currency ? (
              <p className="field-hint">
                Orders to {target.name} are charged in {target.currency.toUpperCase()}. Your cart will switch from{" "}
                {currency.toUpperCase()} when you continue.
              </p>
            ) : null
          })()
        : null}

      <div hidden={Boolean(picked && picked.phone && picked.address_1 && picked.city && picked.country_code)}>
        <AddressFields key={choice} value={value} countries={countries} currentCurrency={currency} />
      </div>

      {signedIn && choice === "new" ? (
        <label className="check-row">
          <input type="checkbox" name="save_address" defaultChecked />
          <span>
            <strong>Save this address to my account</strong>
          </span>
        </label>
      ) : null}
      <Submit>Continue to Delivery</Submit>
    </form>
  )
}

const MPESA_POLL_MS = 4000
const MPESA_TIMEOUT_MS = 120000

type Stage =
  | { name: "choose" }
  | { name: "mpesa"; startedAt: number }
  | { name: "stripe"; clientSecret: string }

export function DeliveryPaymentForm({
  options,
  payments,
  currency,
  selectedOptionId,
  defaultPhone,
  preferredProvider,
}: {
  options: ShippingOption[]
  payments: PaymentChoice[]
  currency: string
  selectedOptionId?: string
  defaultPhone: string
  preferredProvider?: string | null
}) {
  const router = useRouter()
  const [optionId, setOptionId] = useState(selectedOptionId || options[0]?.id || "")
  const [providerId, setProviderId] = useState(
    (preferredProvider && payments.some((p) => p.id === preferredProvider) ? preferredProvider : null) || payments[0]?.id || ""
  )
  const [phone, setPhone] = useState(defaultPhone)
  const [stage, setStage] = useState<Stage>({ name: "choose" })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [timedOut, setTimedOut] = useState(false)
  const polling = useRef(false)

  const finish = (orderId: string) => router.push(`/checkout/complete?order=${orderId}`)

  // M-Pesa: poll cart completion until the STK push is approved.
  useEffect(() => {
    if (stage.name !== "mpesa") {
      return
    }
    const timer = window.setInterval(async () => {
      if (polling.current) {
        return
      }
      if (Date.now() - stage.startedAt > MPESA_TIMEOUT_MS) {
        setTimedOut(true)
        window.clearInterval(timer)
        return
      }
      polling.current = true
      try {
        const result = await callAction(() => completeOrderAction())
        if (!result) {
          return
        }
        if (result.kind === "done") {
          window.clearInterval(timer)
          finish(result.orderId)
        } else if (result.kind === "error") {
          window.clearInterval(timer)
          setError(result.error)
          setStage({ name: "choose" })
        }
      } finally {
        polling.current = false
      }
    }, MPESA_POLL_MS)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  const start = (restart = false) =>
    startTransition(async () => {
      setError(null)
      setTimedOut(false)
      const result = await callAction(() => startPaymentAction({ optionId, providerId, phone, restart }))
      if (!result) {
        return
      }
      if (result.kind === "error") {
        setError(result.error)
      } else if (result.kind === "done") {
        finish(result.orderId)
      } else if (result.kind === "mpesa") {
        setStage({ name: "mpesa", startedAt: Date.now() })
      } else {
        setStage({ name: "stripe", clientSecret: result.clientSecret })
      }
    })

  if (stage.name === "mpesa") {
    return (
      <div className="mpesa-wait" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <h3>Check your phone</h3>
        <p>
          We sent an M-Pesa request to <strong>{phone}</strong>. Enter your M-Pesa PIN to pay. This page updates
          automatically.
        </p>
        {timedOut ? (
          <>
            <p className="form-error">We haven&apos;t received confirmation yet.</p>
            <button type="button" className="btn btn-primary" onClick={() => start(true)} disabled={pending}>
              Resend M-Pesa Request
            </button>
          </>
        ) : null}
        <button type="button" className="link-btn" onClick={() => setStage({ name: "choose" })}>
          Use a different payment method
        </button>
      </div>
    )
  }

  if (stage.name === "stripe") {
    return (
      <div className="stack">
        <h3 className="choice-legend">Card details</h3>
        <StripePay clientSecret={stage.clientSecret} onDone={finish} />
        <button type="button" className="link-btn" onClick={() => setStage({ name: "choose" })}>
          Back
        </button>
      </div>
    )
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        start()
      }}
    >
      <ErrorBanner message={error} />
      <fieldset className="choice-group">
        <legend>Delivery</legend>
        {options.length ? (
          options.map((option) => (
            <label key={option.id} className="choice">
              <input
                type="radio"
                name="shipping_option_id"
                value={option.id}
                checked={optionId === option.id}
                onChange={() => setOptionId(option.id)}
                required
              />
              <span className="choice-label">{option.name}</span>
              <span className="choice-price">
                {typeof option.amount === "number"
                  ? option.amount === 0
                    ? "FREE"
                    : formatMoney(option.amount, currency)
                  : "Calculated"}
              </span>
            </label>
          ))
        ) : (
          <p className="muted">No delivery options are available for this address yet.</p>
        )}
      </fieldset>

      <fieldset className="choice-group">
        <legend>Payment</legend>
        {payments.length ? (
          payments.map((payment) => (
            <label key={payment.id} className="choice choice-stack">
              <input
                type="radio"
                name="payment_provider"
                value={payment.id}
                checked={providerId === payment.id}
                onChange={() => setProviderId(payment.id)}
                required
              />
              <span className="choice-label">{payment.label}</span>
              <span className="choice-hint">{payment.hint}</span>
              {payment.id === "pp_daraja_daraja" && providerId === payment.id ? (
                <PhoneInput
                  className="choice-extra"
                  name="mpesa_phone"
                  label="M-Pesa number"
                  defaultValue={phone}
                  defaultCountry="KE"
                  required
                  onChange={(v) => setPhone(v.e164.replace(/\D/g, ""))}
                />
              ) : null}
            </label>
          ))
        ) : (
          <p className="muted">No payment methods are configured for this region.</p>
        )}
      </fieldset>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending || !options.length || !payments.length}>
        {pending
          ? "Please wait…"
          : providerId === "pp_stripe_stripe"
            ? "Continue to Card Payment"
            : providerId === "pp_daraja_daraja"
              ? "Pay with M-Pesa"
              : "Place Order"}
      </button>
    </form>
  )
}
