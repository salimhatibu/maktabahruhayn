import { model } from "@medusajs/framework/utils"

/** One JSON document per settings section (business, theme, content, ...). */
export const Setting = model
  .define("store_setting", {
    id: model.id({ prefix: "sset" }).primaryKey(),
    key: model.text(),
    value: model.json(),
  })
  .indexes([{ on: ["key"], unique: true }])
