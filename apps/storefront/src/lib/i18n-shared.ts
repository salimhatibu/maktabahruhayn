export const LOCALES = ["en", "ar", "fr"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"
export const RTL_LOCALES: Locale[] = ["ar"]

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
}

export function isLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale)
}

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale)
}
