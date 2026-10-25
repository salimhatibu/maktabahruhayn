/**
 * Merchandising configuration for navigation and home page sections. Category
 * handles and tag values match the backend catalog seed (seed-catalog.ts);
 * the subject list mirrors Darussalam's department structure.
 */

export type Subject = {
  handle: string
  name: string
  blurb: string
}

export const SUBJECTS: Subject[] = [
  { handle: "quran-mushaf", name: "Qur'an & Mushaf", blurb: "Mushafs, translations and Juz 'Amma" },
  { handle: "tafsir", name: "Tafsir", blurb: "Classical exegesis in English" },
  { handle: "hadith", name: "Hadith", blurb: "The major collections and their sets" },
  { handle: "fiqh-aqidah", name: "Fiqh & Aqidah", blurb: "Jurisprudence and creed" },
  { handle: "seerah-history", name: "Seerah & History", blurb: "The Prophet's life, Companions and caliphs" },
  { handle: "islamic-living", name: "Islamic Living", blurb: "Du'a, dhikr and everyday guidance" },
  { handle: "islamic-education", name: "Islamic Education & Arabic", blurb: "Qaida and first steps in Arabic" },
  { handle: "childrens-books", name: "Children's Books", blurb: "Stories, prayer guides and board books" },
  { handle: "general-islamic", name: "General Islamic", blurb: "General Islamic topics and guidance" },
  { handle: "arabic-learning", name: "Arabic Learning", blurb: "Resources for learning the Arabic language" },
  { handle: "marriage-family", name: "Marriage & Family", blurb: "Marriage, the rights of spouses and raising children" },
  { handle: "gifts", name: "Gifts & Calendars", blurb: "Calendars and gift sets" },
]

export const TAGS = {
  bestseller: { value: "bestseller", label: "Bestsellers" },
  "new-release": { value: "new-release", label: "New Arrivals" },
  "coming-soon": { value: "coming-soon", label: "Pre-Order" },
  "staff-pick": { value: "staff-pick", label: "Booksellers' Picks" },
} as const

export type TagKey = keyof typeof TAGS

export function isTagKey(value: string | undefined): value is TagKey {
  return Boolean(value && value in TAGS)
}

export function subjectByHandle(handle?: string) {
  return SUBJECTS.find((s) => s.handle === handle)
}

/** Shown under the search box before the shopper types. */
export const POPULAR_SEARCHES = [
  "Fortress of the Muslim",
  "Tafsir Ibn Kathir",
  "Sahih al-Bukhari",
  "Sealed Nectar",
  "Maqdis Quran",
  "Juz Amma",
  "Qaida",
  "Riyad us-Saliheen",
]

type NavLink = { label: string; href: string }
type NavColumn = { heading: string; href?: string; links: NavLink[] }

export type NavItem = {
  label: string
  href: string
  columns?: NavColumn[]
}

const subjectLink = (handle: string, label?: string): NavLink => ({
  label: label || subjectByHandle(handle)?.name || handle,
  href: `/books?category=${handle}`,
})

export const NAV: NavItem[] = [
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
          { label: "Seerah & History", href: "/books?tag=bestseller&category=seerah-history" },
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
      { heading: "Departments", href: "/books", links: SUBJECTS.map((s) => subjectLink(s.handle)) },
      {
        heading: "Language",
        links: [
          { label: "English", href: "/search?language=english" },
          { label: "Arabic", href: "/search?language=arabic" },
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
      {
        heading: "Publishers",
        links: [
          { label: "Darussalam", href: "/search?publisher=Darussalam" },
          { label: "Goodword", href: "/search?q=Goodword" },
          { label: "Ta-Ha Publishers", href: "/search?publisher=Ta-Ha%20Publishers" },
          { label: "Karya Bestari (Maqdis)", href: "/search?publisher=Karya%20Bestari" },
        ],
      },
    ],
  },
  {
    label: "Qur'an & Tafsir",
    href: "/books?category=quran-mushaf",
    columns: [
      {
        heading: "Qur'an & Mushaf",
        href: "/books?category=quran-mushaf",
        links: [
          subjectLink("quran-mushaf", "All Mushafs & Translations"),
          { label: "Uthmani (Madani) Script", href: "/search?q=Maqdis" },
          { label: "Indo-Pak Script", href: "/search?q=Indo-Pak" },
          { label: "Juz 'Amma", href: "/search?q=Juz%20Amma" },
        ],
      },
      { heading: "Tafsir", href: "/books?category=tafsir", links: [subjectLink("tafsir", "All Tafsir")] },
    ],
  },
  {
    label: "Hadith",
    href: "/books?category=hadith",
    columns: [
      {
        heading: "Hadith",
        href: "/books?category=hadith",
        links: [subjectLink("hadith", "All Hadith"), { label: "Multi-volume Sets", href: "/search?categories=Hadith&binding_type=multi_volume_box_set" }],
      },
      { heading: "Fiqh & Aqidah", href: "/books?category=fiqh-aqidah", links: [subjectLink("fiqh-aqidah", "All Fiqh & Aqidah")] },
    ],
  },
  { label: "Sale", href: "/books?sale=1" },
]
