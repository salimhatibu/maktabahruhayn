import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules, PriceListStatus } from "@medusajs/framework/utils"
import type { IInventoryService, IPricingModuleService } from "@medusajs/framework/types"
import { SALE_LIST_TITLE } from "../../../lib/catalog-editor"
import type { PreparedVariantPlan } from "./prepare-catalog-product"

export type FinalizeInput = {
  product_id: string
  track_inventory: boolean
  plans: PreparedVariantPlan[]
}

type Undo = {
  levels: { inventory_item_id: string; location_id: string; stocked_quantity: number | null }[]
}

/**
 * After the product is saved: sets stock per location for each variant and
 * keeps the variant's sale price in the "Sale Items" price list.
 */
export const finalizeCatalogProductStep = createStep(
  "finalize-catalog-product",
  async (input: FinalizeInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const inventory: IInventoryService = container.resolve(Modules.INVENTORY)
    const pricing: IPricingModuleService = container.resolve(Modules.PRICING)

    const { data } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "title",
        "sku",
        "price_set.id",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
      ],
      filters: { product_id: input.product_id },
    })
    const variants = data as {
      id: string
      title: string
      sku: string | null
      price_set?: { id: string } | null
      inventory_items?: {
        inventory_item_id: string
        inventory?: { location_levels?: { location_id: string; stocked_quantity: number }[] } | null
      }[]
    }[]

    const undo: Undo = { levels: [] }

    // Stock levels
    if (input.track_inventory) {
      for (const plan of input.plans) {
        const variant = variants.find((v) => v.id === plan.id) || variants.find((v) => v.title === plan.option_value)
        if (!variant) {
          continue
        }
        let itemId = variant.inventory_items?.[0]?.inventory_item_id
        if (!itemId) {
          // Inventory tracking was switched on for an existing variant.
          const [item] = await inventory.createInventoryItems([{ sku: variant.sku || undefined, title: variant.title }])
          await link.create({
            [Modules.PRODUCT]: { variant_id: variant.id },
            [Modules.INVENTORY]: { inventory_item_id: item.id },
          })
          itemId = item.id
        }
        const current = variant.inventory_items?.[0]?.inventory?.location_levels || []
        for (const s of plan.stock) {
          const qty = Math.max(0, Math.round(Number(s.quantity) || 0))
          const level = current.find((l) => l.location_id === s.location_id)
          if (level) {
            if (Number(level.stocked_quantity) !== qty) {
              undo.levels.push({ inventory_item_id: itemId, location_id: s.location_id, stocked_quantity: Number(level.stocked_quantity) })
              await inventory.updateInventoryLevels([{ inventory_item_id: itemId, location_id: s.location_id, stocked_quantity: qty }])
            }
          } else {
            undo.levels.push({ inventory_item_id: itemId, location_id: s.location_id, stocked_quantity: null })
            await inventory.createInventoryLevels([{ inventory_item_id: itemId, location_id: s.location_id, stocked_quantity: qty }])
          }
        }
      }
    }

    // Sale prices
    const { data: lists } = await query.graph({ entity: "price_list", fields: ["id"], filters: { title: SALE_LIST_TITLE } })
    let saleList = lists[0] as { id: string } | undefined
    const needsSale = input.plans.some((p) => p.sale_kes)
    if (!saleList && needsSale) {
      ;[saleList] = await pricing.createPriceLists([
        { title: SALE_LIST_TITLE, description: "Reduced titles", status: PriceListStatus.ACTIVE },
      ])
    }
    const priceSetIds: string[] = []
    if (saleList) {
      for (const plan of input.plans) {
        const variant = variants.find((v) => v.id === plan.id) || variants.find((v) => v.title === plan.option_value)
        const priceSetId = variant?.price_set?.id
        if (!priceSetId) {
          continue
        }
        priceSetIds.push(priceSetId)
        const existing = await pricing.listPrices({ price_set_id: [priceSetId], price_list_id: [saleList.id] }, { select: ["id"] })
        if (existing.length) {
          await pricing.removePrices(existing.map((p) => p.id))
        }
        if (plan.sale_kes && plan.sale_usd) {
          await pricing.addPriceListPrices([
            {
              price_list_id: saleList.id,
              prices: [
                { price_set_id: priceSetId, currency_code: "kes", amount: plan.sale_kes },
                { price_set_id: priceSetId, currency_code: "usd", amount: plan.sale_usd },
              ],
            },
          ])
        }
      }
    } else {
      priceSetIds.push(...variants.map((v) => v.price_set?.id).filter((id): id is string => Boolean(id)))
    }

    return new StepResponse({ product_id: input.product_id, price_set_ids: priceSetIds }, undo)
  },
  async (undo, { container }) => {
    if (!undo?.levels.length) {
      return
    }
    const inventory: IInventoryService = container.resolve(Modules.INVENTORY)
    for (const l of undo.levels) {
      if (l.stocked_quantity === null) {
        const levels = await inventory.listInventoryLevels({ inventory_item_id: l.inventory_item_id, location_id: l.location_id })
        if (levels.length) {
          await inventory.deleteInventoryLevels(levels.map((x) => x.id))
        }
      } else {
        await inventory.updateInventoryLevels([
          { inventory_item_id: l.inventory_item_id, location_id: l.location_id, stocked_quantity: l.stocked_quantity },
        ])
      }
    }
  }
)
