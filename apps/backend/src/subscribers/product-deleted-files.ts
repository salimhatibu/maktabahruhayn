import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cleanupProductFiles, PRODUCT_FILE_FIELDS, productFileUrls } from "../lib/product-files"

/**
 * A product's images and sample PDF stay in file storage when the product is
 * deleted. The catalog editor's delete already cleans them up from the file
 * URLs it read beforehand; this covers deletions made anywhere else (Medusa's
 * own product page, the Admin API) by reading them back off the soft-deleted
 * rows. Files another product still uses are kept.
 */
export default async function productDeletedFiles({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", ...PRODUCT_FILE_FIELDS],
    filters: { id: data.id },
    withDeleted: true,
  })

  const urls = productFileUrls(products[0])
  if (!urls.length) {
    return
  }
  await cleanupProductFiles(container, urls, data.id)
}

export const config: SubscriberConfig = {
  event: "product.deleted",
}
