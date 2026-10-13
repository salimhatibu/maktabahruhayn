import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { syncPricesStep, type SyncPricesInput } from "./steps/sync-prices"

export const syncConvertedPricesWorkflow = createWorkflow(
  "sync-converted-prices",
  (input: SyncPricesInput) => {
    const result = syncPricesStep(input)
    return new WorkflowResponse(result)
  }
)
