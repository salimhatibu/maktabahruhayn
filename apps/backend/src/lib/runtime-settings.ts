import { DEFAULT_SETTINGS, type SettingsKey, type SettingsMap } from "./settings-defaults"

/**
 * In-process copy of store settings for code that cannot resolve the
 * settings module (fulfillment providers run in their own module container).
 * Populated by the settings module loader at boot and refreshed on every
 * save. Each server process keeps its own copy.
 */
const cache: Partial<SettingsMap> = {}

export function setRuntimeSetting<K extends SettingsKey>(key: K, value: SettingsMap[K]) {
  cache[key] = value
}

export function getRuntimeSetting<K extends SettingsKey>(key: K): SettingsMap[K] {
  return (cache[key] as SettingsMap[K] | undefined) || DEFAULT_SETTINGS[key]
}
