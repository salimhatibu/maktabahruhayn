"use client"

import { useRef } from "react"
import { useFormStatus } from "react-dom"
import { updateQuantityAction } from "@/app/actions/cart"
import { MinusIcon, PlusIcon } from "./icons"

function Controls({ quantity, title }: { quantity: number; title: string }) {
  const { pending } = useFormStatus()
  return (
    <div className={`stepper ${pending ? "is-pending" : ""}`}>
      <button
        type="submit"
        name="quantity"
        value={quantity - 1}
        disabled={pending || quantity <= 1}
        aria-label={`Decrease quantity of ${title}`}
      >
        <MinusIcon size={18} />
      </button>
      <input
        type="number"
        name="quantity_input"
        min={1}
        max={99}
        defaultValue={quantity}
        key={quantity}
        aria-label={`Quantity of ${title}`}
        onBlur={(event) => {
          const value = Number(event.currentTarget.value)
          if (value !== quantity && value >= 1) {
            const form = event.currentTarget.form
            const hidden = form?.elements.namedItem("quantity_direct") as HTMLInputElement | null
            if (hidden && form) {
              hidden.value = String(value)
              form.requestSubmit()
            }
          }
        }}
      />
      <button
        type="submit"
        name="quantity"
        value={quantity + 1}
        disabled={pending || quantity >= 99}
        aria-label={`Increase quantity of ${title}`}
      >
        <PlusIcon size={18} />
      </button>
    </div>
  )
}

export function QuantityStepper({ lineId, quantity, title }: { lineId: string; quantity: number; title: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  return (
    <form
      ref={formRef}
      action={(formData) => {
        const direct = formData.get("quantity_direct")
        if (direct && !formData.get("quantity")) {
          formData.set("quantity", String(direct))
        }
        return updateQuantityAction(formData)
      }}
    >
      <input type="hidden" name="line_id" value={lineId} />
      <input type="hidden" name="quantity_direct" defaultValue="" />
      <Controls quantity={quantity} title={title} />
    </form>
  )
}
