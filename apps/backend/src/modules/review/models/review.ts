import { model } from "@medusajs/framework/utils"

export const Review = model
  .define("review", {
    id: model.id({ prefix: "rev" }).primaryKey(),
    product_id: model.text(),
    customer_id: model.text().nullable(),
    display_name: model.text(),
    rating: model.number(),
    title: model.text().nullable(),
    content: model.text(),
    status: model.enum(["published", "hidden"]).default("published"),
    verified_purchase: model.boolean().default(false),
  })
  .indexes([
    { on: ["product_id", "status"] },
    // One review per customer per product.
    { on: ["product_id", "customer_id"], unique: true, where: "customer_id IS NOT NULL" },
  ])
