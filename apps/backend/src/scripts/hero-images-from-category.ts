/**
 * Fills each home page hero slide with covers from one department (default:
 * Marriage & Family). The admin can add or remove images afterwards.
 *
 *   pnpm --filter @maktabah/backend hero:images              # marriage-family
 *   pnpm --filter @maktabah/backend hero:images -- women     # another department
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { HeroSlide } from "../lib/settings-defaults"
import { STORE_SETTINGS_MODULE } from "../modules/store-settings"
import type StoreSettingsModuleService from "../modules/store-settings/service"
import { updateStoreSettingsWorkflow } from "../workflows/update-store-settings"

const PER_SLIDE = 5

export default async function heroImagesFromCategory({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const settings: StoreSettingsModuleService = container.resolve(STORE_SETTINGS_MODULE)
  const handle = args?.[0] || "marriage-family"

  const { data: categories } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "products.thumbnail", "products.status"],
    filters: { handle },
  })
  const category = categories[0] as
    | { name: string; products?: { thumbnail: string | null; status: string }[] }
    | undefined
  if (!category) {
    logger.error(`No department with handle "${handle}".`)
    return
  }
  const covers = [
    ...new Set(
      (category.products || [])
        .filter((p) => p.status === "published" && p.thumbnail)
        .map((p) => p.thumbnail as string)
    ),
  ]
  if (!covers.length) {
    logger.error(`${category.name} has no published books with images.`)
    return
  }

  const content = await settings.getSection("content")
  const raw = content as unknown as Record<string, unknown>
  delete raw.greetingArabic
  delete raw.greetingEnglish
  const slides: HeroSlide[] = content.heroSlides.map((slide, i) => ({
    ...slide,
    images: Array.from({ length: Math.min(PER_SLIDE, covers.length) }, (_, j) => covers[(i * PER_SLIDE + j) % covers.length]),
  }))

  await updateStoreSettingsWorkflow(container).run({
    input: { key: "content", value: { ...raw, heroSlides: slides } },
  })
  logger.info(`Set ${slides.length} hero slide(s) from ${covers.length} ${category.name} cover(s).`)
}
