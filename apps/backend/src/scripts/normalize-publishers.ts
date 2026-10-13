/**
 * Merges publisher spellings that differ only by suffix or case (as imported
 * from source sites), so filters and the publishers row show one entry each.
 *
 *   pnpm --filter @maktabah/backend exec medusa exec ./src/scripts/normalize-publishers.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BOOK_MODULE } from "../modules/book"
import type BookModuleService from "../modules/book/service"

const CANONICAL: [RegExp, string][] = [
  [/^darussalam(\s+(publications?|international publications ltd))?$/i, "Darussalam"],
  [/^goodword(\s+books)?$/i, "Goodword Books"],
]

export default async function normalizePublishers({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const books: BookModuleService = container.resolve(BOOK_MODULE)
  const rows = await books.listBooks({}, { select: ["id", "publisher"] })
  const updates = rows.flatMap((b) => {
    const current = (b.publisher || "").trim()
    const match = CANONICAL.find(([re]) => re.test(current))
    return match && match[1] !== current ? [{ id: b.id, publisher: match[1] }] : []
  })
  if (updates.length) {
    await books.updateBooks(updates)
  }
  logger.info(`Normalized ${updates.length} publisher names`)
}
