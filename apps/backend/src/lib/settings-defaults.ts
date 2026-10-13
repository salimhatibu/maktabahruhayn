/**
 * Store settings sections and their defaults. Admins edit these in the
 * Maktabah admin; the storefront reads the public ones from
 * GET /store/site-config. Anything not saved yet falls back to these.
 */

export type BusinessSettings = {
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

export type ThemeSettings = {
  brand: string
  brandDark: string
  accent: string
  rose: string
  promoBar: string
  footer: string
}

export type PromoMessage = { text: string; href: string }

export type HeroSlide = {
  kicker: string
  title: string
  text: string
  cta: string
  href: string
  tone: "sky" | "sand" | "green"
  /** Images shown on the slide (uploaded or picked from product images). */
  images: string[]
  /** Fallback when no images are set: covers of books with this tag. */
  coverTag: string
}

export type HomeSection = {
  title: string
  source: "tag" | "category" | "sale"
  value: string
  enabled: boolean
}

export type ContentSettings = {
  promoMessages: PromoMessage[]
  heroSlides: HeroSlide[]
  homeSections: HomeSection[]
  popularSearches: string[]
  announcement: string
}

export type NavLink = { label: string; href: string }
export type NavColumn = { heading: string; href?: string; links: NavLink[] }
export type NavItem = { label: string; href: string; columns?: NavColumn[] }
export type NavigationSettings = { items: NavItem[]; footerLinks: NavLink[] }

export type ShippingSettings = {
  freeThresholdUsd: number
  freeThresholdKes: number
  fallbackUsd: number
  fallbackKes: number
}

export type EmailTemplate = { subject: string; body: string; enabled: boolean }

export type EmailSettings = {
  fromName: string
  replyTo: string
  templates: Record<
    "order_placed" | "order_shipped" | "order_delivered" | "customer_welcome" | "abandoned_cart" | "newsletter_welcome",
    EmailTemplate
  >
  abandonedCartAfterHours: number
  abandonedCartAuto: boolean
}

export type ReportingSettings = { currency: string }

export type AffiliateSettings = { defaultCommissionPercent: number; cookieDays: number }

export type DescriptionTemplate = { name: string; html: string }

export type CatalogSettings = {
  units: string[]
  optionPresets: string[]
  descriptionTemplates: DescriptionTemplate[]
}

export type SettingsMap = {
  catalog: CatalogSettings
  business: BusinessSettings
  theme: ThemeSettings
  content: ContentSettings
  navigation: NavigationSettings
  shipping: ShippingSettings
  email: EmailSettings
  reporting: ReportingSettings
  affiliate: AffiliateSettings
}

export type SettingsKey = keyof SettingsMap

/** Sections exposed to the storefront (never email or affiliate internals). */
export const PUBLIC_SETTINGS: SettingsKey[] = ["business", "theme", "content", "navigation", "shipping"]

const sub = (handle: string, label: string): NavLink => ({ label, href: `/books?category=${handle}` })

export const DEFAULT_SETTINGS: SettingsMap = {
  catalog: {
    units: ["item", "set", "pack", "volume", "piece"],
    optionPresets: ["Paperback", "Hardcover", "Box Set", "Pocket Size", "Large Print", "Arabic", "English", "Bilingual"],
    descriptionTemplates: [
      {
        name: "Book overview",
        html: "<p><strong>About this book</strong></p><p>Write a short summary here.</p><h3>Contents</h3><ul><li>Chapter or topic</li><li>Chapter or topic</li></ul><h3>Why read it</h3><p>Who it is for and what the reader gains.</p>",
      },
      {
        name: "Multi-volume set",
        html: "<p><strong>Complete set</strong> in volumes, boxed.</p><h3>Includes</h3><ol><li>Volume 1:</li><li>Volume 2:</li></ol><p>Translation and verification details.</p>",
      },
    ],
  },
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
  // Heritage palette: Regency green, antique gold and dusty rose on ivory.
  theme: {
    brand: "#1f3f37",
    brandDark: "#142b25",
    accent: "#b08d57",
    rose: "#c4718a",
    promoBar: "#1f3f37",
    footer: "#1a3530",
  },
  content: {
    announcement: "",
    promoMessages: [
      { text: "Sale Items: Selected Titles Reduced", href: "/books?sale=1" },
      { text: "Pre-Order the 2027 Islamic Calendar", href: "/books?tag=coming-soon" },
    ],
    heroSlides: [
      {
        kicker: "Only from the Scholars",
        title: "Read the Classics",
        text: "Hadith, tafsir, fiqh and marriage in carefully verified editions, from the scholars who shaped the tradition.",
        cta: "Shop Now",
        href: "/books?tag=bestseller",
        tone: "sky",
        coverTag: "bestseller",
        images: [],
      },
      {
        kicker: "Suitable for All",
        title: "Laymen & Students",
        text: "From first booklets and workbooks to the major collections, place your order and enlighten yourself.",
        cta: "Shop the Catalog",
        href: "/books",
        tone: "sand",
        coverTag: "new-release",
        images: [],
      },
      {
        kicker: "Just Arrived",
        title: "New Arrivals",
        text: "Children's gift sets, board books and prayer guides, plus new editions of the classics.",
        cta: "Explore New Arrivals",
        href: "/books?tag=new-release",
        tone: "sand",
        coverTag: "new-release",
        images: [],
      },
      {
        kicker: "Worldwide Delivery",
        title: "From Nairobi to Your Door",
        text: "Shop and pay in your currency. Express and postal rates are calculated live at checkout.",
        cta: "Learn More",
        href: "/help#shipping",
        tone: "green",
        coverTag: "staff-pick",
        images: [],
      },
    ],
    homeSections: [
      { title: "Our Latest Products", source: "tag", value: "new-release", enabled: true },
      { title: "Bestsellers", source: "tag", value: "bestseller", enabled: true },
      { title: "Marriage & Family", source: "category", value: "marriage-family", enabled: true },
      { title: "Our Booksellers Recommend", source: "tag", value: "staff-pick", enabled: true },
      { title: "Sale Items", source: "sale", value: "", enabled: true },
      { title: "For Women", source: "category", value: "women", enabled: true },
      { title: "Pre-Order", source: "tag", value: "coming-soon", enabled: true },
    ],
    popularSearches: [
      "Fortress of the Muslim",
      "Tafsir Ibn Kathir",
      "Sahih al-Bukhari",
      "Sealed Nectar",
      "Maqdis Quran",
      "Juz Amma",
      "Qaida",
      "Riyad us-Saliheen",
    ],
  },
  navigation: {
    items: [
      {
        label: "Bestsellers",
        href: "/books?tag=bestseller",
        columns: [
          {
            heading: "Bestsellers",
            href: "/books?tag=bestseller",
            links: [
              { label: "All Bestsellers", href: "/books?tag=bestseller" },
              { label: "Qur'an & Mushaf", href: "/books?tag=bestseller&category=quran-mushaf" },
              { label: "Hadith", href: "/books?tag=bestseller&category=hadith" },
            ],
          },
          {
            heading: "Recommended",
            links: [
              { label: "Booksellers' Picks", href: "/books?tag=staff-pick" },
              { label: "New Arrivals", href: "/books?tag=new-release" },
              { label: "Pre-Order", href: "/books?tag=coming-soon" },
              { label: "Sale Items", href: "/books?sale=1" },
            ],
          },
        ],
      },
      {
        label: "Books",
        href: "/books",
        columns: [
          {
            heading: "Departments",
            href: "/books",
            links: [
              sub("quran-mushaf", "Qur'an & Mushaf"),
              sub("tafsir", "Tafsir"),
              sub("hadith", "Hadith"),
              sub("fiqh-aqidah", "Fiqh & Aqidah"),
              sub("seerah-history", "Seerah & History"),
              sub("islamic-living", "Islamic Living"),
              sub("islamic-education", "Islamic Education & Arabic"),
              sub("childrens-books", "Children's Books"),
              sub("marriage-family", "Marriage & Family"),
              sub("women", "Women"),
              sub("arabic-books", "Arabic Books"),
              sub("gifts", "Gifts & Calendars"),
            ],
          },
          {
            heading: "Format",
            links: [
              { label: "Hardcover", href: "/search?binding_type=hardcover" },
              { label: "Softcover", href: "/search?binding_type=softcover" },
              { label: "Multi-volume Sets", href: "/search?binding_type=multi_volume_box_set" },
            ],
          },
        ],
      },
      { label: "Qur'an & Tafsir", href: "/books?category=quran-mushaf" },
      { label: "Marriage", href: "/books?category=marriage-family" },
      { label: "Women", href: "/books?category=women" },
      { label: "Arabic", href: "/books?category=arabic-books" },
      { label: "Hadith", href: "/books?category=hadith" },
      { label: "Seerah & History", href: "/books?category=seerah-history" },
      { label: "Children's Books", href: "/books?category=childrens-books" },
      { label: "Sale Items", href: "/books?sale=1" },
    ],
    footerLinks: [
      { label: "Help Center", href: "/help" },
      { label: "Order Status", href: "/order-status" },
      { label: "Shipping & Returns", href: "/help#shipping" },
      { label: "My Account", href: "/account" },
    ],
  },
  shipping: {
    freeThresholdUsd: Number(process.env.FREE_SHIPPING_THRESHOLD_USD ?? 60),
    freeThresholdKes: Number(process.env.FREE_SHIPPING_THRESHOLD_KES ?? 7500),
    fallbackUsd: Number(process.env.SHIPPO_FALLBACK_AMOUNT_USD ?? 25),
    fallbackKes: Number(process.env.SHIPPO_FALLBACK_AMOUNT_KES ?? 800),
  },
  email: {
    fromName: "Maktabah Ruhayn",
    replyTo: "",
    abandonedCartAfterHours: 24,
    abandonedCartAuto: false,
    templates: {
      order_placed: {
        enabled: true,
        subject: "Your order #{{order.display_id}} is confirmed",
        body: "Assalamu alaikum {{customer.first_name}},\n\nJazakAllahu khayran for your order #{{order.display_id}}.\n\n{{order.items}}\n\nTotal: {{order.total}}\n\nWe'll email you again when it ships. You can check its status any time at {{store.url}}/order-status.\n\n{{store.name}}",
      },
      order_shipped: {
        enabled: true,
        subject: "Order #{{order.display_id}} has shipped",
        body: "Assalamu alaikum {{customer.first_name}},\n\nYour order #{{order.display_id}} is on its way.\n\nTracking: {{tracking.number}}\n{{tracking.url}}\n\n{{store.name}}",
      },
      order_delivered: {
        enabled: true,
        subject: "Order #{{order.display_id}} was delivered",
        body: "Assalamu alaikum {{customer.first_name}},\n\nYour order #{{order.display_id}} has been delivered. We hope you benefit from your books. If you have a moment, a review helps other readers: {{store.url}}/account\n\n{{store.name}}",
      },
      customer_welcome: {
        enabled: true,
        subject: "Welcome to {{store.name}}",
        body: "Assalamu alaikum {{customer.first_name}},\n\nYour account is ready. Track orders and write reviews at {{store.url}}/account.\n\n{{store.name}}",
      },
      abandoned_cart: {
        enabled: true,
        subject: "You left some books in your cart",
        body: "Assalamu alaikum,\n\nYou still have these books in your cart:\n\n{{cart.items}}\n\nPick up where you left off: {{store.url}}/cart\n\n{{store.name}}",
      },
      newsletter_welcome: {
        enabled: true,
        subject: "You're on the {{store.name}} list",
        body: "Assalamu alaikum,\n\nThank you for subscribing. Expect new arrivals, pre-orders and offers from our booksellers.\n\n{{store.name}}",
      },
    },
  },
  reporting: { currency: "kes" },
  affiliate: { defaultCommissionPercent: 10, cookieDays: 30 },
}

/** Shallow-merges saved values over defaults so new fields get defaults. */
export function withDefaults<K extends SettingsKey>(key: K, saved: unknown): SettingsMap[K] {
  const base = DEFAULT_SETTINGS[key]
  if (!saved || typeof saved !== "object") {
    return base
  }
  return { ...base, ...(saved as object) } as SettingsMap[K]
}
