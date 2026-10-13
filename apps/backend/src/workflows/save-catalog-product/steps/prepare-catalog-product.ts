import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { roundPrice } from "../../../lib/currency-regions"
import { getFxRates } from "../../../lib/fx-rates"
import {
  SHIPPING_SIZES,
  slugify,
  systemSku,
  type CatalogProductInput,
} from "../../../lib/catalog-editor"

export type PreparedVariantPlan = {
  /** Variant id after save; resolved by option value for new variants. */
  id?: string
  option_value: string
  stock: { location_id: string; quantity: number }[]
  sale_kes: number | null
  sale_usd: number | null
}

export type PreparedCatalogProduct = {
  is_new: boolean
  product_id: string | null
  create: Record<string, unknown>[]
  update: Record<string, unknown>[]
  book: Record<string, unknown>
  track_inventory: boolean
  plans: PreparedVariantPlan[]
  option: { product_id: string | null; option_id: string | null; title: string; values: string[] }
}

const TAGS = "p|br|h2|h3|strong|b|em|i|u|ul|ol|li|blockquote|a|code|pre|table|thead|tbody|tr|th|td"
const ALLOWED_TAGS = new RegExp(`<\\/?(${TAGS})(\\s[^>]*)?>`, "gi")
const OTHER_TAGS = new RegExp(`<(?!\\/?(${TAGS})\\b)[^>]*>`, "gi")

/** Keeps a small set of formatting tags; links may only point to http(s)/mailto. */
function sanitizeHtml(html: string) {
  const stripped = html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(OTHER_TAGS, "")
  return stripped.replace(ALLOWED_TAGS, (tag) => {
    const name = tag.match(/^<\/?([a-z0-9]+)/i)?.[1]?.toLowerCase() || ""
    if (tag.startsWith("</")) {
      return `</${name}>`
    }
    if (name === "a") {
      const href = tag.match(/href\s*=\s*"([^"]*)"/i)?.[1] || ""
      return /^(https?:|mailto:|\/)/i.test(href) ? `<a href="${href.replace(/"/g, "&quot;")}" rel="noopener">` : "<a>"
    }
    return `<${name}>`
  })
}

/**
 * Validates the editor form and turns it into create/update payloads for the
 * core product workflows. Prices are entered in KES: the KES price is pinned
 * and the USD base is derived from it, so other currencies follow by FX.
 */
