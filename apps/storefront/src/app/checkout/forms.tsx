"use client"

import { keep } from "@/lib/keep-form"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import {
  saveAddressAction,
  manualMpesaStatusAction,
  mpesaCheckoutStatusAction,
  startPaymentAction,
  type FormState,
} from "@/app/actions/cart"
import type { PaymentChoice, ShippingOption } from "@/lib/cart"
import { formatMoney } from "@/lib/format"
import { AddressFields, type AddressValue, type CountryOption } from "@/components/address-fields"
import { callAction } from "@/lib/stale-action"
import { useShippingSelection } from "./shipping-selection"

const initial: FormState = { error: null }

export function CompletedPaymentRedirect() {
  const router = useRouter()
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    async function check() {
      try {
        const result = await callAction(() => mpesaCheckoutStatusAction())
        if (!active) return
        if (result?.kind === "done") router.replace(`/checkout/complete?order=${result.orderId}`)
        else setError(true)
      } catch (reason) {
        console.error("Could not retrieve completed M-Pesa checkout", reason)
        if (active) setError(true)
      }
    }
    void check()
    return () => { active = false }
  }, [router])
  return (
    <main className="wrap empty-state" role="status">
      {error ? "We could not retrieve your completed order. Please contact us." : "Retrieving your completed order…"}
    </main>
  )
}

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
  | { name: "mpesa"; review: boolean }

