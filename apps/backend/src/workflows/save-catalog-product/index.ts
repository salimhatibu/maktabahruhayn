import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createProductsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import type { CatalogProductInput } from "../../lib/catalog-editor"
import { syncPricesStep } from "../sync-converted-prices/steps/sync-prices"
import { finalizeCatalogProductStep } from "./steps/finalize-catalog-product"
import { prepareCatalogProductStep } from "./steps/prepare-catalog-product"
import { setOptionValuesStep } from "./steps/set-option-values"

/**
 * Saves a product from the single-page editor: product, variants, prices,
 * book details, stock per location, sale price, then converted currencies.
 */
export const saveCatalogProductWorkflow = createWorkflow(
  "save-catalog-product",
  (input: CatalogProductInput) => {
    const prepared = prepareCatalogProductStep(input)

    const created = when("create-catalog-product", { prepared }, ({ prepared }) => prepared.is_new).then(() => {
      const createInput = transform({ prepared }, ({ prepared }) => ({
        products: prepared.create as never,
        additional_data: prepared.book,
      }))
      return createProductsWorkflow.runAsStep({ input: createInput })
    })

    when("update-catalog-product", { prepared }, ({ prepared }) => !prepared.is_new).then(() => {
      const widen = transform({ prepared }, ({ prepared }) => ({ ...prepared.option, mode: "merge" as const }))
      setOptionValuesStep(widen).config({ name: "widen-option-values" })
      const updateInput = transform({ prepared }, ({ prepared }) => ({
        products: prepared.update as never,
        additional_data: prepared.book,
      }))
      const updated = updateProductsWorkflow.runAsStep({ input: updateInput })
      const trim = transform({ prepared, updated }, ({ prepared }) => ({ ...prepared.option, mode: "exact" as const }))
      setOptionValuesStep(trim).config({ name: "trim-option-values" })
      return updated
    })

    const finalizeInput = transform({ prepared, created }, ({ prepared, created }) => ({
      product_id: (prepared.product_id || (created as { id: string }[] | undefined)?.[0]?.id) as string,
      track_inventory: prepared.track_inventory,
      plans: prepared.plans,
    }))
    const finalized = finalizeCatalogProductStep(finalizeInput)

    const syncInput = transform({ finalized }, ({ finalized }) => ({ price_set_ids: finalized.price_set_ids }))
    syncPricesStep(syncInput)

    return new WorkflowResponse(finalized)
  }
)
