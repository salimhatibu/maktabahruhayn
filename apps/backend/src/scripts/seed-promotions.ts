/**
 * Seeds a welcome promo code (10% off the order) for the cart's promo field.
 *
 *   pnpm --filter @maktabah/backend seed:promotions
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"

export default async function seedPromotions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({ entity: "promotion", fields: ["id"], filters: { code: "WELCOME10" } })
  if (data.length) {
    logger.info("WELCOME10 already exists")
    return
  }

  await createPromotionsWorkflow(container).run({
    input: {
      promotionsData: [
        {
          code: "WELCOME10",
          type: "standard",
          status: "active",
          is_automatic: false,
          application_method: {
            type: "percentage",
            target_type: "order",
            allocation: "across",
            value: 10,
          },
        },
      ],
    },
  })
  logger.info("Created promo code WELCOME10 (10% off)")
}
