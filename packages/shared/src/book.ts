export type BindingType =
  | "hardcover"
  | "softcover"
  | "faux_leather"
  | "multi_volume_box_set"

export type ScriptType = "madani" | "indo_pak" | "other"

export type BookLanguage =
  | "english"
  | "arabic"
  | "swahili"
  | "urdu"
  | "french"

export interface BookMetadata {
  id?: string
  title_arabic?: string | null
  author?: string | null
  translator?: string | null
  commentator_tahqeeq?: string | null
  publisher?: string | null
  binding_type?: BindingType | null
  script_type?: ScriptType | null
  language?: BookLanguage | null
  volume_count?: number | null
  isbn_10?: string | null
  isbn_13?: string | null
  sample_pdf_url?: string | null
}

export interface BookAdditionalData extends BookMetadata {
  title_arabic?: string | null
}
