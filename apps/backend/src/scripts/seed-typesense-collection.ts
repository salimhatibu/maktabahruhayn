import type { ExecArgs } from "@medusajs/framework/types"
import { TYPESENSE_MODULE } from "../modules/typesense"
import type TypesenseModuleService from "../modules/typesense/service"
import {
  PRODUCT_TYPESENSE_FIELDS,
  toTypesenseDocument,
  type ProductWithBook,
} from "../modules/typesense/utils/map-product"

const PAGE_SIZE = 50

/**
 * Indexes every product into Typesense. Pass "recreate" to drop and rebuild
 * the collection after a schema change (medusa exec only forwards positional
 * arguments, so it is a bare word):
 *
 *   pnpm --filter @maktabah/backend seed:typesense recreate
 */
export default async function seedTypesenseCollection({
  container,
  args,
}: ExecArgs) {
  const typesense: TypesenseModuleService = container.resolve(TYPESENSE_MODULE)
  const query = container.resolve("query")

  const collection = args?.includes("recreate")
    ? await typesense.recreateCollection()
    : await typesense.ensureCollection()
  console.log(
    collection.created
      ? `Created Typesense collection "${collection.name}"`
      : `Typesense collection "${collection.name}" already exists`
  )

  let skip = 0
  let indexed = 0

  while (true) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: [...PRODUCT_TYPESENSE_FIELDS],
      pagination: {
        skip,
        take: PAGE_SIZE,
      },
    })

    if (!products.length) {
      break
    }

    for (const product of products as ProductWithBook[]) {
      await typesense.upsertBookDocument(toTypesenseDocument(product))
      indexed += 1
    }

    if (products.length < PAGE_SIZE) {
      break
    }

    skip += PAGE_SIZE
  }

  console.log(`Indexed ${indexed} product(s) into Typesense "${collection.name}"`)
}
