"use client"

import { useActionState, useEffect, useState } from "react"
import { newsletterAction, type NewsletterState } from "@/app/actions/account"
import { CloseIcon } from "./icons"
import { PhoneInput } from "./phone-input"

const initial: NewsletterState = { error: null }

export function NewsletterForm({
  source = "footer",
  defaultCountry = "KE",
  layout = "stacked",
}: {
  source?: string
  defaultCountry?: string
  layout?: "stacked" | "inline"
}) {
  const [state, action, pending] = useActionState(newsletterAction, initial)
  if (state.done) {
    return (
      <p className="newsletter-done" role="status">
        Thank you. You&apos;re on the list.
      </p>
    )
  }
  return (
    <form action={action} className={`newsletter-form is-${layout}`}>
      <input type="hidden" name="source" value={source} />
      <label>
        <span>Name</span>
        <input name="name" required autoComplete="name" placeholder="Your name" />
      </label>
      <label>
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      </label>
      <PhoneInput name="phone" label="Phone" required defaultCountry={defaultCountry} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Signing up…" : "Sign up"}
      </button>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}

const POPUP_KEY = "mr_newsletter_popup"

/** Shown once after a while on site, with "don't show again" (as on Darussalam). */
export function NewsletterPopup({ defaultCountry = "KE" }: { defaultCountry?: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = Boolean(window.localStorage.getItem(POPUP_KEY))
    } catch {
      dismissed = true
    }
    if (dismissed) {
      return
    }
    const timer = window.setTimeout(() => setOpen(true), 30000)
    return () => window.clearTimeout(timer)
  }, [])

  const close = (forever: boolean) => {
    setOpen(false)
    try {
      window.localStorage.setItem(POPUP_KEY, forever ? "never" : String(Date.now()))
    } catch {
      // Ignore storage errors.
    }
  }

  if (!open) {
    return null
  }
  return (
    <div className="popup-root" role="dialog" aria-modal="true" aria-labelledby="nl-popup-title">
      <div className="popup-scrim" onClick={() => close(false)} />
      <div className="popup-card">
        <button type="button" className="icon-btn popup-close" onClick={() => close(false)} aria-label="Close">
          <CloseIcon />
        </button>
        <p className="hero-kicker">Stay in the Know</p>
        <h2 id="nl-popup-title" className="serif-title">
          New arrivals, pre-orders and offers
        </h2>
        <p className="muted">Curated bookseller recommendations by email, and order help by phone. Unsubscribe anytime.</p>
        <NewsletterForm source="popup" defaultCountry={defaultCountry} />
        <label className="popup-never">
          <input type="checkbox" onChange={(e) => e.target.checked && close(true)} /> Don&apos;t show this popup again
        </label>
      </div>
    </div>
  )
}
