import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"

export default async function seedFulfillment({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(Modules.FULFILLMENT)

  // Every country we sell to: whatever the regions contain (run seed:regions first).
  const { data: regions } = await query.graph({ entity: "region", fields: ["countries.iso_2"] })
  const COUNTRIES = [
    ...new Set(regions.flatMap((r) => (r.countries || []).map((c) => String(c?.iso_2).toLowerCase()))),
  ].filter(Boolean)

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  })

  let locationId = locations[0]?.id as string | undefined

  if (!locationId) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Nairobi Warehouse",
            address: {
              city: "Nairobi",
              country_code: "KE",
              address_1: "Nairobi CBD",
              postal_code: "00100",
            },
          },
        ],
      },
    })
    locationId = result[0].id
    logger.info("Created Nairobi Warehouse")
  }

  for (const providerId of ["manual_manual", "shippo_shippo"]) {
    try {
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: providerId },
      })
      logger.info(`Linked ${providerId} to stock location`)
    } catch (error) {
      logger.info(`Provider link ${providerId} already present or skipped`)
      logger.info(String(error))
    }
  }

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
  })

  if (channels[0]?.id) {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: locationId,
        add: [channels[0].id],
      },
    })
    logger.info("Linked default sales channel to stock location")
  }

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name"],
  })

  if (options.some((option) => option.name === "International Express (Shippo)")) {
    // Keep the worldwide zone in step with the region configuration.
    const zones = await fulfillment.listServiceZones(
      { name: "Worldwide" },
      { relations: ["geo_zones"] }
    )
    for (const zone of zones) {
      const have = new Set(zone.geo_zones.map((g) => g.country_code))
      const missing = COUNTRIES.filter((c) => !have.has(c))
      if (missing.length) {
        await fulfillment.createGeoZones(
          missing.map((country_code) => ({
            service_zone_id: zone.id,
            type: "country" as const,
            country_code,
          }))
        )
        logger.info(`Added ${missing.length} countries to the Worldwide shipping zone`)
      }
    }
    logger.info("Shippo shipping options already exist")
    return
  }

  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const profileId = profiles[0]?.id
  if (!profileId) {
    throw new Error("No shipping profile found")
  }

  const fulfillmentSet = await fulfillment.createFulfillmentSets({
    name: "Maktabah worldwide delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Worldwide",
        geo_zones: COUNTRIES.map((country_code) => ({
          type: "country" as const,
          country_code,
        })),
      },
    ],
  })

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  })

  const zoneId = fulfillmentSet.service_zones[0].id
  const rules = [
    { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
    { attribute: "is_return", value: "false", operator: "eq" as const },
  ]

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "International Express (Shippo)",
        price_type: "calculated",
        provider_id: "shippo_shippo",
        service_zone_id: zoneId,
        shipping_profile_id: profileId,
        data: { id: "shippo-express" },
        type: {
          label: "Express",
          description: "DHL Express, FedEx, or UPS",
          code: "shippo-express",
        },
        rules,
      },
      {
        name: "International Postal / EMS (Shippo)",
        price_type: "calculated",
        provider_id: "shippo_shippo",
        service_zone_id: zoneId,
        shipping_profile_id: profileId,
        data: { id: "shippo-postal" },
        type: {
          label: "Postal",
          description: "Postal service or EMS, including Posta Kenya",
          code: "shippo-postal",
        },
        rules,
      },
    ],
  })

  logger.info("Created Shippo calculated shipping options")
}
