import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { DEFAULT_SETTINGS, type SettingsKey } from "../../../../../lib/settings-defaults"
import { STORE_SETTINGS_MODULE } from "../../../../../modules/store-settings"
import type StoreSettingsModuleService from "../../../../../modules/store-settings/service"
import { updateStoreSettingsWorkflow } from "../../../../../workflows/update-store-settings"

function keyOf(req: MedusaRequest): SettingsKey {
  const key = req.params.key
  if (!(key in DEFAULT_SETTINGS)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Unknown settings section "${key}"`)
  }
  return key as SettingsKey
}

/** GET /admin/maktabah/settings/:key */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const key = keyOf(req)
  const settings: StoreSettingsModuleService = req.scope.resolve(STORE_SETTINGS_MODULE)
  res.json({ key, value: await settings.getSection(key), defaults: DEFAULT_SETTINGS[key] })
}

/** POST /admin/maktabah/settings/:key { value } */
export async function POST(req: MedusaRequest<{ value: Record<string, unknown> }>, res: MedusaResponse) {
  const key = keyOf(req)
  const { result } = await updateStoreSettingsWorkflow(req.scope).run({
    input: { key, value: req.validatedBody.value },
  })
  res.json({ key, value: result })
}
