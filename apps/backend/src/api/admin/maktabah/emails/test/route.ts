import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { EmailSettings } from "../../../../../lib/settings-defaults"
import { sendStoreEmailWorkflow } from "../../../../../workflows/send-store-email"

type Body = { template: keyof EmailSettings["templates"]; to: string; subject?: string; body?: string }

const SAMPLE = {
  customer: { first_name: "Amina" },
  order: { display_id: 1001, total: "KES 2,980.00", items: "- The Sealed Nectar x 1: KES 2,980.00" },
  tracking: { number: "1Z999AA10123456784", url: "https://tracking.example.com/1Z999AA10123456784" },
  cart: { items: "- Fortress of the Muslim x 2: KES 1,040.00" },
}

/** POST /admin/maktabah/emails/test: render a template with sample data and send it. */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { template, to, subject, body } = req.validatedBody
  const { result } = await sendStoreEmailWorkflow(req.scope).run({
    input: { template, to, vars: SAMPLE, override: subject && body ? { subject, body } : undefined },
  })
  res.json(result)
}
