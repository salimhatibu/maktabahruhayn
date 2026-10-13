import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  updateRegionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { CURRENCY_REGIONS as CONFIGURED, NO_SHIPPING, PRICED_CURRENCIES } from "../lib/currency-regions"
import { syncConvertedPricesWorkflow } from "../workflows/sync-converted-prices"

/** Earlier names of regions that map onto a configured region. */
const ALIASES: Record<string, string[]> = {
  Kenya: ["Kenya / East Africa"],
  "United States & International": ["Global / International", "Europe"],
}

/**
 * Makes Medusa regions match CURRENCY_REGIONS: one region per currency, each
 * with its countries and payment providers. Safe to re-run.
 *
 *   pnpm --filter @maktabah/backend seed:regions
 */
export default async function seedMaktabahRegions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // The rest-of-world region takes every country no other region names.
  const { data: allCountries } = await query.graph({ entity: "country", fields: ["iso_2"] })
  const named = new Set(CONFIGURED.flatMap((c) => c.countries))
  const unclaimed = allCountries
    .map((c) => String(c.iso_2).toLowerCase())
    .filter((c) => !named.has(c) && !NO_SHIPPING.includes(c))
  const CURRENCY_REGIONS = CONFIGURED.map((c) =>
    c.restOfWorld ? { ...c, countries: [...c.countries, ...unclaimed] } : c
  )

  const { data: providers } = await query.graph({
    entity: "payment_provider",
    fields: ["id", "is_enabled"],
  })
  const enabled = new Set(providers.filter((p) => p.is_enabled).map((p) => p.id as string))
  // The system provider lets checkout be exercised locally without keys.
  const devProvider = process.env.NODE_ENV === "production" ? [] : ["pp_system_default"]

  const loadRegions = async () =>
    (
      await query.graph({
        entity: "region",
        fields: ["id", "name", "currency_code", "countries.iso_2"],
      })
    ).data.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      currency: r.currency_code as string,
      countries: (r.countries || []).map((c) => String(c?.iso_2).toLowerCase()),
    }))

  let regions = await loadRegions()
  const matchFor = (name: string) =>
    regions.find((r) => r.name === name) ||
    regions.find((r) => (ALIASES[name] || []).includes(r.name))

  // Pass 1: release countries that belong elsewhere under the new layout, so
  // they can be assigned without "country already in a region" errors.
  const wanted = new Map<string, string>()
  for (const config of CURRENCY_REGIONS) {
    config.countries.forEach((c) => wanted.set(c, config.name))
  }
  const claimed = new Set<string>()
  for (const config of CURRENCY_REGIONS) {
    const existing = matchFor(config.name)
    if (existing) {
      claimed.add(existing.id)
    }
  }
  for (const region of regions) {
    const config = CURRENCY_REGIONS.find((c) => matchFor(c.name)?.id === region.id)
    const keep = region.countries.filter((c) => (config ? config.countries.includes(c) : !wanted.has(c)))
    if (keep.length !== region.countries.length) {
      await updateRegionsWorkflow(container).run({
        input: { selector: { id: region.id }, update: { countries: keep } },
      })
    }
  }

  regions = await loadRegions()

  // Pass 2: update or create each configured region.
  for (const config of CURRENCY_REGIONS) {
    const payment_providers = [
      ...config.payments.map((p) => `pp_${p}`).filter((id) => enabled.has(id)),
      ...devProvider,
    ]
    const existing = matchFor(config.name)
    if (existing) {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: existing.id },
          update: {
            name: config.name,
            currency_code: config.currency,
            countries: config.countries,
            payment_providers,
          },
        },
      })
    } else {
      await createRegionsWorkflow(container).run({
        input: {
          regions: [
            {
              name: config.name,
              currency_code: config.currency,
              countries: config.countries,
              payment_providers,
              is_tax_inclusive: true,
            },
          ],
        },
      })
    }
    logger.info(`${existing ? "Updated" : "Created"} ${config.name} (${config.currency.toUpperCase()}): ${payment_providers.join(", ")}`)
  }

  const { data: stores } = await query.graph({ entity: "store", fields: ["id"] })
  if (stores[0]) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: stores[0].id },
        update: {
          supported_currencies: PRICED_CURRENCIES.map((currency_code) => ({
            currency_code,
            is_default: currency_code === "usd",
          })),
        },
      },
    })
    logger.info(`Store currencies: ${PRICED_CURRENCIES.join(", ").toUpperCase()}`)
  }

  const { result } = await syncConvertedPricesWorkflow(container).run({ input: {} })
  logger.info(`Derived ${result.base_prices} prices and ${result.list_prices} sale prices from USD`)
}
