import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { abandonedCarts } from "../lib/reports"
import { STORE_SETTINGS_MODULE } from "../modules/store-settings"
import type StoreSettingsModuleService from "../modules/store-settings/service"
import { remindAbandonedCartWorkflow } from "../workflows/admin-ops"

/**
 * Hourly: when automatic reminders are on (Emails settings), emails each
 * abandoned cart with an address once, after the configured idle time.
 */
export default async function abandonedCartReminders(container: MedusaContainer) {
  const settings: StoreSettingsModuleService = container.resolve(STORE_SETTINGS_MODULE)
  const email = await settings.getSection("email")
  if (!email.abandonedCartAuto) {
    return
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const carts = await abandonedCarts(query, { olderThanHours: email.abandonedCartAfterHours, limit: 100 })
  // Only carts idle less than a week, so old carts are not suddenly emailed.
  const weekAgo = Date.now() - 7 * 86400000
  let sent = 0
  for (const cart of carts) {
    if (!cart.email || cart.reminder_sent_at || new Date(cart.updated_at).getTime() < weekAgo) {
      continue
    }
    try {
      await remindAbandonedCartWorkflow(container).run({ input: { cart_id: cart.id } })
      sent += 1
    } catch (error) {
      logger.warn(`Cart reminder for ${cart.id} failed: ${String(error)}`)
    }
  }
  if (sent) {
    logger.info(`Sent ${sent} abandoned cart reminders`)
  }
}

export const config = {
  name: "abandoned-cart-reminders",
  schedule: "5 * * * *",
}
