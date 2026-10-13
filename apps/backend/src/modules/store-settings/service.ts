import { MedusaService } from "@medusajs/framework/utils"
import { setRuntimeSetting } from "../../lib/runtime-settings"
import {
  DEFAULT_SETTINGS,
  withDefaults,
  type SettingsKey,
  type SettingsMap,
} from "../../lib/settings-defaults"
import { Setting } from "./models/setting"

class StoreSettingsModuleService extends MedusaService({ Setting }) {
  async getSection<K extends SettingsKey>(key: K): Promise<SettingsMap[K]> {
    const [row] = await this.listSettings({ key })
    return withDefaults(key, row?.value)
  }

  async getSections(keys: SettingsKey[]): Promise<Partial<SettingsMap>> {
    const rows = await this.listSettings({ key: keys })
    const out: Partial<SettingsMap> = {}
    for (const key of keys) {
      const row = rows.find((r) => r.key === key)
      ;(out as Record<string, unknown>)[key] = withDefaults(key, row?.value)
    }
    return out
  }

  /** Loads every section into the in-process cache (used at boot). */
  async warmRuntimeCache() {
    const keys = Object.keys(DEFAULT_SETTINGS) as SettingsKey[]
    const sections = await this.getSections(keys)
    for (const key of keys) {
      setRuntimeSetting(key, sections[key] as never)
    }
  }
}

export default StoreSettingsModuleService
