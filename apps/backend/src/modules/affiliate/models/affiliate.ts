import { model } from "@medusajs/framework/utils"

/** A partner who earns commission on orders placed through their ?ref= link. */
export const Affiliate = model
  .define("affiliate", {
    id: model.id({ prefix: "aff" }).primaryKey(),
    code: model.text(),
    name: model.text(),
    email: model.text().nullable(),
    phone: model.text().nullable(),
    commission_percent: model.number().default(10),
    active: model.boolean().default(true),
    notes: model.text().nullable(),
  })
  .indexes([{ on: ["code"], unique: true }])
