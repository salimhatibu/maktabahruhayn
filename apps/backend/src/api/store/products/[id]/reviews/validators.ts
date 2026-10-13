import { z } from "@medusajs/framework/zod"

export const StoreCreateReview = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().nullable(),
  content: z.string().trim().min(10).max(5000),
})

export type StoreCreateReviewType = z.infer<typeof StoreCreateReview>
