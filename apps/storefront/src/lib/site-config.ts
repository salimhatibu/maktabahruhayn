import { getSettings } from "@maktabah/db"
import { NAV, POPULAR_SEARCHES, type NavItem } from "./catalog"
import { db } from "./db"

/** Storefront content edited in the admin (Storefront, Menus, Appearance, Business). */
export type SiteConfig = {
  business: {
    name: string
    tagline: string
    email: string
    phone: string
    whatsapp: string
    address: string
    instagram: string
    facebook: string
    x: string
  }
  theme: { brand: string; brandDark: string; accent: string; rose: string; promoBar: string; footer: string }
  content: {
    announcement: string
    promoMessages: { text: string; href: string; endDate?: string }[]
    heroSlides: {
      kicker: string
      title: string
      text: string
      cta: string
      href: string
      tone: string
      coverTag: string
      images?: string[]
    }[]
    homeSections: { title: string; source: "tag" | "category" | "sale"; value: string; enabled: boolean }[]
    popularSearches: string[]
  }
  navigation: { items: NavItem[]; footerLinks: { label: string; href: string }[] }
}

/** Used when the backend is unreachable, so the site still renders. */
export const FALLBACK_CONFIG: SiteConfig = {
  business: {
    name: "Maktabah Ruhayn",
    tagline: "Classical Islamic books, multi-volume collections, and verified editions, shipped from Nairobi.",
    email: "",
    phone: "",
    whatsapp: "",
    address: "Nairobi, Kenya",
    instagram: "",
    facebook: "",
    x: "",
  },
  theme: { brand: "#1f3f37", brandDark: "#142b25", accent: "#b08d57", rose: "#c4718a", promoBar: "#1f3f37", footer: "#1a3530" },
  content: {
    announcement: "",
    promoMessages: [],
    heroSlides: [],
    homeSections: [
      { title: "Bestsellers", source: "tag", value: "bestseller", enabled: true },
      { title: "New Arrivals", source: "tag", value: "new-release", enabled: true },
    ],
    popularSearches: POPULAR_SEARCHES,
  },
  navigation: {
    items: NAV,
    footerLinks: [
      { label: "Help Center", href: "/help" },
      { label: "FAQ", href: "/faq" },
      { label: "Order Status", href: "/order-status" },
    ],
  },
}

/**
 * The storefront's own settings, read from D1. Each section falls back to the
 * built-in defaults, so a database that has not been seeded still renders.
 */
export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const data = await getSettings<Partial<SiteConfig>>(await db())
    return {
      business: { ...FALLBACK_CONFIG.business, ...data.business },
      theme: { ...FALLBACK_CONFIG.theme, ...data.theme },
      content: { ...FALLBACK_CONFIG.content, ...data.content },
      navigation: { ...FALLBACK_CONFIG.navigation, ...data.navigation },
    }
  } catch {
    return FALLBACK_CONFIG
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** CSS variable overrides for the admin-chosen theme (validated hex only). */
export function themeCss(theme: SiteConfig["theme"]) {
  const vars: [string, string][] = [
    ["--brand", theme.brand],
    ["--brand-dark", theme.brandDark],
    ["--gold", theme.accent],
    ["--rose", theme.rose],
    ["--promo", theme.promoBar],
    ["--footer-bg", theme.footer],
  ]
  // html:root outranks the stylesheet's :root regardless of load order.
  return `html:root{${vars
    .filter(([, v]) => HEX.test(v))
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`
}

export function whatsappLink(number: string, text?: string) {
  const digits = number.replace(/\D/g, "")
  return digits ? `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null
}
