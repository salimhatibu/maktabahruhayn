import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { FX_MODULE } from "../modules/fx"
import type FxModuleService from "../modules/fx/service"
import { syncConvertedPricesWorkflow } from "../workflows/sync-converted-prices"

/** Refreshes FX rates, then re-derives every non-USD price from them. */
export default async function syncFxRatesJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fx: FxModuleService = container.resolve(FX_MODULE)

  try {
    const snapshot = await fx.syncRates()
    logger.info(`FX rates synced from ${snapshot.source} (${snapshot.updated_at})`)
    const { result } = await syncConvertedPricesWorkflow(container).run({ input: {} })
    logger.info(
      `Converted prices: ${result.base_prices} base and ${result.list_prices} sale prices across ${result.currencies} currencies`
    )
  } catch (error) {
    logger.error(`FX/price sync failed: ${String(error)}`)
  }
}

export const config = {
  name: "sync-fx-rates",
  schedule: "15 */6 * * *",
}
