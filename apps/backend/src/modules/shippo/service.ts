import {
  AbstractFulfillmentProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateShippingOptionDTO,
  FulfillmentOption,
  CreateFulfillmentResult,
  FulfillmentItemDTO,
  FulfillmentOrderDTO,
  FulfillmentDTO,
} from "@medusajs/framework/types"
import { convertAmount } from "../../lib/fx-rates"
import { getRuntimeSetting } from "../../lib/runtime-settings"
import {
  ShippoClient,
  type ShippoAddress,
  type ShippoOptions,
  type ShippoParcel,
  type ShippoRate,
} from "./client"
import { FREE_SHIPPING_OPTION_ID, qualifiesForFreeShipping } from "./free-shipping"
import { buildParcel, type ParcelLine } from "./parcel"

type CartItemWithVariant = {
  quantity?: unknown
  unit_price?: unknown
  title?: string | null
  product_title?: string | null
  variant?: Partial<Record<"weight" | "length" | "width" | "height", number | null>> | null
}

function parcelLines(items: CartItemWithVariant[] | undefined | null): ParcelLine[] {
  return (items || []).map((item) => ({
    quantity: Number(item.quantity || 1),
    weight: item.variant?.weight,
    length: item.variant?.length,
    width: item.variant?.width,
    height: item.variant?.height,
  }))
}

type InjectedDependencies = {
  logger: {
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
  }
}

const SERVICE_OPTIONS = [
  {
    id: "shippo-express",
    name: "International Express (DHL / FedEx / UPS)",
    preferred: ["dhl_express", "fedex", "ups"],
  },
  {
    id: "shippo-postal",
    name: "International Postal / EMS",
    // Posta Kenya / EMS where Shippo carries it; otherwise national posts.
    preferred: ["posta", "kenya_post", "ems", "usps", "royal_mail", "canada_post", "australia_post"],
  },
] as const

class ShippoFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "shippo"

  protected logger_: InjectedDependencies["logger"]
  protected options_: ShippoOptions
  protected client_: ShippoClient

  constructor(container: InjectedDependencies, options: ShippoOptions) {
    super()
    this.logger_ = container.logger
    this.options_ = options
    this.client_ = new ShippoClient(options)
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return SERVICE_OPTIONS.map((option) => ({
      id: option.id,
      name: option.name,
    }))
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return SERVICE_OPTIONS.some((option) => option.id === data.id)
  }

  async canCalculate(_data: CreateShippingOptionDTO): Promise<boolean> {
    return true
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: {
      shipping_address?: {
        address_1?: string | null
        city?: string | null
        postal_code?: string | null
        country_code?: string | null
        province?: string | null
        phone?: string | null
        first_name?: string | null
        last_name?: string | null
      } | null
    }
  ): Promise<Record<string, unknown>> {
    const address = context.shipping_address
    if (!address?.address_1 || !address.city || !address.country_code) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A complete shipping address is required before selecting Shippo rates"
      )
    }

    const shippoAddress = this.toShippoAddress(address)
    const validation = await this.client_.validateAddress(shippoAddress)

    if (!validation.is_valid) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid shipping address: ${validation.messages.join("; ") || "check details"}`
      )
    }

    const items = (context as { items?: CartItemWithVariant[] }).items
    return {
      ...data,
      option_id: optionData.id,
      validated_address: shippoAddress,
      // Kept on the shipping method so labels use the same parcel as the quote.
      parcel: buildParcel(parcelLines(items)),
    }
  }

  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const currency = String(
      (context as { currency_code?: string }).currency_code || "usd"
    ).toLowerCase()
    const items = (context.items || []) as CartItemWithVariant[]

    const itemSubtotal = items.reduce(
      (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 1),
      0
    )

    if (
      optionData.id === FREE_SHIPPING_OPTION_ID &&
      (await qualifiesForFreeShipping(currency, itemSubtotal))
    ) {
      return { calculated_amount: 0, is_calculated_price_tax_inclusive: true }
    }

    const fallback = await this.fallbackAmount(currency)

    try {
      const address = context.shipping_address
      if (!address?.address_1 || !address.country_code) {
        return { calculated_amount: fallback, is_calculated_price_tax_inclusive: true }
      }

      const rates = await this.client_.getRates({
        to: this.toShippoAddress(address),
        parcel: buildParcel(parcelLines(items)),
      })
      const rate = this.pickRate(rates, String(optionData.id))
      if (!rate) {
        return { calculated_amount: fallback, is_calculated_price_tax_inclusive: true }
      }

      const amount = await this.rateInCurrency(rate, currency)
      return {
        calculated_amount: amount ?? fallback,
        is_calculated_price_tax_inclusive: true,
      }
    } catch (error) {
      this.logger_.warn("Shippo rate calculation failed; using fallback", error)
      return { calculated_amount: fallback, is_calculated_price_tax_inclusive: true }
    }
  }

  /**
   * Shippo quotes in the carrier's currency (usually USD), and in the origin
   * country's currency as amount_local. Converts to the cart currency.
   */
  protected async rateInCurrency(rate: ShippoRate, currency: string): Promise<number | null> {
    const target = currency.toUpperCase()
    if (rate.currency_local?.toUpperCase() === target && rate.amount_local) {
      return Math.round(Number(rate.amount_local) * 100) / 100
    }
    const converted = await convertAmount(Number(rate.amount), rate.currency || "USD", target)
    if (converted === null) {
      return null
    }
    // Round up to the currency's minor unit so we never under-charge.
    return Math.ceil(converted * 100) / 100
  }

  /** Flat fallback when Shippo is unavailable, in the cart currency. */
  protected async fallbackAmount(currency: string): Promise<number> {
    const settings = getRuntimeSetting("shipping")
    if (currency === "kes") {
      return settings.fallbackKes || this.options_.fallbackAmountKes || 800
    }
    const usd = settings.fallbackUsd || this.options_.fallbackAmountUsd || 25
    const converted = await convertAmount(usd, "usd", currency).catch(() => null)
    return converted ? Math.ceil(converted) : usd
  }

  protected pickRate(rates: ShippoRate[], optionId: string): ShippoRate | undefined {
    if (!rates.length) {
      return undefined
    }
    const preferred = SERVICE_OPTIONS.find((o) => o.id === optionId)
    const matches = rates.filter((rate) =>
      preferred?.preferred.some((token) =>
        `${rate.provider} ${rate.servicelevel?.token || ""}`.toLowerCase().includes(token)
      )
    )
    const pool = matches.length ? matches : rates
    return [...pool].sort((a, b) => Number(a.amount) - Number(b.amount))[0]
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    _fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>,
    _additionalData?: Record<string, unknown>
  ): Promise<CreateFulfillmentResult> {
    const shippingAddress = order?.shipping_address
    if (!shippingAddress) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Order shipping address is required to create a Shippo label"
      )
    }

    const to = this.toShippoAddress(shippingAddress)
    const parcel =
      (data.parcel as ShippoParcel | undefined) ||
      buildParcel(items.map((item) => ({ quantity: Number(item.quantity || 1) })))

    // Exports leave Kenya, so every international label needs a customs
    // declaration and commercial invoice.
    let customsDeclarationId: string | undefined
    const international = to.country !== this.options_.fromAddress.country.toUpperCase()
    if (international && this.client_.isConfigured()) {
      const orderItems = (order?.items || []) as { id?: string; unit_price?: unknown }[]
      const currency = String(order?.currency_code || "usd")
      const totalQty = items.reduce((n, i) => n + Number(i.quantity || 1), 0) || 1
      const declaration = await this.client_.createCustomsDeclaration({
        signer: this.options_.fromAddress.name,
        invoiceNumber: order?.display_id ? `MR-${order.display_id}` : undefined,
        items: items.map((item) => {
          const line = orderItems.find((o) => o.id === item.line_item_id)
          const qty = Number(item.quantity || 1)
          return {
            description: String(item.title || "Book"),
            quantity: qty,
            netWeightKg: (parcel.weightKg / totalQty) * qty,
            valueAmount: Number(line?.unit_price || 0) * qty,
            valueCurrency: currency,
            originCountry: this.options_.fromAddress.country.toUpperCase(),
          }
        }),
      })
      customsDeclarationId = declaration.object_id
    }

    const rates = await this.client_.getRates({ to, parcel, customsDeclarationId })
    const rate = this.pickRate(rates, String(data.option_id || ""))

    if (!rate) {
      return {
        data: {
          ...data,
          customs_declaration_id: customsDeclarationId,
          status: "awaiting_manual_label",
          message: "No Shippo rates available; create the label manually",
        },
        labels: [],
      }
    }

    const transaction = await this.client_.createLabel(rate.object_id)

    return {
      data: {
        ...data,
        shippo_rate_id: rate.object_id,
        shippo_transaction_id: transaction.object_id,
        customs_declaration_id: customsDeclarationId,
        carrier: rate.provider,
        service: rate.servicelevel?.name,
        tracking_number: transaction.tracking_number,
        tracking_url: transaction.tracking_url_provider,
        label_url: transaction.label_url,
        commercial_invoice_url: transaction.commercial_invoice_url,
        status: transaction.status,
      },
      labels: transaction.label_url
        ? [
            {
              tracking_number: transaction.tracking_number || "",
              tracking_url: transaction.tracking_url_provider || "",
              label_url: transaction.label_url,
            },
          ]
        : [],
    }
  }

  async cancelFulfillment(data: Record<string, unknown>) {
    this.logger_.info("Shippo fulfillments are canceled in Shippo dashboard", data)
    return { ...data, status: "canceled" }
  }

  async getFulfillmentDocuments(_data: Record<string, unknown>) {
    return []
  }

  async createReturnFulfillment(
    fulfillment: Record<string, unknown>
  ): Promise<CreateFulfillmentResult> {
    return {
      data: { ...fulfillment, status: "return_manual" },
      labels: [],
    }
  }

  async getReturnDocuments(_data: Record<string, unknown>) {
    return []
  }

  async getShipmentDocuments(_data: Record<string, unknown>) {
    return []
  }

  async retrieveDocuments(
    _fulfillmentData: Record<string, unknown>,
    _documentType: string
  ) {
    return
  }

  protected toShippoAddress(address: {
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    postal_code?: string | null
    country_code?: string | null
    province?: string | null
    phone?: string | null
    first_name?: string | null
    last_name?: string | null
    company?: string | null
  }): ShippoAddress {
    return {
      name:
        [address.first_name, address.last_name].filter(Boolean).join(" ") ||
        address.company ||
        "Customer",
      street1: address.address_1 || "",
      street2: address.address_2 || undefined,
      city: address.city || "",
      state: address.province || undefined,
      zip: address.postal_code || "00000",
      country: (address.country_code || "").toUpperCase(),
      phone: address.phone || undefined,
    }
  }
}

export default ShippoFulfillmentProviderService
