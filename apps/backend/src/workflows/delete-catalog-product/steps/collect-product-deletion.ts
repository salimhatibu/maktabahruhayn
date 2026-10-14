import type { IInventoryService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PRODUCT_FILE_FIELDS, productFileUrls } from "../../../lib/product-files"

export type ProductDeletionPlan = {
  /** Files the product owns, read before it is deleted. */
  file_urls: string[]
  /**
   * Reservations held against the product's stock. Medusa refuses to delete an
   * inventory item that still has one, which would otherwise make a book that
   * sits in an open order impossible to delete.
   */
  reservation_ids: string[]
}

/** Reads everything about a product that is unavailable once it is deleted. */
export const collectProductDeletionStep = createStep(
  "collect-product-deletion",
  async ({ id }: { id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", ...PRODUCT_FILE_FIELDS, "variants.inventory_items.inventory_item_id"],
      filters: { id },
    })

    const product = data[0] as
      | { variants?: { inventory_items?: { inventory_item_id: string }[] }[] }
      | undefined
    if (!product) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
    }

    const inventoryItemIds = [
      ...new Set(
        (product.variants || []).flatMap((variant) =>
          (variant.inventory_items || []).map((item) => item.inventory_item_id)
        )
      ),
    ]

    let reservationIds: string[] = []
    if (inventoryItemIds.length) {
      const inventory: IInventoryService = container.resolve(Modules.INVENTORY)
      const reservations = await inventory.listReservationItems(
        { inventory_item_id: inventoryItemIds },
        { select: ["id"] }
      )
      reservationIds = reservations.map((reservation) => reservation.id)
    }

    return new StepResponse({
      file_urls: productFileUrls(data[0]),
      reservation_ids: reservationIds,
    } satisfies ProductDeletionPlan)
  }
)
