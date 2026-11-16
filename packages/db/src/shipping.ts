import type { D1 } from "./client"

export type DeleteShippingOptionResult = "deleted" | "not_found" | "system_managed" | "in_use"

/** Removes a custom option only when no unfinished cart still relies on it. */
export async function deleteShippingOption(db: D1, id: string): Promise<DeleteShippingOptionResult> {
  const option = await db
    .prepare(`SELECT provider FROM shipping_option WHERE id = ?1`)
    .bind(id)
    .first<{ provider: string }>()
  if (!option) {
    return "not_found"
  }
  if (option.provider !== "manual" || !id.startsWith("ship_")) {
    return "system_managed"
  }

  const result = await db
    .prepare(
      `DELETE FROM shipping_option
        WHERE id = ?1
          AND provider = 'manual'
          AND substr(id, 1, 5) = 'ship_'
          AND NOT EXISTS (
            SELECT 1 FROM cart
             WHERE shipping_option_id = ?1
               AND completed_order_id IS NULL
          )`
    )
    .bind(id)
    .run()

  return result.meta?.changes ? "deleted" : "in_use"
}
