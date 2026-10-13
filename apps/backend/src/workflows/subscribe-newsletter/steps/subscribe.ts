import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { NEWSLETTER_MODULE } from "../../../modules/newsletter"
import type NewsletterModuleService from "../../../modules/newsletter/service"

export type SubscribeInput = { email: string; name?: string; phone?: string; source?: string; country_code?: string }

/** Subscribes an address, or re-subscribes it. Repeat sign-ups are no-ops. */
type Result = { id: string; created: boolean }
/** What to undo: delete a new row, restore a previous status, or nothing. */
type Undo = {
  id: string
  revert: "delete" | "unsubscribed" | "none"
  previous?: { name: string | null; phone: string | null }
}

export const subscribeStep = createStep<SubscribeInput, Result, Undo>(
  "subscribe",
  async (input: SubscribeInput, { container }) => {
    const newsletter: NewsletterModuleService = container.resolve(NEWSLETTER_MODULE)
    const email = input.email.trim().toLowerCase()
    const [existing] = await newsletter.listSubscribers({ email })

    if (existing) {
      // Fill in a name or phone number the subscriber did not give before.
      const details = {
        name: input.name?.trim() || existing.name || null,
        phone: input.phone?.trim() || existing.phone || null,
      }
      const previous = { name: existing.name ?? null, phone: existing.phone ?? null }
      if (existing.status === "subscribed") {
        if (details.name !== previous.name || details.phone !== previous.phone) {
          await newsletter.updateSubscribers({ id: existing.id, ...details })
        }
        return new StepResponse<Result, Undo>({ id: existing.id, created: false }, { id: existing.id, revert: "none", previous })
      }
      await newsletter.updateSubscribers({ id: existing.id, status: "subscribed", ...details })
      return new StepResponse<Result, Undo>({ id: existing.id, created: false }, { id: existing.id, revert: "unsubscribed", previous })
    }

    const created = await newsletter.createSubscribers({
      email,
      name: input.name?.trim() || null,
      phone: input.phone?.trim() || null,
      source: input.source || null,
      country_code: input.country_code || null,
    })
    return new StepResponse<Result, Undo>({ id: created.id, created: true }, { id: created.id, revert: "delete" })
  },
  async (undo, { container }) => {
    if (!undo) {
      return
    }
    const newsletter: NewsletterModuleService = container.resolve(NEWSLETTER_MODULE)
    if (undo.revert === "delete") {
      await newsletter.deleteSubscribers(undo.id)
      return
    }
    await newsletter.updateSubscribers({
      id: undo.id,
      ...(undo.previous || {}),
      ...(undo.revert === "unsubscribed" ? { status: "unsubscribed" as const } : {}),
    })
  }
)
