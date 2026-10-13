"use client"

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { loadStripe, type Stripe } from "@stripe/stripe-js"
import { useState } from "react"
import { completeOrderAction } from "@/app/actions/cart"
import { stripePublishableKey } from "@/lib/config"
import { callAction } from "@/lib/stale-action"

let stripePromise: Promise<Stripe | null> | null = null
function getStripe() {
  stripePromise ??= loadStripe(stripePublishableKey)
  return stripePromise
}

function CardForm({ onDone }: { onDone: (orderId: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!stripe || !elements) {
          return
        }
        setBusy(true)
        setError(null)
        // 3D Secure challenges run in a modal; redirect-based methods come
        // back to /checkout/stripe-return, which completes the order.
        const { error: stripeError } = await stripe.confirmPayment({
          elements,
          redirect: "if_required",
          confirmParams: { return_url: `${window.location.origin}/checkout/stripe-return` },
        })
        if (stripeError) {
          setError(stripeError.message || "Your card was declined.")
          setBusy(false)
          return
        }
        const result = await callAction(() => completeOrderAction())
        if (!result) {
          return
        }
        if (result.kind === "done") {
          onDone(result.orderId)
        } else {
          setError(result.kind === "error" ? result.error : "Payment is processing. Please wait a moment and refresh.")
          setBusy(false)
        }
      }}
    >
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? (
        <p className="form-banner" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={!stripe || busy}>
        {busy ? "Processing…" : "Pay and Place Order"}
      </button>
    </form>
  )
}

export function StripePay({ clientSecret, onDone }: { clientSecret: string; onDone: (orderId: string) => void }) {
  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        appearance: { theme: "stripe", variables: { colorPrimary: "#0f5470", borderRadius: "4px" } },
      }}
    >
      <CardForm onDone={onDone} />
    </Elements>
  )
}
