import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/** Products created outside the editor (imports, Medusa's own form) still get a product number. */
export default async function productNumber({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [product] } = await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { id: data.id } })
  if (!product || (product.metadata as Record<string, unknown> | null)?.product_number) {
    return
  }
  const { data: all } = await query.graph({ entity: "product", fields: ["metadata"], pagination: { take: 10000 } })
  const next = Math.max(100, ...all.map((p) => Number((p.metadata as Record<string, unknown> | null)?.product_number) || 0)) + 1
  await updateProductsWorkflow(container).run({
    input: { products: [{ id: product.id, metadata: { ...(product.metadata || {}), product_number: next } }] },
  })
}

export const config: SubscriberConfig = {
  event: "product.created",
}
