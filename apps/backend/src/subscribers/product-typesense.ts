import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { TYPESENSE_MODULE } from "../modules/typesense"
import type TypesenseModuleService from "../modules/typesense/service"
import {
  PRODUCT_TYPESENSE_FIELDS,
  toTypesenseDocument,
  type ProductWithBook,
} from "../modules/typesense/utils/map-product"

type ProductEventData = {
  id: string
}

export default async function productTypesenseHandler({
  event: { name, data },
  container,
}: SubscriberArgs<ProductEventData>) {
  const typesense: TypesenseModuleService = container.resolve(TYPESENSE_MODULE)
  const productId = data.id

  if (name === "product.deleted") {
    await typesense.deleteDocument(productId)
    return
  }

  const query = container.resolve("query")

  const { data: products } = await query.graph({
    entity: "product",
    fields: [...PRODUCT_TYPESENSE_FIELDS],
    filters: {
      id: productId,
    },
  })

  const product = products[0] as ProductWithBook | undefined

  if (!product) {
    await typesense.deleteDocument(productId)
    return
  }

  await typesense.upsertBookDocument(toTypesenseDocument(product))
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
}
