import { NextResponse } from "next/server"
import { CURRENCY_REGIONS } from "@maktabah/shared"
import { toMajor } from "@maktabah/db"
import { db } from "@/lib/db"
import { shippoConfig } from "@/lib/payments"

type ShipmentRow = {
  id: string
  created_at: string
  status: string | null
  tracking_number: string | null
  tracking_url: string | null
  label_url: string | null
  order_id: string | null
  display_id: number | null
  email: string | null
  shipping_address: string | null
  fulfillment_status: string | null
}

/**
 * GET /api/shipping — the same overview the previous admin showed: gateway
 * status, the options on offer, the zones they cover, and shipments with
 * their tracking.
 */
export async function GET() {
  const database = await db()
  const [options, shipments] = await database.batch<Record<string, string | number | null>>([
    database.prepare(
      `SELECT id, name, provider, countries, amount_minor, currency_code, free_above_minor, is_active
         FROM shipping_option ORDER BY rank, name`
    ),
    database.prepare(
      `SELECT s.id, s.created_at, s.status, s.tracking_number, s.tracking_url, s.label_url,
              s.order_id, o.display_id, o.email, o.shipping_address, o.fulfillment_status
         FROM shipment s LEFT JOIN "order" o ON o.id = s.order_id
        ORDER BY s.created_at DESC LIMIT 100`
    ),
  ])

  const fulfillments = (shipments.results as unknown as ShipmentRow[]).map((row) => {
    const address = JSON.parse(String(row.shipping_address || "{}")) as Record<string, string>
    return {
      id: row.id,
      created_at: row.created_at,
      shipped_at: row.status === "shipped" || row.fulfillment_status === "shipped" ? row.created_at : null,
      delivered_at: row.fulfillment_status === "delivered" ? row.created_at : null,
      canceled_at: null,
      data: null,
      metadata: null,
      labels: row.tracking_number
        ? [
            {
              tracking_number: row.tracking_number,
              tracking_url: row.tracking_url || "",
              label_url: row.label_url || "",
            },
          ]
        : [],
      order: row.order_id ? { id: row.order_id, display_id: Number(row.display_id || 0), email: row.email || "" } : null,
      delivery_address: { country_code: address.country_code || "", city: address.city || "" },
    }
  })

  return NextResponse.json({
    shippo_configured: Boolean(shippoConfig()),
    webhook_configured: Boolean(process.env.SHIPPO_WEBHOOK_SECRET),
    fulfillments,
    options: options.results.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      price_type: row.provider === "shippo" ? "calculated" : "flat",
      provider_id: String(row.provider),
      amount: row.amount_minor === null ? null : toMajor(Number(row.amount_minor)),
      free_above: row.free_above_minor === null ? null : toMajor(Number(row.free_above_minor)),
      service_zone: { name: JSON.parse(String(row.countries || "[]")).length ? "Selected countries" : "Worldwide" },
    })),
    // Zones are the currency regions: that is what decides where we ship.
    zones: CURRENCY_REGIONS.map((region) => ({
      id: region.currency,
      name: region.name,
      countries: region.countries,
    })),
  })
}