export function DeliveryPaymentForm({
  options,
  payments,
  currency,
  paymentRecipientName,
  paymentRecipientPhone,
  preferredProvider,
  manualPaymentPending,
  mpesaPaymentPending,
  defaultPhone,
}: {
  options: ShippingOption[]
  payments: PaymentChoice[]
  currency: string
  paymentRecipientName: string
  paymentRecipientPhone: string
  preferredProvider?: string | null
  manualPaymentPending: boolean
  mpesaPaymentPending: boolean
  defaultPhone: string
}) {
  const router = useRouter()
  const { optionId, setOptionId, total } = useShippingSelection()
  const [providerId, setProviderId] = useState(
    (preferredProvider && payments.some((p) => p.id === preferredProvider) ? preferredProvider : null) || payments[0]?.id || ""
  )
  const [message, setMessage] = useState("")
  const [phone, setPhone] = useState(defaultPhone)
  const [stage, setStage] = useState<Stage>(
    manualPaymentPending ? { name: "submitted" } : mpesaPaymentPending ? { name: "mpesa", review: false } : { name: "choose" }
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const checkingManualPayment = useRef(false)
  const checkingMpesa = useRef(false)

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

  useEffect(() => {
    if (stage.name !== "mpesa") return
    let active = true
    const check = async () => {
      if (checkingMpesa.current) return
      checkingMpesa.current = true
      try {
        const result = await callAction(() => mpesaCheckoutStatusAction())
        if (!active || !result) return
        if (result.kind === "done") {
          window.clearInterval(timer)
          finish(result.orderId)
        } else if (result.kind === "failed") {
          window.clearInterval(timer)
          setError("The M-Pesa payment was not completed. You can try again.")
          setStage({ name: "choose" })
        } else if (result.kind === "review" && !stage.review) {
          setStage({ name: "mpesa", review: true })
        } else if (result.kind === "missing") {
          window.clearInterval(timer)
          setError("We could not find this M-Pesa payment. Please contact us before trying again.")
        }
      } catch (error) {
        console.error("Could not check M-Pesa checkout status", error)
      } finally {
        checkingMpesa.current = false
      }
    }
    const timer = window.setInterval(check, 5000)
    const reviewTimer = stage.review ? undefined : window.setTimeout(() => {
      if (active) setStage({ name: "mpesa", review: true })
    }, 90000)
    void check()
    return () => {
      active = false
      window.clearInterval(timer)
      window.clearTimeout(reviewTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  const start = () =>
    startTransition(async () => {
      setError(null)
      const result = await callAction(() => startPaymentAction({ optionId, providerId, message, phone }))
      if (!result) {
        return
      }
      if (result.kind === "error") {
        setError(result.error)
      } else if (result.kind === "done") {
        finish(result.orderId)
      } else if (result.kind === "submitted") {
        setStage({ name: "submitted" })
      } else if (result.kind === "mpesa") {
        setStage({ name: "mpesa", review: false })
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

  if (stage.name === "mpesa") {
    return (
      <div className="mpesa-wait" role="status" aria-live="polite">
        <h3>{stage.review ? "Payment needs checking" : "Check your phone"}</h3>
        <p>
          {stage.review
            ? "We could not confirm the prompt yet. Please contact us before making another payment."
            : "Enter your M-Pesa PIN on your phone. Please keep this page open while we confirm payment."}
        </p>
        <p>Your order is created only after payment is confirmed.</p>
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
            <div key={payment.id} className="choice choice-stack">
              <input
                id={`payment-${payment.id}`}
                type="radio"
                name="payment_provider"
                value={payment.id}
                checked={providerId === payment.id}
                onChange={() => setProviderId(payment.id)}
                aria-describedby={`payment-hint-${payment.id}`}
                required
              />
              <label htmlFor={`payment-${payment.id}`} className="choice-label">{payment.label}</label>
              <span id={`payment-hint-${payment.id}`} className="choice-hint">{payment.hint}</span>
              {payment.id === "pp_daraja_daraja" && providerId === payment.id ? (
                <div className="choice-extra">
                  <label htmlFor="mpesa-phone" className="mpesa-confirmation-label">M-Pesa phone number</label>
                  <input id="mpesa-phone" type="tel" autoComplete="tel" value={phone}
                    onChange={(event) => setPhone(event.target.value)} required placeholder="07XX XXX XXX" />
                  <small>
                    {total === null ? "Choose a delivery option before paying." : `Amount to pay: ${formatMoney(Math.ceil(total), currency)}.`}
                  </small>
                </div>
              ) : null}
              {payment.id === "manual_mpesa" && providerId === payment.id ? (
                <div className="choice-extra">
                  <div className="mpesa-payment-details">
                    <strong>Send payment to</strong>
                    <dl>
                      {paymentRecipientName ? (
                        <div><dt>Recipient</dt><dd>{paymentRecipientName}</dd></div>
                      ) : null}
                      {paymentRecipientPhone ? (
                        <div><dt>M-Pesa number</dt><dd>{paymentRecipientPhone}</dd></div>
                      ) : null}
                      <div>
                        <dt>Amount to pay</dt>
                        <dd>{total === null ? "Choose delivery" : formatMoney(Math.ceil(total), currency)}</dd>
                      </div>
                    </dl>
                    <p>
                      {total === null
                        ? "Choose a delivery option before paying."
                        : "Pay this amount in your M-Pesa app before submitting your confirmation message."}
                    </p>
                    {!paymentRecipientName || !paymentRecipientPhone ? (
                      <p className="mpesa-recipient-warning">
                        M-Pesa recipient details are not fully configured. Please contact us before paying.
                      </p>
                    ) : null}
                  </div>
                  <label htmlFor="mpesa-confirmation" className="mpesa-confirmation-label">Confirmation message</label>
                  <textarea
                    id="mpesa-confirmation"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={5}
                    maxLength={1000}
                    required
                    placeholder="Paste the full M-Pesa message, including the transaction code"
                    aria-describedby="mpesa-confirmation-hint"
                  />
                  <small id="mpesa-confirmation-hint">Your order is created after staff verifies payment.</small>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="muted">No payment methods are configured for this region.</p>
        )}
      </fieldset>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending || !options.length || !payments.length}>
        {pending
          ? "Please wait…"
          : providerId === "pp_daraja_daraja"
              ? "Send M-Pesa prompt"
              : providerId === "manual_mpesa"
              ? "Submit M-Pesa message"
              : "Place Order"}
      </button>
    </form>
  )
}
