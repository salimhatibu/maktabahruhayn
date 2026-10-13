import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { NEWSLETTER_MODULE } from "../../../modules/newsletter"
import type NewsletterModuleService from "../../../modules/newsletter/service"

/** GET /admin/newsletter?limit=100&offset=0 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const newsletter: NewsletterModuleService = req.scope.resolve(NEWSLETTER_MODULE)
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const [subscribers, count] = await newsletter.listAndCountSubscribers(
    {},
    { order: { created_at: "DESC" }, skip: offset, take: limit }
  )
  res.json({ subscribers, count, limit, offset })
}
