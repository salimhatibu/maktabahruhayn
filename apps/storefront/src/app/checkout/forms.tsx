"use client"

import { keep } from "@/lib/keep-form"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import {
  saveAddressAction,
  manualMpesaStatusAction,
  startPaymentAction,
  type FormState,
} from "@/app/actions/cart"
import type { PaymentChoice, ShippingOption } from "@/lib/cart"
import { formatMoney } from "@/lib/format"
import { AddressFields, type AddressValue, type CountryOption } from "@/components/address-fields"
import { StripePay } from "./stripe-pay"
import { callAction } from "@/lib/stale-action"

const initial: FormState = { error: null }

function Submit({ children, pending: busy }: { children: React.ReactNode; pending?: boolean }) {
  // Forms submitted through keep() are not "form actions" to useFormStatus.
  const status = useFormStatus()
  const pending = busy ?? status.pending
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
  const [state, action, pending] = useActionState(saveAddressAction, initial)
  const [choice, setChoice] = useState<string>(() => {
    const match = saved.find((a) => a.address_1 === defaults.address_1 && a.city === defaults.city)
    return match ? match.id : saved.length && !defaults.address_1 ? saved[0].id : "new"
  })
  const picked = saved.find((a) => a.id === choice)
  const value: AddressValue = picked || (choice === "new" && saved.some((a) => a.address_1 === defaults.address_1) ? { ...defaults, address_1: "", address_2: "", city: "", province: "", postal_code: "" } : defaults)

  return (
    <form action={action} onSubmit={keep(action)} className="stack checkout-address">
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
      <Submit pending={pending}>Continue to Delivery</Submit>
    </form>
  )
}

type Stage =
  | { name: "choose" }
  | { name: "submitted" }
  | { name: "stripe"; clientSecret: string }

export function DeliveryPaymentForm({
  options,
  payments,
  currency,
  manualPaymentAmount,
  selectedOptionId,
  preferredProvider,
  manualPaymentPending,
}: {
  options: ShippingOption[]
  payments: PaymentChoice[]
  currency: string
  manualPaymentAmount: number
  selectedOptionId?: string
  preferredProvider?: string | null
  manualPaymentPending: boolean
}) {
  const router = useRouter()
  const [optionId, setOptionId] = useState(selectedOptionId || options[0]?.id || "")
  const [providerId, setProviderId] = useState(
    (preferredProvider && payments.some((p) => p.id === preferredProvider) ? preferredProvider : null) || payments[0]?.id || ""
  )
  const [message, setMessage] = useState("")
  const [stage, setStage] = useState<Stage>(manualPaymentPending ? { name: "submitted" } : { name: "choose" })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const checkingManualPayment = useRef(false)

  const finish = (orderId: string) => router.push(`/checkout/complete?order=${orderId}`)

  useEffect(() => {
    if (stage.name !== "submitted") {
      return
    }
    let active = true
    const check = async () => {
      if (checkingManualPayment.current) {
        return
      }
      checkingManualPayment.current = true
      try {
        let result: Awaited<ReturnType<typeof manualMpesaStatusAction>> | undefined
        try {
          result = await callAction(() => manualMpesaStatusAction())
        } catch (error) {
          console.error("Could not check M-Pesa payment status", error)
          return
        }
        if (!active || !result) {
          return
        }
        if (result.kind === "done") {
          window.clearInterval(timer)
          finish(result.orderId)
        } else if (result.kind === "rejected" || result.kind === "missing") {
          window.clearInterval(timer)
          setError(
            result.kind === "rejected"
              ? "We could not verify that M-Pesa payment. Check the message or contact us, then submit it again."
              : "We could not find your M-Pesa submission. Please try again."
          )
          setStage({ name: "choose" })
        }
      } finally {
        checkingManualPayment.current = false
      }
    }
    const timer = window.setInterval(check, 5000)
    void check()
    return () => {
      active = false
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  const start = () =>
    startTransition(async () => {
      setError(null)
      const result = await callAction(() => startPaymentAction({ optionId, providerId, message }))
      if (!result) {
        return
      }
      if (result.kind === "error") {
        setError(result.error)
      } else if (result.kind === "done") {
        finish(result.orderId)
      } else if (result.kind === "submitted") {
        setStage({ name: "submitted" })
      } else {
        setStage({ name: "stripe", clientSecret: result.clientSecret })
      }
    })

  if (stage.name === "submitted") {
    return (
      <div className="mpesa-wait" role="status" aria-live="polite">
        <h3>M-Pesa message received</h3>
        <p>
          Your payment message is waiting for manual verification. We&apos;ll create your order after we confirm the
          payment. Please don&apos;t change your cart while it is being reviewed.
        </p>
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
              {payment.id === "manual_mpesa" && providerId === payment.id ? (
                <span className="choice-extra">
                  <strong>Confirmation message</strong>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={5}
                    maxLength={1000}
                    required
                    placeholder="Paste the full M-Pesa message, including the transaction code"
                    aria-label="M-Pesa confirmation message"
                  />
                  <small>
                    Pay exactly {formatMoney(manualPaymentAmount, currency)} in your M-Pesa app first. Your order is
                    created after staff verifies payment.
                  </small>
                </span>
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
            : providerId === "manual_mpesa"
              ? "Submit M-Pesa message"
              : "Place Order"}
      </button>
    </form>
  )
}
