import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { IPricingModuleService } from "@medusajs/framework/types"
import { BASE_CURRENCY, PRICED_CURRENCIES, roundPrice } from "../../../lib/currency-regions"
import { getFxRates } from "../../../lib/fx-rates"

export type SyncPricesInput = {
  /** Limit to these price sets; all price sets when omitted. */
  price_set_ids?: string[]
}

type PriceRow = {
  id: string
  amount: number
  currency_code: string
  price_set_id: string
  price_list_id: string | null
  rules_count?: number | null
  min_quantity?: number | null
  max_quantity?: number | null
}

const PAGE = 500

/**
 * Derives every region currency's price from the USD base price, for base
 * prices and for price-list (sale) prices. Existing derived prices are
 * replaced so they track the latest rates.
 */
export const syncPricesStep = createStep(
  "sync-prices",
  async (input: SyncPricesInput, { container }) => {
    const pricing: IPricingModuleService = container.resolve(Modules.PRICING)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    // Only product variant prices are derived; shipping option prices are
    // managed separately.
    // Variants can pin currencies (metadata.pinned_currencies, e.g. ["kes"]) so
    // a hand-set local price is never overwritten by conversion.
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["metadata", "price_set.id"],
    })
    const pinned = new Map<string, Set<string>>()
    for (const v of variants as { metadata?: Record<string, unknown> | null; price_set?: { id?: string } }[]) {
      const id = v.price_set?.id
      const list = v.metadata?.pinned_currencies
      if (id && Array.isArray(list)) {
        pinned.set(id, new Set(list.map((c) => String(c).toLowerCase())))
      }
    }
    const isPinned = (priceSetId: string, currency: string) => pinned.get(priceSetId)?.has(currency) ?? false

    let priceSetIds = input.price_set_ids
    if (!priceSetIds?.length) {
      priceSetIds = (variants as { price_set?: { id?: string } }[])
        .map((v) => v.price_set?.id)
        .filter((id): id is string => Boolean(id))
      if (!priceSetIds.length) {
        return new StepResponse({ currencies: 0, base_prices: 0, list_prices: 0 })
      }
    }
    const { rates } = await getFxRates()
    const targets = PRICED_CURRENCIES.filter(
      (c) => c !== BASE_CURRENCY && rates[c.toUpperCase()]
    )

    const rows: PriceRow[] = []
    let skip = 0
    while (true) {
      const page = (await pricing.listPrices(
        { price_set_id: priceSetIds },
        {
          select: [
            "id",
            "amount",
            "currency_code",
            "price_set_id",
            "price_list_id",
            "rules_count",
            "min_quantity",
            "max_quantity",
          ],
          skip,
          take: PAGE,
        }
      )) as unknown as PriceRow[]
      rows.push(...page)
      if (page.length < PAGE) {
        break
      }
      skip += PAGE
    }

    // Only plain prices (no rules or quantity tiers) are derived.
    const plain = rows.filter((r) => !r.rules_count && !r.min_quantity && !r.max_quantity)
    const key = (r: { price_set_id: string; price_list_id: string | null }) =>
      `${r.price_set_id}|${r.price_list_id || ""}`

    const bases = new Map<string, PriceRow>()
    for (const row of plain) {
      if (row.currency_code === BASE_CURRENCY) {
        bases.set(key(row), row)
      }
    }

    const staleIds = plain
      .filter((r) => targets.includes(r.currency_code) && bases.has(key(r)) && !isPinned(r.price_set_id, r.currency_code))
      .map((r) => r.id)

    const basePrices: { price_set_id: string; currency_code: string; amount: number }[] = []
    const listPrices = new Map<
      string,
      { price_set_id: string; currency_code: string; amount: number }[]
    >()

    const derived = (amount: number, currency: string) =>
      roundPrice(amount * rates[currency.toUpperCase()], currency)

    // Regular prices first, so sale prices can be kept strictly below them.
    const regular = new Map<string, number>()
    for (const base of bases.values()) {
      if (base.price_list_id) {
        continue
      }
      for (const currency of targets) {
        if (isPinned(base.price_set_id, currency)) {
          continue
        }
        const amount = derived(Number(base.amount), currency)
        regular.set(`${base.price_set_id}|${currency}`, amount)
        basePrices.push({ price_set_id: base.price_set_id, currency_code: currency, amount })
      }
    }

    for (const base of bases.values()) {
      if (!base.price_list_id) {
        continue
      }
      for (const currency of targets) {
        if (isPinned(base.price_set_id, currency)) {
          continue
        }
        let amount = derived(Number(base.amount), currency)
        const ceiling = regular.get(`${base.price_set_id}|${currency}`)
        if (ceiling !== undefined && amount >= ceiling) {
          // Charm rounding collapsed the discount; fall back to exact cents.
          const exact = Math.round(Number(base.amount) * rates[currency.toUpperCase()] * 100) / 100
          amount = exact < ceiling ? exact : Math.max(ceiling - 0.01, 0.01)
        }
        const list = listPrices.get(base.price_list_id) || []
        list.push({ price_set_id: base.price_set_id, currency_code: currency, amount })
        listPrices.set(base.price_list_id, list)
      }
    }

    if (staleIds.length) {
      await pricing.removePrices(staleIds)
    }

    const bySet = new Map<string, { currency_code: string; amount: number }[]>()
    for (const p of basePrices) {
      const list = bySet.get(p.price_set_id) || []
      list.push({ currency_code: p.currency_code, amount: p.amount })
      bySet.set(p.price_set_id, list)
    }
    if (bySet.size) {
      await pricing.addPrices(
        Array.from(bySet.entries()).map(([priceSetId, prices]) => ({ priceSetId, prices }))
      )
    }

    if (listPrices.size) {
      await pricing.addPriceListPrices(
        Array.from(listPrices.entries()).map(([price_list_id, prices]) => ({
          price_list_id,
          prices,
        }))
      )
    }

    return new StepResponse({
      currencies: targets.length,
      base_prices: basePrices.length,
      list_prices: Array.from(listPrices.values()).reduce((n, l) => n + l.length, 0),
    })
  }
)
