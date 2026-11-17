/** Adds the selected delivery price to the cart using integer minor units. */
export function checkoutTotal(subtotal: number, discount: number, tax: number, shipping: number | null): number | null {
  if (shipping === null) return null
  const minor = Math.round(subtotal * 100) - Math.round(discount * 100) + Math.round(tax * 100) + Math.round(shipping * 100)
  return Math.max(0, minor) / 100
}
