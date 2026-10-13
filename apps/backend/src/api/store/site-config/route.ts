import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PUBLIC_SETTINGS } from "../../../lib/settings-defaults"
import { STORE_SETTINGS_MODULE } from "../../../modules/store-settings"
import type StoreSettingsModuleService from "../../../modules/store-settings/service"

/**
 * GET /store/site-config: the storefront's editable content: business
 * details, theme colors, promo bar, hero, home sections, menus and shipping
 * thresholds. Edited in the admin under Storefront and Settings.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const settings: StoreSettingsModuleService = req.scope.resolve(STORE_SETTINGS_MODULE)
  res.setHeader("Cache-Control", "public, max-age=30")
  res.json(await settings.getSections(PUBLIC_SETTINGS))
}
