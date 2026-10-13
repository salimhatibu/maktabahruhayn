import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows"
import { formatAmount } from "../../lib/email-render"
import { sendStoreEmailWorkflow } from "../send-store-email"
import { upsertAffiliateStep, type AffiliateInput } from "./steps/affiliates"
import { loadCartForReminderStep, markReminderSentStep } from "./steps/remind-cart"
import {
  applyStkResultStep,
  createStkRequestStep,
  type StkRequestInput,
  type StkResultInput,
} from "./steps/stk-request"

/** Emails an abandoned-cart reminder and stamps the cart. */
export const remindAbandonedCartWorkflow = createWorkflow(
  "remind-abandoned-cart",
  (input: { cart_id: string }) => {
    const cart = loadCartForReminderStep(input)
    const email = transform({ cart }, ({ cart }) => ({
      template: "abandoned_cart" as const,
      to: cart.email as string,
      vars: {
        cart: {
          items: cart.items
            .map((i) => `- ${i.product_title || i.title} x ${i.quantity}: ${formatAmount(Number(i.unit_price) * i.quantity, cart.currency_code)}`)
            .join("\n"),
        },
      },
    }))
    sendStoreEmailWorkflow.runAsStep({ input: email })
    const mark = transform({ cart }, ({ cart }) => ({ cart_id: cart.id, metadata: cart.metadata }))
    markReminderSentStep(mark)
    return new WorkflowResponse(cart)
  }
)

/** Sets the stocked quantity of an inventory item at a location. */
export const setStockLevelWorkflow = createWorkflow(
  "set-stock-level",
  (input: { inventory_item_id: string; location_id: string; stocked_quantity: number }) => {
    const updates = transform({ input }, ({ input }) => ({ updates: [input] }))
    const result = updateInventoryLevelsWorkflow.runAsStep({ input: updates })
    return new WorkflowResponse(result)
  }
)

export const adminStkRequestWorkflow = createWorkflow(
  "admin-stk-request",
  (input: StkRequestInput) => new WorkflowResponse(createStkRequestStep(input))
)

export const processStkResultWorkflow = createWorkflow(
  "process-stk-result",
  (input: StkResultInput) => new WorkflowResponse(applyStkResultStep(input))
)

export const manageAffiliateWorkflow = createWorkflow(
  "manage-affiliate",
  (input: AffiliateInput) => new WorkflowResponse(upsertAffiliateStep(input))
)
