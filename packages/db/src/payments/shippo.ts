/**
 * Shippo: address validation, live rates and labels, over its REST API.
 *
 * Ported from the Medusa fulfillment provider. Every call degrades rather
 * than throws when Shippo is not configured or is unreachable, because a
 * courier API being down must not stop a shopper checking out - the flat
 * rates in `shipping_option` carry the order instead.
 */
export type ShippoAddress = {
  name: string
  street1: string
  street2?: string
  city: string
  state?: string
  zip?: string
  country: string
  phone?: string
  email?: string
}

export type ShippoParcel = { lengthCm: number; widthCm: number; heightCm: number; weightKg: number }

export type ShippoConfig = { apiKey: string; fromAddress: ShippoAddress }

export type ShippoRate = {
  objectId: string
  provider: string
  service: string
  amount: number
  currency: string
  estimatedDays: number | null
}

export function shippoConfigured(config: Partial<ShippoConfig>): config is ShippoConfig {
  return Boolean(config.apiKey && config.fromAddress)
}

function headers(config: ShippoConfig) {
  return { Authorization: `ShippoToken ${config.apiKey}`, "Content-Type": "application/json" }
}

export async function validateAddress(
  config: ShippoConfig,
  address: ShippoAddress
): Promise<{ isValid: boolean; messages: string[] }> {
  try {
    const response = await fetch("https://api.goshippo.com/addresses/", {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({ ...address, validate: true }),
    })
    const data = (await response.json()) as {
      validation_results?: { is_valid?: boolean; messages?: { text?: string }[] }
      detail?: string
    }
    if (!response.ok) {
      return { isValid: true, messages: [] }
    }
    return {
      isValid: data.validation_results?.is_valid !== false,
      messages: (data.validation_results?.messages || []).map((m) => m.text || "").filter(Boolean),
    }
  } catch {
    // An unreachable validator must not block a real address.
    return { isValid: true, messages: [] }
  }
}

export async function getRates(
  config: ShippoConfig,
  input: { to: ShippoAddress; parcel: ShippoParcel }
): Promise<ShippoRate[]> {
  try {
    const response = await fetch("https://api.goshippo.com/shipments/", {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({
        address_from: config.fromAddress,
        address_to: input.to,
        parcels: [
          {
            length: input.parcel.lengthCm.toFixed(1),
            width: input.parcel.widthCm.toFixed(1),
            height: input.parcel.heightCm.toFixed(1),
            distance_unit: "cm",
            weight: Math.max(input.parcel.weightKg, 0.1).toFixed(3),
            mass_unit: "kg",
          },
        ],
        async: false,
      }),
    })
    const data = (await response.json()) as {
      rates?: {
        object_id: string
        provider: string
        servicelevel?: { name?: string }
        amount: string
        currency: string
        estimated_days?: number
      }[]
    }
    if (!response.ok) {
      return []
    }
    return (data.rates || []).map((rate) => ({
      objectId: rate.object_id,
      provider: rate.provider,
      service: rate.servicelevel?.name || rate.provider,
      amount: Number(rate.amount),
      currency: rate.currency,
      estimatedDays: rate.estimated_days ?? null,
    }))
  } catch {
    return []
  }
}

export async function buyLabel(
  config: ShippoConfig,
  rateObjectId: string
): Promise<{ trackingNumber: string; trackingUrl: string; labelUrl: string } | null> {
  try {
    const response = await fetch("https://api.goshippo.com/transactions/", {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({ rate: rateObjectId, label_file_type: "PDF", async: false }),
    })
    const data = (await response.json()) as {
      status?: string
      tracking_number?: string
      tracking_url_provider?: string
      label_url?: string
    }
    if (!response.ok || data.status !== "SUCCESS") {
      return null
    }
    return {
      trackingNumber: data.tracking_number || "",
      trackingUrl: data.tracking_url_provider || "",
      labelUrl: data.label_url || "",
    }
  } catch {
    return null
  }
}

/**
 * The parcel a cart ships in: books stack, so the heights add up while the
 * footprint stays that of the largest book.
 */
export function parcelFor(
  lines: { length: number; width: number; height: number; weight: number; quantity: number }[]
): ShippoParcel {
  const fallback = { length: 21, width: 15, height: 3, weight: 450 }
  const items = lines.filter((line) => line.length && line.width)
  const sized = items.length ? items : lines.map(() => ({ ...fallback, quantity: 1 }))
  return {
    lengthCm: Math.max(...sized.map((line) => line.length || fallback.length)),
    widthCm: Math.max(...sized.map((line) => line.width || fallback.width)),
    heightCm: Math.max(
      1,
      sized.reduce((total, line) => total + (line.height || fallback.height) * (line.quantity || 1), 0)
    ),
    weightKg:
      sized.reduce((total, line) => total + (line.weight || fallback.weight) * (line.quantity || 1), 0) / 1000,
  }
}
