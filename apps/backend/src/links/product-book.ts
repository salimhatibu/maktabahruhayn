import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import BookModule from "../modules/book"

/**
 * Each product has at most one Book record. Deleting the product deletes its
 * Book record too, so ISBNs (unique per live book) can be reused.
 */
export default defineLink(ProductModule.linkable.product, {
  linkable: BookModule.linkable.book,
  deleteCascade: true,
})
