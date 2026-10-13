import {
  ArrowLeft,
  ChevronDownMini,
  EllipsisHorizontal,
  MagnifyingGlass,
  Plus,
  StarSolid,
  Star,
  Trash,
  XMarkMini,
} from "@medusajs/icons"
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Copy,
  DropdownMenu,
  Heading,
  IconButton,
  Input,
  Kbd,
  Popover,
  Select,
  Text,
  Textarea,
  clx,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { ImageManager } from "../../../../components/catalog/image-manager"
import { ManageDrawer, type CatalogSettings, type ManageKind } from "../../../../components/catalog/manage-drawer"
import { RichTextEditor } from "../../../../components/catalog/rich-text"
import { api, money, useApi } from "../../../../lib/api"

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Location = { id: string; name: string }
type Category = { id: string; name: string; handle: string; parent_category_id: string | null }
type ShippingSizeOption = { value: string; label: string; length: number; width: number; height: number; weight: number }
type BundleItem = { product_id: string; title: string; quantity: number }
type Review = { quote: string; source: string }

type Meta = {
  locations: Location[]
  categories: Category[]
  products: { id: string; title: string; thumbnail: string | null }[]
  catalog: CatalogSettings
  tags: { value: string; label: string }[]
  shipping_sizes: ShippingSizeOption[]
  storefront_url: string
}

type LoadedVariant = {
  id: string
  option_value: string
  system_sku: string
  custom_sku: string | null
  selling_price: number
  original_price: number | null
  cost: number | null
  low_stock_threshold: number | null
  stock: { location_id: string; quantity: number }[]
}

type LoadedProduct = {
  id: string
  product_number: number | null
  title: string
  subtitle: string | null
  handle: string
  description_html: string
  status: string
  publish_at: string | null
  images: string[]
  category_ids: string[]
  primary_category_id: string | null
  unit: string
  product_type: "standard" | "bundle"
  bundle_items: BundleItem[]
  delivery_type: "physical" | "digital"
  track_inventory: boolean
  allow_backorder: boolean
  shipping_size: string
  custom_dimensions: { length: number; width: number; height: number; weight: number } | null
  option_title: string
  option_display: "buttons" | "dropdown"
  pages: number | null
  tags: string[]
  release_date: string | null
  preorder: boolean
  series: string | null
  bookseller_note: string | null
  author_bio: string | null
  editorial_reviews: Review[]
  book: Record<string, string | number | null>
  variants: LoadedVariant[]
}

/** Numbers stay strings while editing so fields can be empty. */
type VariantForm = {
  key: string
  id?: string
  option_value: string
  system_sku: string | null
  custom_sku: string
  selling_price: string
  original_price: string
  cost: string
  low_stock_threshold: string
  stock: Record<string, string>
}

type Form = {
  title: string
  subtitle: string
  handle: string
  description_html: string
  images: string[]
  category_ids: string[]
  primary_category_id: string
  unit: string
  product_type: "standard" | "bundle"
  bundle_items: BundleItem[]
  delivery_type: "physical" | "digital"
  track_inventory: boolean
  allow_backorder: boolean
  shipping_size: string
  dims: { length: string; width: string; height: string; weight: string }
  option_title: string
  option_display: "buttons" | "dropdown"
  variants: VariantForm[]
  status: "draft" | "published"
  schedule: boolean
  publish_at: string
  pages: string
  tags: string[]
  release_date: string
  preorder: boolean
  series: string
  bookseller_note: string
  author_bio: string
  editorial_reviews: Review[]
  book: Record<string, string>
}

type FieldDef = { key: string; label: string; placeholder?: string; type?: "number" | "url"; wide?: boolean }

const BOOK_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Authorship",
    fields: [
      { key: "author", label: "Author", placeholder: "e.g. Imam an-Nawawi" },
      { key: "translator", label: "Translator" },
      { key: "commentator_tahqeeq", label: "Commentary / tahqeeq" },
      { key: "title_arabic", label: "Original title", placeholder: "Title in Arabic, if any" },
    ],
  },
  {
    title: "Publication",
    fields: [
      { key: "publisher", label: "Publisher", placeholder: "e.g. Darussalam" },
      { key: "language", label: "Language", placeholder: "English, Arabic, Bilingual" },
      { key: "binding_type", label: "Binding", placeholder: "Hardcover, Softcover" },
      { key: "script_type", label: "Script", placeholder: "Uthmani, Indo-Pak" },
      { key: "volume_count", label: "Volumes", type: "number" },
    ],
  },
  {
    title: "Identifiers & files",
    fields: [
      { key: "isbn_13", label: "ISBN-13", placeholder: "978…" },
      { key: "isbn_10", label: "ISBN-10" },
      { key: "sample_pdf_url", label: "Sample PDF link", type: "url", placeholder: "https://", wide: true },
    ],
  },
]
const BOOK_FIELDS = BOOK_GROUPS.flatMap((g) => g.fields)

/* ------------------------------------------------------------------ */
/* Conversions                                                         */
/* ------------------------------------------------------------------ */

let keySeq = 0
const nextKey = () => `v${++keySeq}`
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n))
const num = (s: string) => (s.trim() === "" ? null : Number(s))
const digits = (s: string) => s.replace(/\D/g, "")
const decimal = (s: string) => s.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")

