"use client"

import { useState, useTransition } from "react"
import { addToCartAction } from "@/app/actions/cart"
import { useCart } from "./cart-context"
import { callAction } from "@/lib/stale-action"

export function AddToCartButton({
  variantId,
  label = "Add to Cart",
  className = "btn btn-primary",
}: {
  variantId: string
  label?: string
  className?: string
}) {
  const { setSummary, openDrawer } = useCart()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await callAction(() => addToCartAction(variantId))
            if (!result) {
              return
            }
            if (result.ok) {
              setSummary(result.cart)
              openDrawer()
            } else {
              setError(result.error)
            }
          })
        }
      >
        {pending ? "Adding…" : label}
      </button>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </>
  )
}