export const prepareCatalogProductStep = createStep(
  "prepare-catalog-product",
  async (input: CatalogProductInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const fulfillment = container.resolve(Modules.FULFILLMENT)

    const title = input.title?.trim()
    if (!title) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Product title is required")
    }
    if (!input.variants?.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Add at least one variant")
    }
    if (input.images.length > 10) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "A product can have up to 10 images")
    }
    const values = input.variants.map((v) => v.option_value.trim())
    if (values.some((v) => !v) || new Set(values).size !== values.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Each variant needs a different option value")
    }
    for (const v of input.variants) {
      if (!(v.selling_price > 0)) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, `Enter a selling price for "${v.option_value}"`)
      }
    }

    let existing: Record<string, any> | null = null
    if (input.id) {
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "handle", "metadata", "options.id", "options.title", "variants.id", "variants.metadata"],
        filters: { id: input.id },
      })
      existing = (data[0] as Record<string, any>) || null
      if (!existing) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
      }
    }

    // Handle: keep the existing one unless explicitly changed; make new ones unique.
    let handle = (input.handle && slugify(input.handle)) || existing?.handle || slugify(title)
    if (!existing || handle !== existing.handle) {
      const { data: taken } = await query.graph({ entity: "product", fields: ["id", "handle"], filters: { handle } })
      if (taken.some((p) => p.id !== input.id)) {
        handle = `${handle}-${Date.now().toString(36).slice(-4)}`
      }
    }

    let productNumber = existing?.metadata?.product_number as number | undefined
    if (!productNumber) {
      const { data: all } = await query.graph({ entity: "product", fields: ["metadata"] })
      productNumber = Math.max(100, ...all.map((p) => Number((p.metadata as Record<string, unknown> | null)?.product_number) || 0)) + 1
    }

    const { rates } = await getFxRates()
    const usdOf = (kes: number) => roundPrice(kes / (rates.KES || 129), "usd")

    const dims =
      input.shipping_size === "custom"
        ? input.custom_dimensions || SHIPPING_SIZES.small
        : SHIPPING_SIZES[input.shipping_size]

    const optionTitle = input.option_title?.trim() || "Format"
    const existingOption = (existing?.options || []).find((o: { title: string }) => o.title === optionTitle) || existing?.options?.[0]

    const existingVariantMeta = new Map<string, Record<string, unknown>>(
      (existing?.variants || []).map((v: { id: string; metadata: Record<string, unknown> | null }) => [v.id, v.metadata || {}])
    )

    const plans: PreparedVariantPlan[] = []
    const variants = input.variants.map((v, i) => {
      const onSale = Boolean(v.original_price && v.original_price > v.selling_price)
      const baseKes = onSale ? Number(v.original_price) : Number(v.selling_price)
      const sys = (v.id && (existingVariantMeta.get(v.id)?.system_sku as string)) || systemSku(`${handle}:${v.option_value}:${i}:${Date.now()}`)
      plans.push({
        id: v.id,
        option_value: v.option_value.trim(),
        stock: v.stock || [],
        sale_kes: onSale ? Number(v.selling_price) : null,
        sale_usd: onSale ? usdOf(Number(v.selling_price)) : null,
      })
      return {
        ...(v.id ? { id: v.id } : {}),
        title: v.option_value.trim(),
        sku: v.custom_sku?.trim() || sys,
        manage_inventory: input.track_inventory,
        allow_backorder: Boolean(input.allow_backorder),
        options: { [optionTitle]: v.option_value.trim() },
        weight: dims.weight,
        length: dims.length,
        width: dims.width,
        height: dims.height,
        metadata: {
          ...(v.id ? existingVariantMeta.get(v.id) : {}),
          pinned_currencies: ["kes"],
          system_sku: sys,
          custom_sku: v.custom_sku?.trim() || null,
          cost: v.cost ?? null,
          low_stock_threshold: v.low_stock_threshold ?? null,
        },
        prices: [
          { currency_code: "kes", amount: baseKes },
          { currency_code: "usd", amount: usdOf(baseKes) },
        ],
      }
    })

    const metadata = {
      ...(existing?.metadata || {}),
      product_number: productNumber,
      primary_category_id: input.primary_category_id || input.category_ids[0] || null,
      unit: input.unit || "item",
      product_type: input.product_type,
      bundle_items: input.product_type === "bundle" ? input.bundle_items || [] : null,
      delivery_type: input.delivery_type,
      shipping_size: input.shipping_size,
      option_display: input.option_display || "buttons",
      publish_at: input.status === "draft" && input.publish_at ? input.publish_at : null,
      pages: input.pages ?? null,
      release_date: input.release_date || null,
      preorder: Boolean(input.preorder),
      series: input.series?.trim() || null,
      bookseller_note: input.bookseller_note?.trim() || null,
      author_bio: input.author_bio?.trim() || null,
      editorial_reviews: (input.editorial_reviews || []).filter((r) => r.quote.trim()),
    }

    // Merchandising tags: reuse existing tags by value, create the rest.
    let tagIds: string[] | undefined
    if (input.tags) {
      const wanted = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))]
      const { data: found } = await query.graph({ entity: "product_tag", fields: ["id", "value"], filters: { value: wanted } })
      const missing = wanted.filter((v) => !found.some((t) => t.value === v))
      const created = missing.length
        ? await container.resolve(Modules.PRODUCT).createProductTags(missing.map((value) => ({ value })))
        : []
      tagIds = [...found, ...created].map((t) => t.id)
    }

    // Primary category first, so storefront breadcrumbs and "You may also like" use it.
    const categoryIds = [
      ...new Set([input.primary_category_id, ...input.category_ids].filter((c): c is string => Boolean(c))),
    ]

    const common = {
      title,
      subtitle: input.subtitle?.trim() || null,
      handle,
      description: input.description_html ? sanitizeHtml(input.description_html) : null,
      status: input.status,
      thumbnail: input.thumbnail || input.images[0] || null,
      images: input.images.map((url) => ({ url })),
      category_ids: categoryIds,
      ...(tagIds ? { tag_ids: tagIds } : {}),
      metadata,
      options: [
        {
          ...(existingOption ? { id: existingOption.id } : {}),
          title: optionTitle,
          values: values,
        },
      ],
      variants,
    }

    const book = Object.fromEntries(
      Object.entries(input.book || {}).map(([k, v]) => [k, v === "" ? null : v])
    )

    if (existing) {
      return new StepResponse<PreparedCatalogProduct>({
        is_new: false,
        product_id: existing.id,
        create: [],
        // Option values are set by setOptionValuesStep around the update.
        update: [{ id: existing.id, ...common, options: existingOption ? undefined : common.options }],
        book,
        track_inventory: input.track_inventory,
        plans,
        option: { product_id: existing.id as string, option_id: existingOption?.id || null, title: optionTitle, values },
      })
    }

    const [profile] = await fulfillment.listShippingProfiles({ type: "default" })
    const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id", "name"] })
    const channel = channels.find((c) => c.name === "Default Sales Channel") || channels[0]
    return new StepResponse<PreparedCatalogProduct>({
      is_new: true,
      product_id: null,
      create: [
        {
          ...common,
          shipping_profile_id: profile?.id,
          sales_channels: channel ? [{ id: channel.id }] : [],
        },
      ],
      update: [],
      book,
      track_inventory: input.track_inventory,
      plans,
      option: { product_id: null, option_id: null, title: optionTitle, values },
    })
  }
)