function toLocalInput(iso: string | null) {
  if (!iso) {
    return ""
  }
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function emptyVariant(locations: Location[], option_value = ""): VariantForm {
  return {
    key: nextKey(),
    option_value,
    system_sku: null,
    custom_sku: "",
    selling_price: "",
    original_price: "",
    cost: "",
    low_stock_threshold: "",
    stock: Object.fromEntries(locations.map((l) => [l.id, "0"])),
  }
}

function blankForm(meta: Meta): Form {
  return {
    title: "",
    subtitle: "",
    handle: "",
    description_html: "",
    images: [],
    category_ids: [],
    primary_category_id: "",
    unit: meta.catalog.units[0] || "item",
    product_type: "standard",
    bundle_items: [],
    delivery_type: "physical",
    track_inventory: true,
    allow_backorder: false,
    shipping_size: "small",
    dims: { length: "", width: "", height: "", weight: "" },
    option_title: "Format",
    option_display: "buttons",
    variants: [emptyVariant(meta.locations, "Paperback")],
    status: "published",
    schedule: false,
    publish_at: "",
    pages: "",
    tags: [],
    release_date: "",
    preorder: false,
    series: "",
    bookseller_note: "",
    author_bio: "",
    editorial_reviews: [],
    book: {},
  }
}

function toForm(p: LoadedProduct, meta: Meta): Form {
  return {
    title: p.title,
    subtitle: p.subtitle || "",
    handle: p.handle,
    description_html: p.description_html || "",
    images: p.images,
    category_ids: p.category_ids,
    primary_category_id: p.primary_category_id || "",
    unit: p.unit,
    product_type: p.product_type,
    bundle_items: p.bundle_items,
    delivery_type: p.delivery_type,
    track_inventory: p.track_inventory,
    allow_backorder: p.allow_backorder,
    shipping_size: p.shipping_size,
    dims: {
      length: str(p.custom_dimensions?.length),
      width: str(p.custom_dimensions?.width),
      height: str(p.custom_dimensions?.height),
      weight: str(p.custom_dimensions?.weight),
    },
    option_title: p.option_title,
    option_display: p.option_display,
    variants: p.variants.map((v) => ({
      key: v.id,
      id: v.id,
      option_value: v.option_value,
      system_sku: v.system_sku,
      custom_sku: v.custom_sku || "",
      selling_price: str(v.selling_price || null),
      original_price: str(v.original_price),
      cost: str(v.cost),
      low_stock_threshold: str(v.low_stock_threshold),
      stock: Object.fromEntries(meta.locations.map((l) => [l.id, str(v.stock.find((s) => s.location_id === l.id)?.quantity ?? 0)])),
    })),
    status: p.status === "published" ? "published" : "draft",
    schedule: Boolean(p.publish_at),
    publish_at: toLocalInput(p.publish_at),
    pages: str(p.pages),
    tags: p.tags || [],
    release_date: p.release_date || "",
    preorder: p.preorder,
    series: p.series || "",
    bookseller_note: p.bookseller_note || "",
    author_bio: p.author_bio || "",
    editorial_reviews: p.editorial_reviews || [],
    book: Object.fromEntries(
      BOOK_FIELDS.map((f) => [f.key, p.book?.[f.key] === null || p.book?.[f.key] === undefined ? "" : String(p.book[f.key])])
    ),
  }
}

/** A copy of a product as a new, unsaved product. */
function duplicateOf(f: Form, locations: Location[]): Form {
  return {
    ...f,
    title: `${f.title} (copy)`,
    handle: "",
    status: "draft",
    schedule: false,
    publish_at: "",
    variants: f.variants.map((v) => ({
      ...v,
      key: nextKey(),
      id: undefined,
      system_sku: null,
      custom_sku: "",
      stock: Object.fromEntries(locations.map((l) => [l.id, "0"])),
    })),
  }
}

function toPayload(f: Form, locations: Location[]) {
  const book: Record<string, string | number | null> = {}
  for (const field of BOOK_FIELDS) {
    const v = (f.book[field.key] || "").trim()
    book[field.key] = field.type === "number" ? num(v) : v || null
  }
  return {
    title: f.title.trim(),
    subtitle: f.subtitle.trim() || null,
    handle: f.handle.trim() || null,
    description_html: f.description_html || null,
    images: f.images,
    thumbnail: f.images[0] || null,
    category_ids: f.category_ids,
    primary_category_id: f.primary_category_id || null,
    unit: f.unit,
    product_type: f.product_type,
    bundle_items: f.product_type === "bundle" ? f.bundle_items : [],
    delivery_type: f.delivery_type,
    track_inventory: f.track_inventory,
    allow_backorder: f.allow_backorder,
    shipping_size: f.delivery_type === "digital" ? "small" : f.shipping_size,
    custom_dimensions:
      f.shipping_size === "custom" && f.delivery_type === "physical"
        ? { length: Number(f.dims.length), width: Number(f.dims.width), height: Number(f.dims.height), weight: Number(f.dims.weight) }
        : null,
    option_title: f.option_title.trim() || "Format",
    option_display: f.option_display,
    variants: f.variants.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      option_value: v.option_value.trim(),
      custom_sku: v.custom_sku.trim() || null,
      selling_price: Number(v.selling_price),
      original_price: num(v.original_price),
      cost: num(v.cost),
      low_stock_threshold: num(v.low_stock_threshold),
      stock: locations.map((l) => ({ location_id: l.id, quantity: Math.max(0, Math.floor(Number(v.stock[l.id]) || 0)) })),
    })),
    status: f.status,
    publish_at: f.status === "draft" && f.schedule && f.publish_at ? new Date(f.publish_at).toISOString() : null,
    pages: num(f.pages),
    tags: f.tags,
    release_date: f.release_date || null,
    preorder: f.preorder,
    series: f.series.trim() || null,
    bookseller_note: f.bookseller_note.trim() || null,
    author_bio: f.author_bio.trim() || null,
    editorial_reviews: f.editorial_reviews.filter((r) => r.quote.trim()).map((r) => ({ quote: r.quote.trim(), source: r.source.trim() })),
    book,
  }
}

/** Mirrors the server checks so problems show next to the field. */
function validate(f: Form): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!f.title.trim()) {
    errors.title = "Give the product a title"
  }
  const seen = new Set<string>()
  f.variants.forEach((v) => {
    const value = v.option_value.trim().toLowerCase()
    if (!value) {
      errors[`${v.key}.option_value`] = "Name this format"
    } else if (seen.has(value)) {
      errors[`${v.key}.option_value`] = "Already used"
    }
    seen.add(value)
    if (!(Number(v.selling_price) > 0)) {
      errors[`${v.key}.selling_price`] = "Enter a price"
    }
    if (v.original_price && Number(v.original_price) > 0 && Number(v.original_price) <= Number(v.selling_price)) {
      errors[`${v.key}.original_price`] = "Must be higher than the price"
    }
  })
  if (f.shipping_size === "custom" && f.delivery_type === "physical") {
    for (const k of ["length", "width", "height", "weight"] as const) {
      if (!(Number(f.dims[k]) > 0)) {
        errors[`dims.${k}`] = "Required"
      }
    }
  }
  if (f.status === "draft" && f.schedule) {
    if (!f.publish_at) {
      errors.publish_at = "Pick a date and time"
    } else if (new Date(f.publish_at).getTime() < Date.now()) {
      errors.publish_at = "Choose a time in the future"
    }
  }
  if (f.product_type === "bundle" && !f.bundle_items.length) {
    errors.bundle = "Add the books in this bundle"
  }
  if (f.preorder && !f.release_date) {
    errors.release_date = "Pre-orders need a release date"
  }
  if (f.book.sample_pdf_url && !/^https?:\/\//i.test(f.book.sample_pdf_url)) {
    errors["book.sample_pdf_url"] = "Use a full link starting with https://"
  }
  return errors
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function Card({
  id,
  title,
  description,
  actions,
  children,
  bodyClassName,
}: {
  id?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  bodyClassName?: string
}) {
  return (
    <Container id={id} className="scroll-mt-24 p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-1 pt-5">
        <div className="min-w-0">
          <Heading level="h2">{title}</Heading>
          {description ? (
            <Text size="small" className="text-ui-fg-subtle mt-1">
              {description}
            </Text>
          ) : null}
        </div>
        {actions}
      </div>
      <div className={clx("flex flex-col gap-5 px-6 pb-6 pt-4", bodyClassName)}>{children}</div>
    </Container>
  )
}

function Labeled({
  label,
  htmlFor,
  hint,
  error,
  optional,
  action,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: ReactNode
  error?: string
  optional?: boolean
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clx("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="txt-compact-small-plus text-ui-fg-base">
          {label}
          {optional ? <span className="text-ui-fg-muted font-normal"> · optional</span> : null}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <Text size="xsmall" className="text-ui-fg-error" role="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          {hint}
        </Text>
      ) : null}
    </div>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="txt-compact-xsmall-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover">
      {children}
    </button>
  )
}

