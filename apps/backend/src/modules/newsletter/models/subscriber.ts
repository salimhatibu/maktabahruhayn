import { model } from "@medusajs/framework/utils"

export const Subscriber = model
  .define("newsletter_subscriber", {
    id: model.id({ prefix: "nsub" }).primaryKey(),
    email: model.text(),
    name: model.text().nullable(),
    phone: model.text().nullable(),
    status: model.enum(["subscribed", "unsubscribed"]).default("subscribed"),
    source: model.text().nullable(),
    country_code: model.text().nullable(),
  })
  .indexes([{ on: ["email"], unique: true }])
