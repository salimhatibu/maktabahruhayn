import { buildParcel, volumetricWeightKg } from "../parcel"

describe("buildParcel", () => {
  it("stacks books on the largest footprint and adds packaging", () => {
    const parcel = buildParcel([
      { quantity: 2, weight: 870, length: 21, width: 16, height: 3.5 },
      { quantity: 1, weight: 100, length: 20, width: 14, height: 0.5 },
    ])
    expect(parcel.lengthCm).toBe(23)
    expect(parcel.widthCm).toBe(18)
    expect(parcel.heightCm).toBe(9.5)
    expect(parcel.weightKg).toBeCloseTo((870 * 2 + 100 + 150) / 1000)
  })

  it("falls back to a standard hardback when a variant has no dimensions", () => {
    const parcel = buildParcel([{ quantity: 1 }])
    expect(parcel.weightKg).toBeCloseTo(0.85)
    expect(volumetricWeightKg(parcel)).toBeCloseTo((23 * 17 * 5) / 5000)
  })
})

describe("Shippo provider pricing", () => {
  const RATES = { USD: 1, KES: 130, GBP: 0.75 }

  beforeEach(() => {
    process.env.FREE_SHIPPING_THRESHOLD_USD = "60"
    process.env.FREE_SHIPPING_THRESHOLD_KES = "7500"
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", rates: RATES }),
    }) as unknown as typeof fetch
  })

  async function provider(rates: Record<string, unknown>[]) {
    let Service!: typeof import("../service").default
    jest.isolateModules(() => {
      Service = (require("../service") as typeof import("../service")).default
    })
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    const service = new Service({ logger }, {
      apiKey: "test",
      fromAddress: { name: "Store", street1: "Moi Ave", city: "Nairobi", zip: "00100", country: "KE" },
    })
    ;(service as unknown as { client_: { getRates: () => Promise<unknown> } }).client_.getRates = jest
      .fn()
      .mockResolvedValue(rates)
    return service
  }

  const context = (currency: string, unitPrice: number) =>
    ({
      currency_code: currency,
      shipping_address: { address_1: "1 High St", city: "London", country_code: "gb" },
      items: [{ quantity: 1, unit_price: unitPrice, variant: { weight: 800, length: 21, width: 15, height: 3 } }],
    }) as never

  it("converts the carrier's USD quote into the cart currency", async () => {
    const service = await provider([
      { object_id: "r1", amount: "20.00", currency: "USD", provider: "DHL Express", servicelevel: { token: "dhl_express_worldwide" } },
    ])
    const price = await service.calculatePrice({ id: "shippo-express" } as never, {} as never, context("gbp", 20))
    expect(price.calculated_amount).toBe(15)
  })

  it("uses the origin-currency quote directly when it matches", async () => {
    const service = await provider([
      { object_id: "r1", amount: "20.00", currency: "USD", amount_local: "2600", currency_local: "KES", provider: "DHL Express", servicelevel: {} },
    ])
    const price = await service.calculatePrice({ id: "shippo-express" } as never, {} as never, context("kes", 1000))
    expect(price.calculated_amount).toBe(2600)
  })

  it("makes postal shipping free above the converted threshold", async () => {
    const service = await provider([])
    // 60 USD at 0.75 is 45 GBP, shelf-rounded up to 46.
    const below = await service.calculatePrice({ id: "shippo-postal" } as never, {} as never, context("gbp", 40))
    const above = await service.calculatePrice({ id: "shippo-postal" } as never, {} as never, context("gbp", 46))
    expect(below.calculated_amount).toBeGreaterThan(0)
    expect(above.calculated_amount).toBe(0)
  })

  it("never makes express shipping free", async () => {
    const service = await provider([])
    const price = await service.calculatePrice({ id: "shippo-express" } as never, {} as never, context("usd", 500))
    expect(price.calculated_amount).toBeGreaterThan(0)
  })
})
