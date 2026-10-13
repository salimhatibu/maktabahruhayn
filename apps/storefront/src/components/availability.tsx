import type { Availability } from "@/lib/medusa"

export function availabilityText(a: Availability | null): string | null {
  switch (a?.status) {
    case "low_stock":
      return `Only ${a.quantity} left in stock`
    case "backorder":
      return "On backorder: ships in 2-3 weeks"
    case "preorder":
      return "Pre-order: ships on release"
    case "out_of_stock":
      return "Out of stock"
    case "in_stock":
      return "In stock"
    default:
      return null
  }
}

export function canPurchase(a: Availability | null) {
  return a?.status !== "out_of_stock"
}

export function AvailabilityBadge({ availability }: { availability: Availability | null }) {
  const text = availabilityText(availability)
  if (!text || availability?.status === "in_stock") {
    return null
  }
  return <span className={`stock-badge stock-${availability!.status}`}>{text}</span>
}
