import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { STORE_SETTINGS_MODULE } from "../modules/store-settings"
import type StoreSettingsModuleService from "../modules/store-settings/service"
import { setRuntimeSetting } from "./runtime-settings"
import { withDefaults } from "./settings-defaults"

/** Fields `productFileUrls` reads; pass them to `query.graph` on a product. */
export const PRODUCT_FILE_FIELDS = ["thumbnail", "images.url", "book.sample_pdf_url"]

type ProductFiles = {
  id?: string
  thumbnail?: string | null
  images?: ({ url?: string | null } | null)[] | null
  book?: { sample_pdf_url?: string | null } | null
}

/** Every file a product owns: its images, its thumbnail and its sample PDF. */
export function productFileUrls(product: ProductFiles | null | undefined): string[] {
  if (!product) {
    return []
  }
  const urls = [
    ...(product.images || []).map((image) => image?.url),
    product.thumbnail,
    product.book?.sample_pdf_url,
  ]
  return [...new Set(urls.filter((url): url is string => typeof url === "string" && url.length > 0))]
}

function decodeKey(key: string) {
  try {
    return decodeURIComponent(key)
  } catch {
    return key
  }
}

/**
 * The file module addresses a file by its storage key, which both providers put
 * at the end of the URL: the local provider serves `<backend_url>/static/<key>`
 * and R2 serves `<R2_PUBLIC_URL>/<key>`. A URL matching neither was never
 * uploaded here (an external cover pasted into the editor), so it has no key
 * and is left alone.
 */
export function fileKeyFromUrl(url: string): string | null {
  const clean = url.split("?")[0].split("#")[0]
  const r2 = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "")
  if (r2 && clean.startsWith(`${r2}/`)) {
    const key = clean.slice(r2.length + 1)
    return key ? decodeKey(key) : null
  }
  const local = /\/static\/(.+)$/.exec(clean)
  return local ? decodeKey(local[1]) : null
}

/** Every file URL still used by a live product other than `exceptProductId`. */
export async function urlsInUseByProducts(container: MedusaContainer, exceptProductId?: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", ...PRODUCT_FILE_FIELDS],
    pagination: { take: 10000 },
  })
  const inUse = new Set<string>()
  for (const product of data as ProductFiles[]) {
    if (product.id && product.id === exceptProductId) {
      continue
    }
    for (const url of productFileUrls(product)) {
      inUse.add(url)
    }
  }
  return inUse
}

/** Drops URLs that no longer exist from the hero slides that showed them. */
async function dropFromHeroSlides(container: MedusaContainer, removed: Set<string>) {
  const settings: StoreSettingsModuleService = container.resolve(STORE_SETTINGS_MODULE)
  const content = await settings.getSection("content")
  const slides = content.heroSlides || []
  const next = slides.map((slide) => ({
    ...slide,
    images: (slide.images || []).filter((url) => !removed.has(url)),
  }))
  const changed = next.some((slide, i) => slide.images.length !== (slides[i].images || []).length)
  if (!changed) {
    return
  }
  const value = withDefaults("content", { ...content, heroSlides: next }) as unknown as Record<string, unknown>
  const [row] = await settings.listSettings({ key: "content" })
  if (row) {
    await settings.updateSettings({ id: row.id, value })
  } else {
    await settings.createSettings({ key: "content", value })
  }
  setRuntimeSetting("content", value as never)
}

/**
 * Removes a deleted product's files from storage. Files another product still
 * uses are kept; the rest go, and are dropped from any hero slide that pointed
 * at them so the storefront never renders a missing image. Storage deletion
 * cannot be undone, so only call this once the product itself is gone.
 *
 * Returns the URLs whose files were deleted.
 */
export async function cleanupProductFiles(
  container: MedusaContainer,
  urls: string[],
  productId?: string
): Promise<string[]> {
  const keys = new Map<string, string>()
  for (const url of new Set(urls)) {
    const key = fileKeyFromUrl(url)
    if (key) {
      keys.set(url, key)
    }
  }
  if (!keys.size) {
    return []
  }

  const inUse = await urlsInUseByProducts(container, productId)
  const orphans = [...keys.keys()].filter((url) => !inUse.has(url))
  if (!orphans.length) {
    return []
  }

  await dropFromHeroSlides(container, new Set(orphans))

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const files = container.resolve(Modules.FILE)
  try {
    await files.deleteFiles(orphans.map((url) => keys.get(url) as string))
  } catch (e) {
    logger.warn(`Could not delete ${orphans.length} file(s) of a deleted product: ${(e as Error).message}`)
    return []
  }
  return orphans
}
