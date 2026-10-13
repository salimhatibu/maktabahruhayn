import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import type { ICartModuleService } from "@medusajs/framework/types"

/** Loads an abandoned cart's email and items for the reminder email. */
export const loadCartForReminderStep = createStep(
  "load-cart-for-reminder",
  async (input: { cart_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "cart",
      fields: ["id", "email", "currency_code", "completed_at", "metadata", "items.product_title", "items.title", "items.quantity", "items.unit_price"],
      filters: { id: input.cart_id },
    })
    const cart = data[0] as unknown as
      | { id: string; email: string | null; currency_code: string; completed_at: string | null; metadata: Record<string, unknown> | null; items: { product_title?: string; title: string; quantity: number; unit_price: number }[] }
      | undefined
    if (!cart || cart.completed_at) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found or already completed")
    }
    if (!cart.email) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "This cart has no email address")
    }
    return new StepResponse(cart)
  }
)

/** Stamps reminder_sent_at on the cart so reminders are not repeated. */
export const markReminderSentStep = createStep(
  "mark-reminder-sent",
  async (input: { cart_id: string; metadata: Record<string, unknown> | null }, { container }) => {
    const carts: ICartModuleService = container.resolve(Modules.CART)
    const previous = input.metadata || {}
    await carts.updateCarts(input.cart_id, { metadata: { ...previous, reminder_sent_at: new Date().toISOString() } })
    return new StepResponse(true, { cart_id: input.cart_id, previous })
  },
  async (undo, { container }) => {
    if (!undo) {
      return
    }
    const carts: ICartModuleService = container.resolve(Modules.CART)
    await carts.updateCarts(undo.cart_id, { metadata: undo.previous })
  }
)
