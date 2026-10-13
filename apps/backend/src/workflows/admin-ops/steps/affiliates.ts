import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { AFFILIATE_MODULE } from "../../../modules/affiliate"
import type AffiliateModuleService from "../../../modules/affiliate/service"

export type AffiliateInput = {
  id?: string
  code?: string
  name?: string
  email?: string | null
  phone?: string | null
  commission_percent?: number
  active?: boolean
  notes?: string | null
  delete?: boolean
}

type Affiliate = Awaited<ReturnType<AffiliateModuleService["retrieveAffiliate"]>>

/** Creates, updates or deletes an affiliate. */
export const upsertAffiliateStep = createStep(
  "upsert-affiliate",
  async (input: AffiliateInput, { container }) => {
    const affiliates: AffiliateModuleService = container.resolve(AFFILIATE_MODULE)
    if (input.id) {
      const previous = await affiliates.retrieveAffiliate(input.id)
      if (input.delete) {
        await affiliates.softDeleteAffiliates(input.id)
        return new StepResponse<Affiliate | null, { previous: Affiliate; deleted: boolean } | null>(null, { previous, deleted: true })
      }
      const { id, delete: _d, ...rest } = input
      const updated = await affiliates.updateAffiliates({
        id,
        ...rest,
        ...(rest.code ? { code: rest.code.toUpperCase() } : {}),
      })
      return new StepResponse<Affiliate | null, { previous: Affiliate; deleted: boolean } | null>(updated, { previous, deleted: false })
    }

    const code = (input.code || "").trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,24}$/.test(code) || !input.name) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Give a name and a 3-24 character code (letters, numbers, - or _)")
    }
    const created = await affiliates.createAffiliates({
      code,
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      commission_percent: input.commission_percent ?? 10,
      notes: input.notes || null,
    })
    return new StepResponse<Affiliate | null, { previous: Affiliate; deleted: boolean } | null>(created, { previous: created, deleted: false })
  },
  async (undo, { container }) => {
    if (!undo) {
      return
    }
    const affiliates: AffiliateModuleService = container.resolve(AFFILIATE_MODULE)
    if (undo.deleted) {
      await affiliates.restoreAffiliates(undo.previous.id)
    } else {
      const { id, code, name, email, phone, commission_percent, active, notes } = undo.previous
      await affiliates.updateAffiliates({ id, code, name, email, phone, commission_percent, active, notes })
    }
  }
)
