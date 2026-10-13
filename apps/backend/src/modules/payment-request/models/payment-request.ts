import { model } from "@medusajs/framework/utils"

/**
 * An M-Pesa STK push started from the admin (phone and WhatsApp orders, or
 * collecting a balance on an existing order).
 */
export const PaymentRequest = model
  .define("payment_request", {
    id: model.id({ prefix: "preq" }).primaryKey(),
    phone: model.text(),
    amount: model.number(),
    currency_code: model.text().default("kes"),
    reference: model.text(),
    description: model.text().nullable(),
    order_id: model.text().nullable(),
    status: model.enum(["pending", "paid", "failed", "cancelled"]).default("pending"),
    checkout_request_id: model.text().nullable(),
    mpesa_receipt: model.text().nullable(),
    result_description: model.text().nullable(),
    created_by: model.text().nullable(),
  })
  .indexes([{ on: ["checkout_request_id"] }, { on: ["status"] }])
