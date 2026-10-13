import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import nodemailer, { type Transporter } from "nodemailer"

type Options = {
  host?: string
  port?: number
  secure?: boolean
  user?: string
  pass?: string
  from?: string
}

/**
 * Email over SMTP (works with any provider: Gmail/Workspace, Zoho, Amazon
 * SES, Mailgun, Postmark SMTP). Without SMTP settings the message is logged
 * instead, and still appears in the admin email log via the Notification
 * module.
 */
class SmtpNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "smtp"

  protected logger_: Logger
  protected options_: Options
  protected transporter_: Transporter | null

  constructor({ logger }: { logger: Logger }, options: Options) {
    super()
    this.logger_ = logger
    this.options_ = options
    this.transporter_ = options.host
      ? nodemailer.createTransport({
          host: options.host,
          port: options.port || 587,
          secure: options.secure ?? options.port === 465,
          auth: options.user ? { user: options.user, pass: options.pass } : undefined,
        })
      : null
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    const subject = notification.content?.subject || notification.template
    const text = notification.content?.text || ""
    const html = notification.content?.html || undefined
    const from = notification.from || this.options_.from

    if (!this.transporter_) {
      this.logger_.info(`[email:not-sent, SMTP not configured] to=${notification.to} subject="${subject}"`)
      return { id: `logged-${Date.now()}` }
    }
    if (!from) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "SMTP_FROM is required to send email")
    }

    const replyTo = (notification.data as { reply_to?: string } | null)?.reply_to || undefined
    const info = await this.transporter_.sendMail({ from, to: notification.to, subject, text, html, replyTo })
    return { id: info.messageId }
  }
}

export default SmtpNotificationProviderService
