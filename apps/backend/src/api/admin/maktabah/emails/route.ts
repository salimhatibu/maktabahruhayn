import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { INotificationModuleService } from "@medusajs/framework/types"

/** GET /admin/maktabah/emails: the outgoing email log. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const notifications: INotificationModuleService = req.scope.resolve(Modules.NOTIFICATION)
  const [rows, count] = await notifications.listAndCountNotifications(
    { channel: "email" },
    { order: { created_at: "DESC" }, take: 100 }
  )
  res.json({
    smtp_configured: Boolean(process.env.SMTP_HOST),
    count,
    emails: rows.map((n) => ({
      id: n.id,
      to: n.to,
      template: n.template,
      subject: (n.data as { subject?: string } | null)?.subject || null,
      status: n.status,
      created_at: n.created_at,
    })),
  })
}
