import { MedusaError } from "@medusajs/framework/utils"
export type ShippoAddress = {
  name: string
  street1: string
  street2?: string
  city: string
  state?: string
  zip: string
  country: string
  phone?: string
  email?: string
}

export type ShippoOptions = {
  apiKey?: string
  fromAddress: ShippoAddress
  fallbackAmountKes?: number
  fallbackAmountUsd?: number
}

export type ShippoParcel = {
  lengthCm: number
  widthCm: number
  heightCm: number
  weightKg: number
}

export type ShippoCustomsItem = {
  description: string
  quantity: number
  netWeightKg: number
  valueAmount: number
  valueCurrency: string
  originCountry: string
  /** Harmonized System code. 4901.99 covers printed books. */
  tariffNumber?: string
}

export type ShippoRate = {
  object_id: string
  amount: string
  currency: string
  amount_local?: string
  currency_local?: string
  provider: string
  servicelevel: { name?: string; token?: string }
  estimated_days?: number
}

type ShippoShipmentResponse = {
  object_id: string
  rates: ShippoRate[]
  messages?: { text?: string }[]
}

type ShippoValidationResponse = {
  validation_results?: {
    is_valid?: boolean
    messages?: { text?: string }[]
  }
}

type ShippoTransactionResponse = {
  object_id: string
  status: string
  label_url?: string
  tracking_number?: string
  tracking_url_provider?: string
  commercial_invoice_url?: string
  messages?: { text?: string }[]
}

export class ShippoClient {
  protected options_: ShippoOptions

  constructor(options: ShippoOptions) {
    this.options_ = options
  }

  isConfigured() {
    return Boolean(this.options_.apiKey)
  }

  protected headers() {
    return {
      Authorization: `ShippoToken ${this.options_.apiKey}`,
      "Content-Type": "application/json",
    }
  }

  async validateAddress(address: ShippoAddress) {
    if (!this.isConfigured()) {
      return { is_valid: true, messages: [] as string[] }
    }

    const response = await fetch("https://api.goshippo.com/addresses/", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        ...address,
        validate: true,
      }),
    })

    const data = (await response.json()) as ShippoValidationResponse & {
      detail?: string
    }

    if (!response.ok) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, data.detail || "Shippo address validation failed")
    }

    return {
      is_valid: data.validation_results?.is_valid !== false,
      messages:
        data.validation_results?.messages?.map((m) => m.text || "").filter(Boolean) ||
        [],
    }
  }

  async getRates(input: {
    to: ShippoAddress
    parcel: ShippoParcel
    customsDeclarationId?: string
  }): Promise<ShippoRate[]> {
    if (!this.isConfigured()) {
      return []
    }

    const { parcel } = input
    const response = await fetch("https://api.goshippo.com/shipments/", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        address_from: this.options_.fromAddress,
        address_to: input.to,
        parcels: [
          {
            length: parcel.lengthCm.toFixed(1),
            width: parcel.widthCm.toFixed(1),
            height: parcel.heightCm.toFixed(1),
            distance_unit: "cm",
            weight: Math.max(parcel.weightKg, 0.1).toFixed(3),
            mass_unit: "kg",
          },
        ],
        ...(input.customsDeclarationId ? { customs_declaration: input.customsDeclarationId } : {}),
        async: false,
      }),
    })

    const data = (await response.json()) as ShippoShipmentResponse & {
      detail?: string
    }

    if (!response.ok) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, data.detail || "Shippo shipment rating failed")
    }

    return data.rates || []
  }

  /** Creates a customs declaration (commercial invoice data) for exports. */
  async createCustomsDeclaration(input: {
    signer: string
    items: ShippoCustomsItem[]
    invoiceNumber?: string
  }): Promise<{ object_id: string }> {
    const response = await fetch("https://api.goshippo.com/customs/declarations/", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        contents_type: "MERCHANDISE",
        contents_explanation: "Printed books",
        non_delivery_option: "RETURN",
        certify: true,
        certify_signer: input.signer,
        commercial_invoice: true,
        invoice: input.invoiceNumber,
        incoterm: "DDU",
        items: input.items.map((item) => ({
          description: item.description.slice(0, 100),
          quantity: item.quantity,
          net_weight: item.netWeightKg.toFixed(3),
          mass_unit: "kg",
          value_amount: item.valueAmount.toFixed(2),
          value_currency: item.valueCurrency.toUpperCase(),
          origin_country: item.originCountry,
          tariff_number: item.tariffNumber || "490199",
        })),
      }),
    })
    const data = (await response.json()) as { object_id?: string; detail?: string }
    if (!response.ok || !data.object_id) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, data.detail || "Shippo customs declaration failed")
    }
    return { object_id: data.object_id }
  }

  async createLabel(rateObjectId: string): Promise<ShippoTransactionResponse> {
    if (!this.isConfigured()) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Shippo API key is not configured")
    }

    const response = await fetch("https://api.goshippo.com/transactions/", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        rate: rateObjectId,
        label_file_type: "PDF",
        async: false,
      }),
    })

    const data = (await response.json()) as ShippoTransactionResponse & {
      detail?: string
    }

    if (!response.ok || data.status === "ERROR") {
      const message =
        data.messages?.map((m) => m.text).join("; ") ||
        data.detail ||
        "Shippo label creation failed"
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, message)
    }

    return data
  }
}
