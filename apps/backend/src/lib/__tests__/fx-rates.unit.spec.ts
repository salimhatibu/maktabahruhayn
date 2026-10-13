const RATES = { USD: 1, KES: 129.7, GBP: 0.756, EUR: 0.87 }

type FxModule = typeof import("../fx-rates")

/** Fresh module per test so the in-memory rate cache starts empty. */
function load(): FxModule {
  let mod: FxModule | undefined
  jest.isolateModules(() => {
    mod = require("../fx-rates") as FxModule
  })
  return mod!
}

describe("fx-rates", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", rates: RATES, time_last_update_utc: "Sat, 10 Oct 2026 00:00:00 +0000" }),
    }) as unknown as typeof fetch
  })

  it("converts between any two currencies through USD", async () => {
    const { convertAmount } = load()
    expect(await convertAmount(10, "usd", "kes")).toBeCloseTo(1297)
    expect(await convertAmount(756, "gbp", "usd")).toBeCloseTo(1000)
    expect(await convertAmount(100, "gbp", "eur")).toBeCloseTo((100 / 0.756) * 0.87)
  })

  it("returns null for unknown currencies", async () => {
    const { convertAmount } = load()
    expect(await convertAmount(10, "usd", "xyz")).toBeNull()
  })

  it("fetches once and serves later calls from cache", async () => {
    const { getFxRates } = load()
    await Promise.all([getFxRates(), getFxRates(), getFxRates()])
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
