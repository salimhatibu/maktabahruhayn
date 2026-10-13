"use client"

import { useActionState, useState } from "react"
import {
  applyPromoAction,
  removePromoAction,
  saveGiftOptionsAction,
  type FormState,
} from "@/app/actions/cart"
import type { GiftOptions } from "@/lib/cart"
import { GiftIcon } from "@/components/icons"

const initial: FormState = { error: null }

export function PromoForm({ applied }: { applied: string[] }) {
  const [state, action, pending] = useActionState(applyPromoAction, initial)
  return (
    <div className="promo">
      <form action={action} className="promo-form">
        <label htmlFor="promo-code">Promo Code</label>
        <div>
          <input id="promo-code" name="code" placeholder="Enter code" autoComplete="off" />
          <button type="submit" className="btn btn-outline btn-sm" disabled={pending}>
            Apply
          </button>
        </div>
      </form>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p className="form-success">{state.message}</p> : null}
      {applied.length ? (
        <ul className="applied-codes">
          {applied.map((code) => (
            <li key={code}>
              <span>{code}</span>
              <form action={removePromoAction}>
                <input type="hidden" name="code" value={code} />
                <button type="submit" className="text-btn">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function GiftForm({ options }: { options: GiftOptions }) {
  const [state, action, pending] = useActionState(saveGiftOptionsAction, initial)
  const [isGift, setIsGift] = useState(options.is_gift)
  return (
    <form action={action} className="gift-form">
      <label className="gift-toggle">
        <input type="checkbox" name="is_gift" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} />
        <GiftIcon size={18} /> Make it a Gift
      </label>
      {isGift ? (
        <>
          <label className="gift-toggle">
            <input type="checkbox" name="gift_wrap" defaultChecked={options.gift_wrap} /> Add gift wrapping
          </label>
          <label className="gift-message">
            Gift message (printed on a card, prices hidden on the packing slip)
            <textarea name="gift_message" rows={3} maxLength={300} defaultValue={options.gift_message} />
          </label>
        </>
      ) : null}
      <button type="submit" className="btn btn-outline btn-sm" disabled={pending}>
        Save
      </button>
      {state.message ? <span className="form-success">{state.message}</span> : null}
      {state.error ? <span className="form-error">{state.error}</span> : null}
    </form>
  )
}
