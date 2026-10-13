import {
  allowFields,
  authenticate,
  configureStoreSearch,
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { AffiliateBody } from "./admin/maktabah/affiliates/types"
import { CatalogProductBody, QuickCategoryBody } from "./admin/maktabah/catalog/validators"
import { StoreCreateReview } from "./store/products/[id]/reviews/validators"
import { z } from "@medusajs/framework/zod"

const bookAdditionalDataValidator = {
  title_arabic: z.string().nullish(),
  author: z.string().nullish(),
  translator: z.string().nullish(),
  commentator_tahqeeq: z.string().nullish(),
  publisher: z.string().nullish(),
  binding_type: z
    .enum(["hardcover", "softcover", "faux_leather", "multi_volume_box_set"])
    .nullish(),
  script_type: z.enum(["madani", "indo_pak", "other"]).nullish(),
  language: z
    .enum(["english", "arabic", "swahili", "urdu", "french"])
    .nullish(),
  volume_count: z.number().int().positive().nullish(),
  isbn_10: z.string().nullish(),
  isbn_13: z.string().nullish(),
  sample_pdf_url: z.string().nullish(),
}

const NewsletterBody = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(1).max(120).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, "Enter the phone number in international format, e.g. +254712345678")
    .optional(),
  source: z.string().max(40).optional(),
  country_code: z.string().length(2).optional(),
})

const AdminSettingsBody = z.object({
  value: z.record(z.string(), z.unknown()),
})

const StockBody = z.object({
  inventory_item_id: z.string(),
  location_id: z.string(),
  stocked_quantity: z.number().int().min(0).max(1000000),
})

const PaymentRequestBody = z.object({
  phone: z.string().min(9).max(15),
  amount: z.number().positive().max(250000),
  reference: z.string().trim().min(1).max(12),
  description: z.string().max(100).optional(),
  order_id: z.string().optional(),
})

const EmailTestBody = z.object({
  template: z.enum([
    "order_placed",
    "order_shipped",
    "order_delivered",
    "customer_welcome",
    "abandoned_cart",
    "newsletter_welcome",
  ]),
  to: z.string().email(),
  subject: z.string().max(200).optional(),
  body: z.string().max(10000).optional(),
})

const AdminReviewStatus = z.object({
  status: z.enum(["published", "hidden"]),
})

export default defineMiddlewares({
  routes: [
    {
      method: ["POST"],
      matcher: "/store/products/:id/reviews",
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        validateAndTransformBody(StoreCreateReview),
      ],
    },
    {
      method: ["POST"],
      matcher: "/store/newsletter",
      middlewares: [validateAndTransformBody(NewsletterBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/maktabah/catalog",
      middlewares: [validateAndTransformBody(CatalogProductBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/maktabah/categories",
      middlewares: [validateAndTransformBody(QuickCategoryBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/maktabah/catalog/:id",
      middlewares: [validateAndTransformBody(CatalogProductBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/maktabah/stock",
      middlewares: [validateAndTransformBody(StockBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/maktabah/payment-requests",
      middlewares: [validateAndTransformBody(PaymentRequestBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/maktabah/affiliates",
      middlewares: [validateAndTransformBody(AffiliateBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/maktabah/affiliates/:id",
      middlewares: [validateAndTransformBody(AffiliateBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/maktabah/emails/test",
      middlewares: [validateAndTransformBody(EmailTestBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/maktabah/settings/:key",
      middlewares: [validateAndTransformBody(AdminSettingsBody)],
    },
    {
      method: ["POST"],
      matcher: "/admin/reviews/:id",
      middlewares: [validateAndTransformBody(AdminReviewStatus)],
    },
    {
      method: ["POST"],
      matcher: "/store/search",
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
      ],
    },
    {
      method: "POST",
      matcher: "/admin/products",
      additionalDataValidator: bookAdditionalDataValidator,
    },
    {
      method: "POST",
      matcher: "/admin/products/:id",
      additionalDataValidator: bookAdditionalDataValidator,
    },
    {
      matcher: "/store/products",
      middlewares: [allowFields("book")],
    },
    {
      matcher: "/store/products/:id",
      middlewares: [allowFields("book")],
    },
  ],
})
