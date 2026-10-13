import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Gives every product without one a sequential product number (101, 102, …)
 * in creation order, continuing after the highest number already assigned.
 */
export default async function backfillProductNumbers({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "metadata", "created_at"],
    pagination: { take: 10000, order: { created_at: "ASC" } },
  })
  const products = data as { id: string; metadata: Record<string, unknown> | null }[]
  let next = Math.max(100, ...products.map((p) => Number(p.metadata?.product_number) || 0)) + 1
  const missing = products.filter((p) => !p.metadata?.product_number)
  if (!missing.length) {
    logger.info("Every product already has a number.")
    return
  }
  await updateProductsWorkflow(container).run({
    input: {
      products: missing.map((p) => ({ id: p.id, metadata: { ...(p.metadata || {}), product_number: next++ } })),
    },
  })
  logger.info(`Numbered ${missing.length} product(s), up to ${next - 1}.`)
}
