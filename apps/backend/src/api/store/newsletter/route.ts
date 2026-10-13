import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendStoreEmailWorkflow } from "../../../workflows/send-store-email"
import { subscribeNewsletterWorkflow } from "../../../workflows/subscribe-newsletter"

type Body = { email: string; name?: string; phone?: string; source?: string; country_code?: string }

/** POST /store/newsletter { email, name?, phone?, source?, country_code? } */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { result } = await subscribeNewsletterWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  if (result.created) {
    await sendStoreEmailWorkflow(req.scope)
      .run({ input: { template: "newsletter_welcome", to: req.validatedBody.email, vars: {} } })
      .catch(() => undefined)
  }
  res.status(result.created ? 201 : 200).json({ subscribed: true })
}
