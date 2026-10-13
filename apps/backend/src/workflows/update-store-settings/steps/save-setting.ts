import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { setRuntimeSetting } from "../../../lib/runtime-settings"
import { withDefaults, type SettingsKey } from "../../../lib/settings-defaults"
import { STORE_SETTINGS_MODULE } from "../../../modules/store-settings"
import type StoreSettingsModuleService from "../../../modules/store-settings/service"

export type SaveSettingInput = { key: SettingsKey; value: Record<string, unknown> }

/** Upserts one settings section and refreshes this process's cache. */
export const saveSettingStep = createStep(
  "save-setting",
  async (input: SaveSettingInput, { container }) => {
    const settings: StoreSettingsModuleService = container.resolve(STORE_SETTINGS_MODULE)
    const [existing] = await settings.listSettings({ key: input.key })
    const value = withDefaults(input.key, input.value) as unknown as Record<string, unknown>

    if (existing) {
      await settings.updateSettings({ id: existing.id, value })
    } else {
      await settings.createSettings({ key: input.key, value })
    }
    setRuntimeSetting(input.key, value as never)

    return new StepResponse(value, {
      key: input.key,
      id: existing?.id || null,
      previous: (existing?.value as Record<string, unknown> | undefined) || null,
    })
  },
  async (undo, { container }) => {
    if (!undo) {
      return
    }
    const settings: StoreSettingsModuleService = container.resolve(STORE_SETTINGS_MODULE)
    if (undo.id && undo.previous) {
      await settings.updateSettings({ id: undo.id, value: undo.previous })
      setRuntimeSetting(undo.key, withDefaults(undo.key, undo.previous) as never)
    } else {
      const [row] = await settings.listSettings({ key: undo.key })
      if (row) {
        await settings.deleteSettings(row.id)
      }
      setRuntimeSetting(undo.key, withDefaults(undo.key, null) as never)
    }
  }
)
