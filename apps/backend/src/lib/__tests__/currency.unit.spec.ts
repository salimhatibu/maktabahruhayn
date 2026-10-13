import { CURRENCY_REGIONS, roundPrice } from "../currency-regions"

describe("roundPrice", () => {
  it("charm-prices two-decimal currencies at .99, never more than one unit up", () => {
    expect(roundPrice(26.46, "gbp")).toBe(26.99)
    expect(roundPrice(26, "gbp")).toBe(25.99)
    expect(roundPrice(0.5, "eur")).toBe(0.5)
  })

  it("rounds whole-unit currencies to tens, and hundreds above 10,000", () => {
    expect(roundPrice(2975.4, "kes")).toBe(2980)
    expect(roundPrice(30612, "ngn")).toBe(30600)
    expect(roundPrice(3, "kes")).toBe(10)
  })

  it("returns 0 for invalid amounts", () => {
    expect(roundPrice(Number.NaN, "usd")).toBe(0)
    expect(roundPrice(-5, "usd")).toBe(0)
  })
})

describe("CURRENCY_REGIONS", () => {
  it("assigns every country to exactly one region", () => {
    const all = CURRENCY_REGIONS.flatMap((r) => r.countries)
    expect(new Set(all).size).toBe(all.length)
  })

  it("offers M-Pesa only in the Kenya (KES) region", () => {
    const withMpesa = CURRENCY_REGIONS.filter((r) => r.payments.includes("daraja_daraja"))
    expect(withMpesa.map((r) => r.currency)).toEqual(["kes"])
  })
})
