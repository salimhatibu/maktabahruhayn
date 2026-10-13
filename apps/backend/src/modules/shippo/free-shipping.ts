import { roundPrice } from "../../lib/currency-regions"
import { convertAmount } from "../../lib/fx-rates"
import { getRuntimeSetting } from "../../lib/runtime-settings"

/**
 * Free standard (postal) shipping thresholds, in major units. USD and KES are
 * set in the admin (Shipping settings, defaulting to env); every other
 * currency uses the USD threshold converted at the current rate. A threshold
 * of 0 disables free shipping.
 */
export async function getFreeShippingThreshold(currencyCode: string): Promise<number> {
  const currency = currencyCode.toLowerCase()
  const settings = getRuntimeSetting("shipping")
  const usd = Number(settings.freeThresholdUsd)
  const explicit: Record<string, number> = {
    usd,
    kes: Number(settings.freeThresholdKes),
  }
  if (currency in explicit) {
    return explicit[currency]
  }
  if (usd <= 0) {
    return 0
  }
  const converted = await convertAmount(usd, "usd", currency)
  // Round the threshold up to a whole, friendly figure.
  return converted ? Math.ceil(roundPrice(converted, currency)) : 0
}

/** The fulfillment option that becomes free above the threshold. */
export const FREE_SHIPPING_OPTION_ID = "shippo-postal"

export async function qualifiesForFreeShipping(currencyCode: string, itemSubtotal: number) {
  const threshold = await getFreeShippingThreshold(currencyCode)
  return threshold > 0 && itemSubtotal >= threshold
}
