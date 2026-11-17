"use client"

import { createContext, useContext, useState } from "react"
import { SummaryRows } from "@/components/order-summary"
import type { ShippingOption } from "@/lib/cart"
import { checkoutTotal } from "@/lib/checkout-total"

type Selection = {
  optionId: string
  setOptionId: (id: string) => void
  shipping: number | null
  total: number | null
}

const ShippingContext = createContext<Selection | null>(null)

export function ShippingSelection({
  children,
  options,
  selectedOptionId,
  subtotal,
  discount,
  tax,
}: {
  children: React.ReactNode
  options: ShippingOption[]
  selectedOptionId?: string
  subtotal: number
  discount: number
  tax: number
}) {
  const [optionId, setOptionId] = useState(
    options.some((option) => option.id === selectedOptionId) ? selectedOptionId! : options[0]?.id || ""
  )
  const option = options.find((item) => item.id === optionId)
  const shipping = typeof option?.amount === "number" ? option.amount : null
  const total = checkoutTotal(subtotal, discount, tax, shipping)

  return (
    <ShippingContext.Provider value={{ optionId, setOptionId, shipping, total }}>
      {children}
    </ShippingContext.Provider>
  )
}

export function useShippingSelection() {
  const selection = useContext(ShippingContext)
  if (!selection) throw new Error("Shipping selection is unavailable.")
  return selection
}

export function CheckoutSummaryRows({
  count,
  currency,
  itemSubtotal,
  discount,
  tax,
}: {
  count: number
  currency: string
  itemSubtotal: number
  discount: number
  tax: number
}) {
  const { shipping, total } = useShippingSelection()
  return <SummaryRows count={count} currency={currency} itemSubtotal={itemSubtotal} discount={discount} tax={shipping === null ? null : tax} shipping={shipping} total={total} />
}