function MoneyInput({
  id,
  value,
  onChange,
  invalid,
  placeholder,
  compact,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  placeholder?: string
  compact?: boolean
}) {
  return (
    <div className="relative">
      <span className="txt-compact-xsmall-plus text-ui-fg-muted pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2">KES</span>
      <Input
        id={id}
        size="small"
        inputMode="decimal"
        autoComplete="off"
        className={clx("mr-tabular pl-10 text-right", compact && "min-w-[7.5rem]")}
        aria-invalid={invalid || undefined}
        placeholder={placeholder ?? "0"}
        value={value}
        onChange={(e) => onChange(decimal(e.target.value))}
      />
    </div>
  )
}

function Segment<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div className="bg-ui-bg-component grid rounded-lg p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clx(
            "txt-compact-small-plus rounded-md px-3 py-1.5 transition-colors",
            value === o.value ? "bg-ui-bg-base shadow-elevation-card-rest text-ui-fg-base" : "text-ui-fg-subtle hover:text-ui-fg-base"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function CheckRow({
  checked,
  onChange,
  title,
  body,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  body?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      <span className="min-w-0">
        <span className="txt-compact-small-plus text-ui-fg-base block">{title}</span>
        {body ? <span className="txt-compact-xsmall text-ui-fg-subtle mt-0.5 block">{body}</span> : null}
      </span>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const SECTIONS = [
  { id: "basics", label: "Basics" },
  { id: "media", label: "Images" },
  { id: "pricing", label: "Pricing" },
  { id: "inventory", label: "Inventory" },
  { id: "shipping", label: "Shipping" },
  { id: "details", label: "Book details" },
  { id: "extras", label: "Product page" },
  { id: "seo", label: "Search listing" },
]

const ProductEditorPage = () => {
  const { id = "new" } = useParams()
  const isNew = id === "new"
  const navigate = useNavigate()
  const location = useLocation()
  const prompt = usePrompt()
  const copyFrom = (location.state as { copy?: Form } | null)?.copy

  const meta = useApi<Meta>("/admin/maktabah/catalog/meta")
  const loaded = useApi<{ product: LoadedProduct }>(isNew ? null : `/admin/maktabah/catalog/${id}`)
  const product = loaded.data?.product || null

  const [form, setForm] = useState<Form | null>(null)
  const [snapshot, setSnapshot] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [manage, setManage] = useState<ManageKind | null>(null)

  useEffect(() => {
    if (!meta.data || (!isNew && !product)) {
      return
    }
    const base = isNew ? blankForm(meta.data) : toForm(product as LoadedProduct, meta.data)
    const next = isNew && copyFrom ? copyFrom : base
    setForm(next)
    setSnapshot(JSON.stringify(isNew ? base : next))
    setErrors({})
  }, [meta.data, product, isNew, copyFrom])

  const dirty = form !== null && JSON.stringify(form) !== snapshot

  useEffect(() => {
    if (!dirty) {
      return
    }
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const set = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setErrors((e) => {
      if (!e[key as string]) {
        return e
      }
      const next = { ...e }
      delete next[key as string]
      return next
    })
  }, [])

  const setVariant = useCallback((key: string, patch: Partial<VariantForm>) => {
    setForm((f) => (f ? { ...f, variants: f.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) } : f))
    setErrors((e) => {
      const touched = Object.keys(patch).map((k) => `${key}.${k}`)
      if (!touched.some((k) => e[k])) {
        return e
      }
      const next = { ...e }
      touched.forEach((k) => delete next[k])
      return next
    })
  }, [])

  const save = useCallback(async () => {
    if (!form || !meta.data || saving) {
      return
    }
    const problems = validate(form)
    setErrors(problems)
    if (Object.keys(problems).length) {
      toast.error(`Fix ${Object.keys(problems).length === 1 ? "1 field" : `${Object.keys(problems).length} fields`} before saving`)
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>("[aria-invalid='true']")
        el?.scrollIntoView({ block: "center", behavior: "smooth" })
        el?.focus({ preventScroll: true })
      })
      return
    }
    setSaving(true)
    try {
      const result = await api<{ id: string }>(isNew ? "/admin/maktabah/catalog" : `/admin/maktabah/catalog/${id}`, {
        method: "POST",
        json: toPayload(form, meta.data.locations),
      })
      toast.success(isNew ? "Product created" : "Changes saved")
      if (isNew) {
        setSnapshot(JSON.stringify(form))
        navigate(`/products/catalog/${result.id}`, { replace: true, state: null })
      } else {
        loaded.reload()
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [form, meta.data, saving, isNew, id, navigate, loaded])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [save])

  const leave = async (to: string) => {
    if (dirty) {
      const ok = await prompt({
        title: "Leave without saving?",
        description: "Your changes to this product will be lost.",
        confirmText: "Leave",
        cancelText: "Keep editing",
      })
      if (!ok) {
        return
      }
      setSnapshot(JSON.stringify(form))
    }
    navigate(to)
  }

  const discard = async () => {
    const ok = await prompt({
      title: "Discard changes?",
      description: "Everything you changed since the last save will be lost.",
      confirmText: "Discard",
      cancelText: "Keep editing",
    })
    if (ok) {
      setForm(JSON.parse(snapshot) as Form)
      setErrors({})
    }
  }

  const remove = async () => {
    const ok = await prompt({
      title: `Delete “${form?.title || "this product"}”?`,
      description: "It is removed from the store with its formats and prices. Past orders keep their line items. This cannot be undone.",
      confirmText: "Delete product",
      cancelText: "Cancel",
    })
    if (!ok) {
      return
    }
    try {
      await api(`/admin/maktabah/catalog/${id}`, { method: "DELETE" })
      setSnapshot(JSON.stringify(form))
      toast.success("Product deleted")
      navigate("/products/catalog")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const saveCatalogSettings = async (next: CatalogSettings) => {
    await api("/admin/maktabah/settings/catalog", { method: "POST", json: { value: next } })
    meta.setData((m) => (m ? { ...m, catalog: next } : m))
  }

  const error = meta.error || loaded.error
  if (error) {
    return (
      <Container className="px-6 py-6">
        <Text className="text-ui-fg-error">{error}</Text>
        <Button size="small" variant="secondary" className="mt-3" onClick={() => navigate("/products/catalog")}>
          Back to products
        </Button>
      </Container>
    )
  }
  if (!form || !meta.data) {
    return (
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-3">
          {[220, 280, 200].map((h) => (
            <Container key={h} className="bg-ui-bg-component animate-pulse" style={{ height: h }} />
          ))}
        </div>
        <Container className="bg-ui-bg-component hidden animate-pulse xl:block" style={{ height: 320 }} />
      </div>
    )
  }

  const m = meta.data
  const multi = form.variants.length > 1
  const storefrontPath = product?.handle && product.status === "published" ? `/books/${product.handle}` : null
  const statusBadge = isNew ? null : product?.status === "published" ? (
    <Badge size="2xsmall" color="green">
      Published
    </Badge>
  ) : product?.publish_at ? (
    <Badge size="2xsmall" color="blue">
      Scheduled
    </Badge>
  ) : (
    <Badge size="2xsmall">Draft</Badge>
  )

  return (
    <div className="flex flex-col gap-3 pb-10">
      {/* Sticky header: title, state and the save actions stay in reach. */}
      <div className="bg-ui-bg-subtle/95 sticky top-0 z-20 -mx-3 -mt-3 px-3 pb-2 pt-3 backdrop-blur supports-[backdrop-filter]:bg-ui-bg-subtle/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <IconButton size="small" variant="transparent" aria-label="Back to products" onClick={() => leave("/products/catalog")}>
              <ArrowLeft />
            </IconButton>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <Heading level="h1" className="truncate">
                  {isNew ? (copyFrom ? "Duplicate product" : "Add product") : form.title || "Untitled product"}
                </Heading>
                {statusBadge}
              </div>
              <Text size="xsmall" className="text-ui-fg-subtle mr-tabular">
                {isNew ? "A product number is assigned when you save" : `Product no. ${product?.product_number ?? "—"}`}
              </Text>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty ? (
              <span className="txt-compact-small text-ui-fg-subtle hidden items-center gap-1.5 md:flex">
                <span className="bg-ui-tag-orange-icon h-1.5 w-1.5 rounded-full" aria-hidden />
                Unsaved changes
              </span>
            ) : null}
            {dirty && !isNew ? (
              <Button size="small" variant="secondary" onClick={discard} disabled={saving}>
                Discard
              </Button>
            ) : null}
            {!isNew ? (
              <DropdownMenu>
                <DropdownMenu.Trigger asChild>
                  <IconButton size="small" aria-label="More actions">
                    <EllipsisHorizontal />
                  </IconButton>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  {storefrontPath ? (
                    <DropdownMenu.Item onClick={() => window.open(`${m.storefront_url}${storefrontPath}`, "_blank", "noopener")}>
                      View in store
                    </DropdownMenu.Item>
                  ) : null}
                  <DropdownMenu.Item onClick={() => navigate("/products/catalog/new", { state: { copy: duplicateOf(form, m.locations) } })}>
                    Duplicate
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onClick={() => leave(`/products/${id}?classic=1`)}>Advanced settings</DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item className="text-ui-fg-error" onClick={remove}>
                    <Trash className="mr-2" />
                    Delete product
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            ) : null}
            <Button size="small" isLoading={saving} onClick={save} disabled={!isNew && !dirty}>
              {isNew ? "Save product" : "Save"}
              <Kbd className="ml-1 hidden bg-transparent text-current opacity-60 lg:inline-flex">
                {typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘S" : "Ctrl S"}
              </Kbd>
            </Button>
          </div>
        </div>
        <nav className="-mx-1 mt-2 hidden gap-1 overflow-x-auto lg:flex" aria-label="Jump to section">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
              }}
              className="txt-compact-xsmall-plus text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base shrink-0 rounded-full px-2.5 py-1"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-3">
          <Card id="basics" title="Basics">
            <Labeled label="Title" htmlFor="title" error={errors.title}>
              <Input
                id="title"
                aria-invalid={Boolean(errors.title) || undefined}
                value={form.title}
                placeholder="e.g. Riyad-us-Saliheen (2 Volume Set)"
                onChange={(e) => set("title", e.target.value)}
              />
            </Labeled>
            <Labeled label="Subtitle" htmlFor="subtitle" optional>
              <Input id="subtitle" value={form.subtitle} placeholder="Edition, series or a short strapline" onChange={(e) => set("subtitle", e.target.value)} />
            </Labeled>
            <Labeled label="Description">
              <RichTextEditor
                value={form.description_html}
                onChange={(html) => set("description_html", html)}
                templates={m.catalog.descriptionTemplates}
                onManageTemplates={() => setManage("descriptionTemplates")}
              />
            </Labeled>
          </Card>

          <Card id="media" title="Images" description="The first image is the cover in listings and search. Drag to reorder.">
            <ImageManager images={form.images} onChange={(images) => set("images", images)} />
          </Card>

          <PricingCard
            form={form}
            setForm={setForm}
            set={set}
            setVariant={setVariant}
            errors={errors}
            locations={m.locations}
            presets={m.catalog.optionPresets}
            onManagePresets={() => setManage("optionPresets")}
          />

          <InventoryCard form={form} set={set} setVariant={setVariant} locations={m.locations} multi={multi} />

          <ShippingCard form={form} set={set} errors={errors} sizes={m.shipping_sizes} />

          <Card id="details" title="Book details" description="Shown in Product Details on the book page and used by search filters.">
            {BOOK_GROUPS.map((group) => (
              <fieldset key={group.title} className="flex flex-col gap-3">
                <legend className="txt-compact-xsmall-plus text-ui-fg-muted mb-3 uppercase tracking-wide">{group.title}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.fields.map((f) => (
                    <Labeled
                      key={f.key}
                      label={f.label}
                      htmlFor={`book-${f.key}`}
                      error={errors[`book.${f.key}`]}
                      className={f.wide ? "sm:col-span-2" : undefined}
                    >
                      <Input
                        id={`book-${f.key}`}
                        size="small"
                        type={f.type === "url" ? "url" : "text"}
                        inputMode={f.type === "number" ? "numeric" : undefined}
                        placeholder={f.placeholder}
                        dir={f.key === "title_arabic" ? "auto" : undefined}
                        aria-invalid={Boolean(errors[`book.${f.key}`]) || undefined}
                        value={form.book[f.key] || ""}
                        onChange={(e) => set("book", { ...form.book, [f.key]: f.type === "number" ? digits(e.target.value) : e.target.value })}
                      />
                    </Labeled>
                  ))}
                  {group.title === "Publication" ? (
                    <>
                      <Labeled label="Pages" htmlFor="pages">
                        <Input id="pages" size="small" inputMode="numeric" value={form.pages} onChange={(e) => set("pages", digits(e.target.value))} />
                      </Labeled>
                      <Labeled label="Series" htmlFor="series" className="sm:col-span-2">
                        <Input id="series" size="small" placeholder="e.g. Tafsir Ibn Kathir" value={form.series} onChange={(e) => set("series", e.target.value)} />
                      </Labeled>
                    </>
                  ) : null}
                </div>
              </fieldset>
            ))}
          </Card>

          <ExtrasCard form={form} set={set} />

          <SeoCard form={form} set={set} storefrontUrl={m.storefront_url} />
        </div>

        {/* Sidebar */}
        <div className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-28">
          <Card title="Status">
            <Segment
              label="Status"
              value={form.status}
              onChange={(v) => set("status", v)}
              options={[
                { value: "published", label: "Published" },
                { value: "draft", label: "Draft" },
              ]}
            />
            {form.status === "draft" ? (
              <div className="flex flex-col gap-3">
                <CheckRow
                  checked={form.schedule}
                  onChange={(v) => set("schedule", v)}
                  title="Publish automatically"
                  body="Goes live at the time you choose."
                />
                {form.schedule ? (
                  <Labeled label="Publish on" htmlFor="publish_at" error={errors.publish_at}>
                    <Input
                      id="publish_at"
                      type="datetime-local"
                      size="small"
                      aria-invalid={Boolean(errors.publish_at) || undefined}
                      value={form.publish_at}
                      onChange={(e) => set("publish_at", e.target.value)}
                    />
                  </Labeled>
                ) : (
                  <Text size="xsmall" className="text-ui-fg-muted">
                    Drafts are hidden from the store.
                  </Text>
                )}
              </div>
            ) : (
              <Text size="xsmall" className="text-ui-fg-muted -mt-2">
                Visible in the store and in search.
              </Text>
            )}
            <div className="border-ui-border-base flex flex-col gap-3 border-t pt-4">
              <Labeled label="Release date" htmlFor="release_date" optional={!form.preorder} error={errors.release_date}>
                <Input
                  id="release_date"
                  type="date"
                  size="small"
                  aria-invalid={Boolean(errors.release_date) || undefined}
                  value={form.release_date}
                  onChange={(e) => set("release_date", e.target.value)}
                />
              </Labeled>
              <CheckRow
                checked={form.preorder}
                onChange={(v) => set("preorder", v)}
                title="Take pre-orders"
                body="Customers can order now; it ships on the release date."
              />
            </div>
          </Card>

          <OrganisationCard
            form={form}
            set={set}
            categories={m.categories}
            tags={m.tags}
            units={m.catalog.units}
            onManageUnits={() => setManage("units")}
            onCategoryCreated={(c) =>
              meta.setData((d) => (d ? { ...d, categories: [...d.categories, c].sort((a, b) => a.name.localeCompare(b.name)) } : d))
            }
          />

          <Card title="Product type">
            <Segment
              label="Product type"
              value={form.product_type}
              onChange={(v) => set("product_type", v)}
              options={[
                { value: "standard", label: "Single product" },
                { value: "bundle", label: "Bundle" },
              ]}
            />
            {form.product_type === "bundle" ? (
              <BundlePicker
                items={form.bundle_items}
                onChange={(items) => set("bundle_items", items)}
                products={m.products.filter((p) => p.id !== id)}
                error={errors.bundle}
              />
            ) : (
              <Text size="xsmall" className="text-ui-fg-muted -mt-2">
                Choose Bundle to sell several books together at one price.
              </Text>
            )}
          </Card>
        </div>
      </div>

      <ManageDrawer kind={manage} settings={m.catalog} onClose={() => setManage(null)} onSave={saveCatalogSettings} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pricing & formats                                                   */
/* ------------------------------------------------------------------ */

type SetFn = <K extends keyof Form>(key: K, value: Form[K]) => void

function PriceSummary({ v }: { v: VariantForm }) {
  const selling = Number(v.selling_price) || 0
  const original = Number(v.original_price) || 0
  const cost = Number(v.cost) || 0
  const parts: string[] = []
  if (original > selling && selling > 0) {
    parts.push(`On sale: ${Math.round((1 - selling / original) * 100)}% off`)
  }
  if (selling > 0 && v.cost.trim() !== "") {
    parts.push(`Margin ${Math.round(((selling - cost) / selling) * 100)}%`)
    parts.push(`Profit ${money(selling - cost, "kes")}`)
  }
  if (!parts.length) {
    return null
  }
  return (
    <div className="bg-ui-bg-subtle txt-compact-small text-ui-fg-subtle flex flex-wrap gap-x-4 gap-y-1 rounded-md px-3 py-2">
      {parts.map((p) => (
        <span key={p} className="mr-tabular">
          {p}
        </span>
      ))}
    </div>
  )
}

function PricingCard({
  form,
  setForm,
  set,
  setVariant,
  errors,
  locations,
  presets,
  onManagePresets,
}: {
  form: Form
  setForm: React.Dispatch<React.SetStateAction<Form | null>>
  set: SetFn
  setVariant: (key: string, patch: Partial<VariantForm>) => void
  errors: Record<string, string>
  locations: Location[]
  presets: string[]
  onManagePresets: () => void
}) {
  const multi = form.variants.length > 1
  const [open, setOpen] = useState<string | null>(null)
  const listId = "mr-option-presets"

  const add = () => {
    const used = new Set(form.variants.map((v) => v.option_value.trim().toLowerCase()))
    const suggestion = presets.find((p) => !used.has(p.toLowerCase())) || ""
    const fresh = emptyVariant(locations, suggestion)
    setForm((f) => (f ? { ...f, variants: [...f.variants, fresh] } : f))
    setOpen(fresh.key)
  }
  const remove = (key: string) => setForm((f) => (f && f.variants.length > 1 ? { ...f, variants: f.variants.filter((v) => v.key !== key) } : f))

  const presetList = (
    <datalist id={listId}>
      {presets.map((p) => (
        <option key={p} value={p} />
      ))}
    </datalist>
  )

  if (!multi) {
    const v = form.variants[0]
    const err = (k: string) => errors[`${v.key}.${k}`]
    return (
      <Card
        id="pricing"
        title="Pricing"
        description="Set prices in KES. Other currencies are converted automatically."
        actions={
          <Button size="small" variant="secondary" onClick={add}>
            <Plus /> Add a format
          </Button>
        }
      >
        {presetList}
        <div className="grid gap-4 sm:grid-cols-3">
          <Labeled label="Price" htmlFor="price" error={err("selling_price")}>
            <MoneyInput id="price" value={v.selling_price} invalid={Boolean(err("selling_price"))} onChange={(x) => setVariant(v.key, { selling_price: x })} />
          </Labeled>
          <Labeled label="Was price" htmlFor="was" optional error={err("original_price")} hint="Shows the price crossed out.">
            <MoneyInput id="was" value={v.original_price} placeholder="" invalid={Boolean(err("original_price"))} onChange={(x) => setVariant(v.key, { original_price: x })} />
          </Labeled>
          <Labeled label="Cost per item" htmlFor="cost" optional hint="Never shown to customers.">
            <MoneyInput id="cost" value={v.cost} placeholder="" onChange={(x) => setVariant(v.key, { cost: x })} />
          </Labeled>
        </div>
        <PriceSummary v={v} />
        <Labeled
          label="Format"
          htmlFor="format"
          error={err("option_value")}
          hint="Shown on the book page, e.g. Hardcover. Add a format to sell more than one."
          action={<LinkButton onClick={onManagePresets}>Saved formats</LinkButton>}
        >
          <Input
            id="format"
            size="small"
            list={listId}
            aria-invalid={Boolean(err("option_value")) || undefined}
            value={v.option_value}
            onChange={(e) => setVariant(v.key, { option_value: e.target.value })}
          />
        </Labeled>
      </Card>
    )
  }

  return (
    <Card
      id="pricing"
      title="Formats & pricing"
      description="Each format has its own price, SKU and stock. Prices are in KES."
      actions={
        <Button size="small" variant="secondary" onClick={add}>
          <Plus /> Add format
        </Button>
      }
      bodyClassName="px-0"
    >
      {presetList}
      <div className="grid gap-3 px-6 sm:grid-cols-[1fr_1fr_auto]">
        <Labeled label="Option name" htmlFor="option_title" hint="What customers choose, e.g. Format or Edition.">
          <Input id="option_title" size="small" value={form.option_title} onChange={(e) => set("option_title", e.target.value)} />
        </Labeled>
        <Labeled label="Shown as">
          <Select value={form.option_display} onValueChange={(v) => set("option_display", v as Form["option_display"])}>
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="buttons">Buttons</Select.Item>
              <Select.Item value="dropdown">Dropdown</Select.Item>
            </Select.Content>
          </Select>
        </Labeled>
        <div className="flex items-end pb-1.5">
          <LinkButton onClick={onManagePresets}>Saved formats</LinkButton>
        </div>
      </div>

      <div className="border-ui-border-base overflow-x-auto border-y">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="txt-compact-xsmall-plus text-ui-fg-subtle bg-ui-bg-subtle text-left">
              <th className="px-6 py-2 font-medium">Format</th>
              <th className="px-2 py-2 font-medium">Price</th>
              <th className="px-2 py-2 font-medium">Was price</th>
              <th className="px-2 py-2 text-right font-medium">{form.track_inventory ? "Stock" : ""}</th>
              <th className="w-20 py-2 pr-4" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {form.variants.map((v) => {
              const err = (k: string) => errors[`${v.key}.${k}`]
              const expanded = open === v.key || Boolean(err("original_price"))
              const total = locations.reduce((n, l) => n + (Number(v.stock[l.id]) || 0), 0)
              return (
                <Fragment key={v.key}>
                  <tr className="border-ui-border-base border-t align-top">
                    <td className="py-2.5 pl-6 pr-2">
                      <Input
                        size="small"
                        list={listId}
                        aria-label="Format name"
                        aria-invalid={Boolean(err("option_value")) || undefined}
                        value={v.option_value}
                        placeholder="e.g. Hardcover"
                        onChange={(e) => setVariant(v.key, { option_value: e.target.value })}
                      />
                      {err("option_value") ? (
                        <Text size="xsmall" className="text-ui-fg-error mt-1">
                          {err("option_value")}
                        </Text>
                      ) : null}
                    </td>
                    <td className="px-2 py-2.5">
                      <MoneyInput compact value={v.selling_price} invalid={Boolean(err("selling_price"))} onChange={(x) => setVariant(v.key, { selling_price: x })} />
                    </td>
                    <td className="px-2 py-2.5">
                      <MoneyInput compact value={v.original_price} placeholder="" invalid={Boolean(err("original_price"))} onChange={(x) => setVariant(v.key, { original_price: x })} />
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {form.track_inventory ? (
                        locations.length === 1 ? (
                          <Input
                            size="small"
                            inputMode="numeric"
                            aria-label={`Stock of ${v.option_value || "this format"}`}
                            className="mr-tabular ml-auto w-20 text-right"
                            value={v.stock[locations[0].id] ?? "0"}
                            onChange={(e) => setVariant(v.key, { stock: { ...v.stock, [locations[0].id]: digits(e.target.value) } })}
                          />
                        ) : (
                          <span className="txt-compact-small mr-tabular inline-block pt-1.5">{total}</span>
                        )
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex justify-end gap-0.5">
                        <IconButton
                          size="small"
                          variant="transparent"
                          aria-label={expanded ? "Hide details" : "More details"}
                          aria-expanded={expanded}
                          onClick={() => setOpen(expanded ? null : v.key)}
                        >
                          <ChevronDownMini className={clx("transition-transform", expanded && "rotate-180")} />
                        </IconButton>
                        <IconButton size="small" variant="transparent" aria-label={`Remove ${v.option_value || "format"}`} onClick={() => remove(v.key)}>
                          <Trash />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="bg-ui-bg-subtle/60">
                      <td colSpan={5} className="px-6 pb-4 pt-1">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <Labeled label="Cost per item" optional>
                            <MoneyInput value={v.cost} placeholder="" onChange={(x) => setVariant(v.key, { cost: x })} />
                          </Labeled>
                          <Labeled label="Low stock alert" optional>
                            <Input
                              size="small"
                              inputMode="numeric"
                              className="mr-tabular"
                              placeholder="e.g. 3"
                              value={v.low_stock_threshold}
                              onChange={(e) => setVariant(v.key, { low_stock_threshold: digits(e.target.value) })}
                            />
                          </Labeled>
                          <SkuField v={v} setVariant={setVariant} className="sm:col-span-2" />
                          {err("original_price") ? (
                            <Text size="xsmall" className="text-ui-fg-error sm:col-span-2 lg:col-span-4">
                              Was price: {err("original_price")}
                            </Text>
                          ) : null}
                          <div className="sm:col-span-2 lg:col-span-4">
                            <PriceSummary v={v} />
                          </div>
                          {form.track_inventory && locations.length > 1 ? (
                            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-4">
                              {locations.map((l) => (
                                <Labeled key={l.id} label={l.name}>
                                  <Input
                                    size="small"
                                    inputMode="numeric"
                                    className="mr-tabular"
                                    value={v.stock[l.id] ?? "0"}
                                    onChange={(e) => setVariant(v.key, { stock: { ...v.stock, [l.id]: digits(e.target.value) } })}
                                  />
                                </Labeled>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SkuField({
  v,
  setVariant,
  className,
}: {
  v: VariantForm
  setVariant: (key: string, patch: Partial<VariantForm>) => void
  className?: string
}) {
  return (
    <Labeled
      label="SKU"
      className={className}
      hint={
        v.system_sku ? (
          <span className="inline-flex items-center gap-1">
            System SKU <span className="font-mono">{v.system_sku}</span>
            <Copy content={v.system_sku} className="text-ui-fg-muted" />
            {v.custom_sku.trim() ? " · your SKU is used on orders" : " · used when yours is empty"}
          </span>
        ) : (
          "Leave empty and a system SKU is created when you save."
        )
      }
    >
      <Input size="small" className="font-mono" value={v.custom_sku} placeholder={v.system_sku || "Your own SKU"} onChange={(e) => setVariant(v.key, { custom_sku: e.target.value })} />
    </Labeled>
  )
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

function InventoryCard({
  form,
  set,
  setVariant,
  locations,
  multi,
}: {
  form: Form
  set: SetFn
  setVariant: (key: string, patch: Partial<VariantForm>) => void
  locations: Location[]
  multi: boolean
}) {
  const v = form.variants[0]
  return (
    <Card id="inventory" title="Inventory">
      {!multi ? <SkuField v={v} setVariant={setVariant} /> : null}
      <CheckRow
        checked={form.track_inventory}
        onChange={(x) => set("track_inventory", x)}
        title="Track quantity"
        body="Counts copies and stops sales when none are left."
      />
      {form.track_inventory ? (
        <>
          {!multi ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {locations.map((l) => (
                <Labeled key={l.id} label={locations.length === 1 ? "Quantity in stock" : l.name} hint={locations.length === 1 ? l.name : undefined}>
                  <Input
                    size="small"
                    inputMode="numeric"
                    className="mr-tabular"
                    value={v.stock[l.id] ?? "0"}
                    onChange={(e) => setVariant(v.key, { stock: { ...v.stock, [l.id]: digits(e.target.value) } })}
                  />
                </Labeled>
              ))}
              <Labeled label="Low stock alert" optional hint="Flagged on the dashboard at or below this.">
                <Input
                  size="small"
                  inputMode="numeric"
                  className="mr-tabular"
                  placeholder="e.g. 3"
                  value={v.low_stock_threshold}
                  onChange={(e) => setVariant(v.key, { low_stock_threshold: digits(e.target.value) })}
                />
              </Labeled>
            </div>
          ) : (
            <Text size="xsmall" className="text-ui-fg-muted -mt-2">
              Stock for each format is set in Formats & pricing.
            </Text>
          )}
          <CheckRow
            checked={form.allow_backorder}
            onChange={(x) => set("allow_backorder", x)}
            title="Keep selling when out of stock"
            body="Orders are accepted and shipped when new copies arrive."
          />
        </>
      ) : null}
      {locations.length ? null : (
        <Text size="small" className="text-ui-fg-subtle">
          Add a stock location in <Link to="/settings/locations" className="text-ui-fg-interactive">Settings → Locations</Link> to track stock.
        </Text>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Shipping                                                            */
/* ------------------------------------------------------------------ */

function ShippingCard({
  form,
  set,
  errors,
  sizes,
}: {
  form: Form
  set: SetFn
  errors: Record<string, string>
  sizes: ShippingSizeOption[]
}) {
  const weight = (g: number) => (g >= 1000 ? `${(g / 1000).toLocaleString("en", { maximumFractionDigits: 1 })} kg` : `${g} g`)
  return (
    <Card id="shipping" title="Shipping" description="Used to quote courier rates at checkout.">
      <Segment
        label="Delivery type"
        value={form.delivery_type}
        onChange={(v) => set("delivery_type", v)}
        options={[
          { value: "physical", label: "Physical product" },
          { value: "digital", label: "Digital download" },
        ]}
      />
      {form.delivery_type === "physical" ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Parcel size">
            {[...sizes, { value: "custom", label: "Custom size", length: 0, width: 0, height: 0, weight: 0 }].map((s) => {
              const active = form.shipping_size === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set("shipping_size", s.value)}
                  className={clx(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    active ? "border-ui-border-interactive bg-ui-bg-highlight shadow-borders-interactive-with-active" : "border-ui-border-base hover:bg-ui-bg-base-hover"
                  )}
                >
                  <span
                    className={clx(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      active ? "border-ui-fg-interactive" : "border-ui-border-strong"
                    )}
                    aria-hidden
                  >
                    {active ? <span className="bg-ui-fg-interactive h-2 w-2 rounded-full" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="txt-compact-small-plus text-ui-fg-base block">{s.label.replace(/\s*\(.*\)$/, "")}</span>
                    <span className="txt-compact-xsmall text-ui-fg-subtle mr-tabular block">
                      {s.value === "custom" ? "Enter exact dimensions" : `${s.length} × ${s.width} × ${s.height} cm · ${weight(s.weight)}`}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          {form.shipping_size === "custom" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["length", "Length", "cm"],
                  ["width", "Width", "cm"],
                  ["height", "Height", "cm"],
                  ["weight", "Weight", "g"],
                ] as const
              ).map(([k, label, unit]) => (
                <Labeled key={k} label={`${label} (${unit})`} error={errors[`dims.${k}`]}>
                  <Input
                    size="small"
                    inputMode="decimal"
                    className="mr-tabular"
                    aria-invalid={Boolean(errors[`dims.${k}`]) || undefined}
                    value={form.dims[k]}
                    onChange={(e) => set("dims", { ...form.dims, [k]: decimal(e.target.value) })}
                  />
                </Labeled>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <Text size="small" className="text-ui-fg-subtle">
          No parcel is shipped. Add the download link to the description or send it after purchase.
        </Text>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Product page extras and search listing                              */
/* ------------------------------------------------------------------ */

function ExtrasCard({ form, set }: { form: Form; set: SetFn }) {
  const reviews = form.editorial_reviews
  return (
    <Card id="extras" title="Product page extras" description="Optional content that makes the book page richer.">
      <Labeled label="Bookseller's note" htmlFor="note" optional hint="A short personal recommendation, shown beside the overview.">
        <Textarea id="note" rows={2} value={form.bookseller_note} onChange={(e) => set("bookseller_note", e.target.value)} />
      </Labeled>
      <Labeled label="About the author" htmlFor="bio" optional>
        <Textarea id="bio" rows={3} value={form.author_bio} onChange={(e) => set("author_bio", e.target.value)} />
      </Labeled>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="txt-compact-small-plus">
            Editorial reviews <span className="text-ui-fg-muted font-normal">· optional</span>
          </span>
          <Button size="small" variant="transparent" onClick={() => set("editorial_reviews", [...reviews, { quote: "", source: "" }])} disabled={reviews.length >= 10}>
            <Plus /> Add review
          </Button>
        </div>
        {reviews.map((r, i) => (
          <div key={i} className="border-ui-border-base grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_200px_auto]">
            <Textarea
              rows={2}
              aria-label={`Review ${i + 1} quote`}
              placeholder="“An essential reference…”"
              value={r.quote}
              onChange={(e) => set("editorial_reviews", reviews.map((x, j) => (j === i ? { ...x, quote: e.target.value } : x)))}
            />
            <Input
              size="small"
              aria-label={`Review ${i + 1} source`}
              placeholder="Source"
              value={r.source}
              onChange={(e) => set("editorial_reviews", reviews.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}
            />
            <IconButton size="small" variant="transparent" aria-label={`Remove review ${i + 1}`} onClick={() => set("editorial_reviews", reviews.filter((_, j) => j !== i))}>
              <Trash />
            </IconButton>
          </div>
        ))}
      </div>
    </Card>
  )
}

function SeoCard({ form, set, storefrontUrl }: { form: Form; set: SetFn; storefrontUrl: string }) {
  const handle =
    form.handle ||
    form.title
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
  const text = form.description_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  return (
    <Card id="seo" title="Search listing" description="How the book can appear in Google and when shared.">
      <div className="border-ui-border-base rounded-lg border px-4 py-3">
        <Text size="xsmall" className="text-ui-fg-subtle truncate">
          {storefrontUrl.replace(/^https?:\/\//, "")} › books › {handle || "…"}
        </Text>
        <p className="mt-0.5 truncate text-[17px] leading-snug text-[#1a0dab]">{form.title || "Product title"} | Maktabah Ruhayn</p>
        <Text size="small" className="text-ui-fg-subtle mt-0.5 line-clamp-2">
          {text || "Add a description to control the summary search engines show."}
        </Text>
      </div>
      <Labeled label="URL handle" htmlFor="handle" hint="Changing it breaks links people already shared.">
        <div className="flex items-center">
          <span className="bg-ui-bg-subtle border-ui-border-base txt-compact-small text-ui-fg-muted flex h-8 items-center rounded-l-md border border-r-0 px-2.5">/books/</span>
          <Input
            id="handle"
            size="small"
            className="rounded-l-none"
            placeholder={handle || "generated-from-title"}
            value={form.handle}
            onChange={(e) => set("handle", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
          />
        </div>
      </Labeled>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Organisation: categories, collections, unit                         */
/* ------------------------------------------------------------------ */

function OrganisationCard({
  form,
  set,
  categories,
  tags,
  units,
  onManageUnits,
  onCategoryCreated,
}: {
  form: Form
  set: SetFn
  categories: Category[]
  tags: { value: string; label: string }[]
  units: string[]
  onManageUnits: () => void
  onCategoryCreated: (c: Category) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [creating, setCreating] = useState(false)
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const selected = form.category_ids.map((cid) => byId.get(cid)).filter((c): c is Category => Boolean(c))
  const primary = form.primary_category_id || selected[0]?.id || ""
  const filtered = categories.filter((c) => (q ? c.name.toLowerCase().includes(q.toLowerCase()) : true))
  const exact = categories.some((c) => c.name.toLowerCase() === q.trim().toLowerCase())

  const toggle = (cid: string, on: boolean) => {
    const ids = on ? [...form.category_ids, cid] : form.category_ids.filter((x) => x !== cid)
    set("category_ids", ids)
    if (!on && form.primary_category_id === cid) {
      set("primary_category_id", ids[0] || "")
    } else if (on && !form.primary_category_id) {
      set("primary_category_id", cid)
    }
  }

  const create = async () => {
    const name = q.trim()
    if (!name) {
      return
    }
    setCreating(true)
    try {
      const { category } = await api<{ category: { id: string; name: string; handle: string } }>("/admin/maktabah/categories", {
        method: "POST",
        json: { name },
      })
      onCategoryCreated({ ...category, parent_category_id: null })
      toggle(category.id, true)
      setQ("")
      toast.success(`Category “${category.name}” created`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const unitOptions = units.includes(form.unit) ? units : [...units, form.unit]

  return (
    <Card title="Organisation">
      <Labeled label="Categories" action={<Link to="/categories" className="txt-compact-xsmall-plus text-ui-fg-interactive">Manage</Link>} hint={selected.length > 1 ? "★ marks the main category, used for breadcrumbs and “You may also like”." : undefined}>
        {selected.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {selected.map((c) => {
              const isPrimary = c.id === primary
              return (
                <li
                  key={c.id}
                  className={clx(
                    "txt-compact-xsmall-plus inline-flex items-center gap-0.5 rounded-full border py-0.5 pl-1 pr-1",
                    isPrimary ? "border-ui-border-interactive bg-ui-bg-highlight text-ui-fg-base" : "border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle"
                  )}
                >
                  <button
                    type="button"
                    aria-label={isPrimary ? `${c.name} is the main category` : `Make ${c.name} the main category`}
                    aria-pressed={isPrimary}
                    title={isPrimary ? "Main category" : "Make main category"}
                    className={clx("rounded-full p-0.5", isPrimary ? "text-ui-tag-orange-icon" : "text-ui-fg-muted hover:text-ui-fg-base")}
                    onClick={() => set("primary_category_id", c.id)}
                  >
                    {isPrimary ? <StarSolid /> : <Star />}
                  </button>
                  <span className="pr-0.5">{c.name}</span>
                  <button type="button" aria-label={`Remove ${c.name}`} className="text-ui-fg-muted hover:text-ui-fg-base rounded-full" onClick={() => toggle(c.id, false)}>
                    <XMarkMini />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
        <Popover open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="bg-ui-bg-field shadow-borders-base txt-compact-small text-ui-fg-muted hover:bg-ui-bg-field-hover flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left"
            >
              <MagnifyingGlass />
              {selected.length ? "Add another category" : "Choose categories"}
            </button>
          </Popover.Trigger>
          <Popover.Content className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0" align="start">
            <div className="border-ui-border-base border-b p-2">
              <Input
                size="small"
                autoFocus
                placeholder="Search or create"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && q.trim() && !exact) {
                    e.preventDefault()
                    void create()
                  }
                }}
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filtered.map((c) => (
                <label key={c.id} className="hover:bg-ui-bg-base-hover flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5">
                  <Checkbox checked={form.category_ids.includes(c.id)} onCheckedChange={(on) => toggle(c.id, on === true)} />
                  <Text size="small" className={clx("truncate", c.parent_category_id && "pl-3")}>
                    {c.name}
                  </Text>
                </label>
              ))}
              {q.trim() && !exact ? (
                <button
                  type="button"
                  disabled={creating}
                  onClick={create}
                  className="txt-compact-small-plus text-ui-fg-interactive hover:bg-ui-bg-base-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                >
                  <Plus /> Create “{q.trim()}”
                </button>
              ) : null}
              {!filtered.length && !q.trim() ? (
                <Text size="small" className="text-ui-fg-subtle px-2 py-1.5">
                  No categories yet.
                </Text>
              ) : null}
            </div>
          </Popover.Content>
        </Popover>
      </Labeled>

      <Labeled label="Collections" hint="Add the book to the shelves and menus with these names.">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = form.tags.includes(t.value)
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                onClick={() => set("tags", on ? form.tags.filter((x) => x !== t.value) : [...form.tags, t.value])}
                className={clx(
                  "txt-compact-xsmall-plus rounded-full border px-2.5 py-1 transition-colors",
                  on ? "border-ui-border-interactive bg-ui-bg-highlight text-ui-fg-base" : "border-ui-border-base text-ui-fg-subtle hover:text-ui-fg-base"
                )}
              >
                {on ? "✓ " : ""}
                {t.label}
              </button>
            )
          })}
        </div>
      </Labeled>

      <Labeled label="Sold as" action={<LinkButton onClick={onManageUnits}>Manage units</LinkButton>}>
        <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {unitOptions.map((u) => (
              <Select.Item key={u} value={u}>
                {u.charAt(0).toUpperCase() + u.slice(1)}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </Labeled>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Bundle picker                                                       */
/* ------------------------------------------------------------------ */

function BundlePicker({
  items,
  onChange,
  products,
  error,
}: {
  items: BundleItem[]
  onChange: (items: BundleItem[]) => void
  products: { id: string; title: string; thumbnail: string | null }[]
  error?: string
}) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  const results = products
    .filter((p) => !items.some((i) => i.product_id === p.id))
    .filter((p) => (q ? p.title.toLowerCase().includes(q.toLowerCase()) : true))
    .slice(0, 8)

  return (
    <Labeled label="Books in this bundle" error={error}>
      <div ref={box} className="relative">
        <MagnifyingGlass className="text-ui-fg-muted pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2" />
        <Input
          size="small"
          className="pl-8"
          aria-invalid={Boolean(error) || undefined}
          placeholder="Search books to add"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
        />
        {open && results.length ? (
          <div className="bg-ui-bg-base shadow-elevation-flyout absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg p-1">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="hover:bg-ui-bg-base-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                onClick={() => {
                  onChange([...items, { product_id: p.id, title: p.title, quantity: 1 }])
                  setQ("")
                  setOpen(false)
                }}
              >
                <span className="bg-ui-bg-subtle flex h-8 w-6 shrink-0 items-center justify-center overflow-hidden rounded">
                  {p.thumbnail ? <img src={p.thumbnail} alt="" className="h-full w-full object-contain" /> : null}
                </span>
                <Text size="small" className="truncate">
                  {p.title}
                </Text>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {items.length ? (
        <ul className="border-ui-border-base divide-ui-border-base mt-1 divide-y rounded-lg border">
          {items.map((item, i) => (
            <li key={item.product_id} className="flex items-center gap-2 px-2.5 py-1.5">
              <Text size="small" className="min-w-0 flex-1 truncate">
                {item.title}
              </Text>
              <span className="text-ui-fg-muted txt-compact-xsmall">×</span>
              <Input
                size="small"
                inputMode="numeric"
                aria-label={`Quantity of ${item.title}`}
                className="mr-tabular w-12 text-right"
                value={String(item.quantity)}
                onChange={(e) =>
                  onChange(items.map((x, j) => (j === i ? { ...x, quantity: Math.min(100, Math.max(1, Number(digits(e.target.value)) || 1)) } : x)))
                }
              />
              <IconButton size="small" variant="transparent" aria-label={`Remove ${item.title}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                <XMarkMini />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
    </Labeled>
  )
}

export default ProductEditorPage
