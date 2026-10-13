import type { LoaderOptions } from "@medusajs/framework/types"
import { setRuntimeSetting } from "../../../lib/runtime-settings"
import { DEFAULT_SETTINGS, withDefaults, type SettingsKey } from "../../../lib/settings-defaults"

/**
 * Fills the in-process settings cache at boot so the Shippo provider sees
 * saved free-shipping thresholds immediately. Failures (e.g. the table does
 * not exist before the first migration) leave the defaults in place.
 */
export default async function warmSettingsCache({ container }: LoaderOptions) {
  try {
    type Repo = { list: (filters: Record<string, unknown>) => Promise<{ key: string; value: unknown }[]> }
    // MedusaService registers an internal service per model; the name
    // derives from the model, so try the known spellings.
    const name = ["storeSettingService", "settingService"].find((n) => container.hasRegistration(n))
    if (!name) {
      return
    }
    const rows = await container.resolve<Repo>(name).list({})
    for (const key of Object.keys(DEFAULT_SETTINGS) as SettingsKey[]) {
      const row = rows.find((r) => r.key === key)
      setRuntimeSetting(key, withDefaults(key, row?.value) as never)
    }
  } catch {
    // Defaults stay in effect.
  }
}
