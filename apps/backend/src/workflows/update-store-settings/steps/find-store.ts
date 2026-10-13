import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** The single Medusa store record. */
export const findStoreStep = createStep("find-store", async (_: void, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "store", fields: ["id"] })
  return new StepResponse({ id: data[0].id as string })
})
