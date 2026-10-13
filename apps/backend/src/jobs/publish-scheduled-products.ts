import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

/** Every five minutes: publishes drafts whose scheduled time (metadata.publish_at) has passed. */
export default async function publishScheduledProducts(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "metadata"],
    filters: { status: ProductStatus.DRAFT },
    pagination: { take: 500 },
  })
  const now = Date.now()
  const due = (data as { id: string; title: string; metadata: Record<string, unknown> | null }[]).filter((p) => {
    const at = p.metadata?.publish_at
    return typeof at === "string" && !Number.isNaN(Date.parse(at)) && Date.parse(at) <= now
  })
  if (!due.length) {
    return
  }
  await updateProductsWorkflow(container).run({
    input: {
      products: due.map((p) => ({
        id: p.id,
        status: ProductStatus.PUBLISHED,
        metadata: { ...(p.metadata || {}), publish_at: null },
      })),
    },
  })
  logger.info(`Published ${due.length} scheduled product(s): ${due.map((p) => p.title).join(", ")}`)
}

export const config = {
  name: "publish-scheduled-products",
  schedule: "*/5 * * * *",
}
