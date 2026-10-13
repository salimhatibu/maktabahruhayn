import { convertAmount, getFxRates, refreshFxRates, type FxSnapshot } from "../../lib/fx-rates"

export type FxRatesSnapshot = FxSnapshot

/**
 * Thin module wrapper over the shared rate cache so routes and jobs can
 * resolve FX from the container.
 */
class FxModuleService {
  async syncRates(): Promise<FxRatesSnapshot> {
    return refreshFxRates()
  }

  async getRates(): Promise<FxRatesSnapshot> {
    return getFxRates()
  }

  async convert(amount: number, from: string, to: string): Promise<number | null> {
    return convertAmount(amount, from, to)
  }
}

export default FxModuleService
