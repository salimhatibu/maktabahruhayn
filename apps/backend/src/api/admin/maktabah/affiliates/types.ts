import { z } from "@medusajs/framework/zod"

export { manageAffiliateWorkflow } from "../../../../workflows/admin-ops"

export const AffiliateBody = z.object({
  code: z.string().trim().min(3).max(24).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().nullish(),
  phone: z.string().max(30).nullish(),
  commission_percent: z.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
  notes: z.string().max(1000).nullish(),
})

export type AffiliateInputBody = z.infer<typeof AffiliateBody>
