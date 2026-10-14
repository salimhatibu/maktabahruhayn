/**
 * Finds files in storage that no product uses any more: covers and sample PDFs
 * left behind by books deleted before the catalog editor cleaned up after
 * itself. Reports by default; pass --delete to remove them.
 *
 *   pnpm --filter @maktabah/backend cleanup:orphan-images
 *   pnpm --filter @maktabah/backend cleanup:orphan-images -- --delete
 *
 * Files named anywhere in store settings (hero slides, email templates) are
 * kept, as are files whose names do not look like an upload (CSV exports).
 */
import fs from "node:fs"
import path from "node:path"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  fileKeyFromUrl,
  PRODUCT_FILE_FIELDS,
  productFileUrls,
} from "../lib/product-files"
import { DEFAULT_SETTINGS, type SettingsKey } from "../lib/settings-defaults"
import { STORE_SETTINGS_MODULE } from "../modules/store-settings"
import type StoreSettingsModuleService from "../modules/store-settings/service"

/** Only media is swept; exports and other uploads are left where they are. */
const MEDIA = /\.(avif|gif|jpe?g|pdf|png|svg|webp)$/i

/** Where the local file provider keeps uploads (see medusa-config.ts). */
const LOCAL_UPLOAD_DIR = "static"

function usesR2() {
  return Boolean(process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID)
}

export default async function cleanupOrphanImages({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const apply = args.includes("--delete")

  const keep = new Set<string>()
  const addKey = (url: string) => {
    const key = fileKeyFromUrl(url)
    if (key) {
      keep.add(key)
    }
  }

  const { data: live } = await query.graph({
    entity: "product",
    fields: ["id", ...PRODUCT_FILE_FIELDS],
    pagination: { take: 10000 },
  })
  for (const product of live) {
    productFileUrls(product).forEach(addKey)
  }

  // Hero slides, email templates and anything else that names a file by URL.
  const settings: StoreSettingsModuleService = container.resolve(STORE_SETTINGS_MODULE)
  const sections = await settings.getSections(Object.keys(DEFAULT_SETTINGS) as SettingsKey[])
  const settingsText = JSON.stringify(sections)
  const isKept = (key: string) => keep.has(key) || settingsText.includes(key)

  const orphans = new Set<string>()

  // Files whose product is gone: the only way to find them when storage cannot
  // be listed (R2), and a cross-check of the sweep below when it can (local).
  const { data: deleted } = await query.graph({
    entity: "product",
    fields: ["id", ...PRODUCT_FILE_FIELDS],
    pagination: { take: 10000 },
    withDeleted: true,
  })
  for (const product of deleted) {
    for (const url of productFileUrls(product)) {
      const key = fileKeyFromUrl(url)
      if (key && !isKept(key)) {
        orphans.add(key)
      }
    }
  }

  if (!usesR2()) {
    const dir = path.resolve(process.cwd(), LOCAL_UPLOAD_DIR)
    const names = fs.existsSync(dir) ? fs.readdirSync(dir) : []
    for (const name of names) {
      if (!MEDIA.test(name) || isKept(name)) {
        continue
      }
      if (fs.statSync(path.join(dir, name)).isFile()) {
        orphans.add(name)
      }
    }
    logger.info(`Scanned ${names.length} file(s) in ${LOCAL_UPLOAD_DIR}/`)
  } else {
    logger.info("R2 is configured; only files still named by a deleted product can be found")
  }

  logger.info(`${keep.size} file(s) in use by ${live.length} product(s)`)

  if (!orphans.size) {
    logger.info("No orphaned media found")
    return
  }

  const keys = [...orphans].sort()
  logger.info(`${keys.length} orphaned file(s):`)
  for (const key of keys.slice(0, 50)) {
    logger.info(`  ${key}`)
  }
  if (keys.length > 50) {
    logger.info(`  ... and ${keys.length - 50} more`)
  }

  if (!apply) {
    logger.info("Nothing was deleted. Re-run with --delete to remove them.")
    return
  }

  const files = container.resolve(Modules.FILE)
  let removed = 0
  for (let i = 0; i < keys.length; i += 50) {
    const chunk = keys.slice(i, i + 50)
    try {
      await files.deleteFiles(chunk)
      removed += chunk.length
    } catch (e) {
      logger.warn(`Could not delete ${chunk.length} file(s): ${(e as Error).message}`)
    }
  }
  logger.info(`Deleted ${removed} orphaned file(s)`)
}
