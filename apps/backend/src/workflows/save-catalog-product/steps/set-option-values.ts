import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"

export type SetOptionValuesInput = {
  product_id: string | null
  option_id: string | null
  title: string
  values: string[]
  /** "merge" links new values before the variants change; "exact" unlinks unused ones afterwards. */
  mode: "merge" | "exact"
}

type Undo = {
  product_id: string
  option_id: string
  title: string | null
  added: string[]
  removed: string[]
}

/**
 * Options are shared in Medusa 2.21 and each product links a subset of their
 * values. Variants can only point at linked values, so the editor links new
 * values before updating the product and unlinks stale ones afterwards.
 */
export const setOptionValuesStep = createStep(
  "set-option-values",
  async (input: SetOptionValuesInput, { container }) => {
    if (!input.option_id || !input.product_id) {
      return new StepResponse<{ changed: boolean }, Undo | null>({ changed: false }, null)
    }
    const products = container.resolve(Modules.PRODUCT)
    const linked = async () => {
      const product = await products.retrieveProduct(input.product_id as string, { relations: ["options", "options.values"] })
      const option = product.options?.find((o) => o.id === input.option_id)
      return { option, values: option?.values || [] }
    }

    const { option, values: before } = await linked()
    const undo: Undo = { product_id: input.product_id, option_id: input.option_id, title: null, added: [], removed: [] }

    if (input.mode === "merge") {
      const missing = input.values.filter((v) => !before.some((b) => b.value === v))
      if (missing.length) {
        await products.updateProductOptionValuesOnProduct({
          product_id: input.product_id,
          product_option_id: input.option_id,
          add: missing.map((value) => ({ value })),
        })
        const { values: after } = await linked()
        undo.added = after.filter((a) => !before.some((b) => b.id === a.id)).map((a) => a.id)
      }
      if (option && option.title !== input.title) {
        undo.title = option.title
        await products.updateProductOptions(input.option_id, { title: input.title })
      }
    } else {
      const stale = before.filter((b) => !input.values.includes(b.value)).map((b) => b.id)
      if (stale.length) {
        await products.updateProductOptionValuesOnProduct({
          product_id: input.product_id,
          product_option_id: input.option_id,
          remove: stale,
        })
        undo.removed = stale
      }
    }
    return new StepResponse<{ changed: boolean }, Undo | null>({ changed: true }, undo)
  },
  async (undo, { container }) => {
    if (!undo) {
      return
    }
    const products = container.resolve(Modules.PRODUCT)
    if (undo.added.length || undo.removed.length) {
      await products
        .updateProductOptionValuesOnProduct({
          product_id: undo.product_id,
          product_option_id: undo.option_id,
          ...(undo.removed.length ? { add: undo.removed } : {}),
          ...(undo.added.length ? { remove: undo.added } : {}),
        })
        .catch(() => undefined)
    }
    if (undo.title) {
      await products.updateProductOptions(undo.option_id, { title: undo.title }).catch(() => undefined)
    }
  }
)
