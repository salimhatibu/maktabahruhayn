import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import type { INotificationModuleService } from "@medusajs/framework/types"
import { renderTemplate, toEmailHtml } from "../../../lib/email-render"
import type { EmailSettings } from "../../../lib/settings-defaults"
import { STORE_SETTINGS_MODULE } from "../../../modules/store-settings"
import type StoreSettingsModuleService from "../../../modules/store-settings/service"

export type SendStoreEmailInput = {
  template: keyof EmailSettings["templates"]
  to: string
  vars: Record<string, unknown>
  /** Overrides the saved template (used for "send test"). */
  override?: { subject: string; body: string }
}

/**
 * Renders a store email template and hands it to the Notification module,
 * which records it (the admin email log) and delivers it via SMTP.
 */
type Result = { sent: boolean; reason?: string; notification_id?: string }

export const sendEmailStep = createStep<SendStoreEmailInput, Result, Result>(
  "send-email",
  async (input: SendStoreEmailInput, { container }) => {
    const settings: StoreSettingsModuleService = container.resolve(STORE_SETTINGS_MODULE)
    const { email, business, theme } = await settings.getSections(["email", "business", "theme"])
    const template = input.override
      ? { ...input.override, enabled: true }
      : email!.templates[input.template]
    if (!template?.enabled || !input.to) {
      return new StepResponse<Result, Result>({ sent: false, reason: "disabled" })
    }

    const storeUrl = (process.env.STOREFRONT_URL || "http://localhost:3000").replace(/\/$/, "")
    const vars = { ...input.vars, store: { name: business!.name, url: storeUrl, email: business!.email } }
    const subject = renderTemplate(template.subject, vars)
    const text = renderTemplate(template.body, vars)

    const notifications: INotificationModuleService = container.resolve(Modules.NOTIFICATION)
    const [notification] = await notifications.createNotifications([
      {
        to: input.to,
        channel: "email",
        template: input.template,
        from: email!.fromName && process.env.SMTP_FROM?.includes("<")
          ? process.env.SMTP_FROM.replace(/^[^<]*/, `${email!.fromName} `)
          : undefined,
        content: {
          subject,
          text,
          html: toEmailHtml(text, { storeName: business!.name, brand: theme!.brand, storeUrl }),
        },
        data: { reply_to: email!.replyTo || business!.email || undefined, subject },
      },
    ])
    return new StepResponse<Result, Result>({ sent: true, notification_id: notification?.id })
  }
)
