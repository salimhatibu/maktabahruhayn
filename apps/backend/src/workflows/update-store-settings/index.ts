import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateStoresWorkflow } from "@medusajs/medusa/core-flows"
import { saveSettingStep, type SaveSettingInput } from "./steps/save-setting"
import { findStoreStep } from "./steps/find-store"

export const updateStoreSettingsWorkflow = createWorkflow(
  "update-store-settings",
  (input: SaveSettingInput) => {
    const saved = saveSettingStep(input)

    // Keep the Medusa store name (shown in the admin) in step with Business Details.
    when("rename-store", { input }, ({ input }) => input.key === "business" && Boolean(input.value?.name)).then(() => {
      const store = findStoreStep()
      const update = transform({ input, store }, ({ input, store }) => ({
        selector: { id: store.id },
        update: { name: String(input.value.name) },
      }))
      updateStoresWorkflow.runAsStep({ input: update })
    })

    return new WorkflowResponse(saved)
  }
)
