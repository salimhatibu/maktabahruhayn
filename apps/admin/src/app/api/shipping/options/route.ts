import { NextResponse, type NextRequest } from "next/server"
import { KENYA_COUNTIES, PRICED_CURRENCIES } from "@maktabah/shared"
import { newId, toMinor } from "@maktabah/db"
import { db } from "@/lib/db"

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ message: "Invalid shipping method." }, { status: 400 })
    }
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : ""
  const amount = body.amount
  const currency = typeof body.currency === "string" ? body.currency.trim().toLowerCase() : ""
  if (
    !name ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 10_000_000 ||
    !/^[a-z]{3}$/.test(currency) ||
    !PRICED_CURRENCIES.includes(currency) ||
    (currency === "kes" && !Number.isInteger(amount))
  ) {
    return NextResponse.json({ message: "Enter a name, valid price, and three-letter currency code." }, { status: 400 })
  }

  if (!Array.isArray(body.countries) || body.countries.length > 250) {
    return NextResponse.json({ message: "Choose valid destination country codes." }, { status: 400 })
  }
  const countries = [...new Set(body.countries.map((value) => (typeof value === "string" ? value.trim().toLowerCase() : "")))]
  if (countries.some((country) => !/^[a-z]{2}$/.test(country))) {
    return NextResponse.json({ message: "Choose valid destination country codes." }, { status: 400 })
  }

  let countyPrices: Record<string, number> | null = null
  if (body.county_prices !== null && body.county_prices !== undefined) {
    if (
      !body.county_prices ||
      typeof body.county_prices !== "object" ||
      Array.isArray(body.county_prices) ||
      currency !== "kes" ||
      !countries.includes("ke")
    ) {
      return NextResponse.json({ message: "County prices must be configured in KES for Kenya." }, { status: 400 })
    }
    const suppliedPrices = body.county_prices as Record<string, unknown>
    if (Object.keys(suppliedPrices).length !== KENYA_COUNTIES.length) {
      return NextResponse.json({ message: "Enter a price for every Kenyan county." }, { status: 400 })
    }
    countyPrices = {}
    for (const county of KENYA_COUNTIES) {
      const price = suppliedPrices[county.code]
      if (typeof price !== "number" || !Number.isSafeInteger(price) || price <= 0 || price > 1_000_000) {
        return NextResponse.json({ message: `Enter a positive whole-KES price for ${county.name}.` }, { status: 400 })
      }
      countyPrices[county.code] = toMinor(price)
    }
  }

  if (typeof body.is_active !== "boolean") {
    return NextResponse.json({ message: "Choose whether this method is active." }, { status: 400 })
  }

  const id = body.id === undefined ? null : typeof body.id === "string" ? body.id.trim() : ""
  if (id === "") {
    return NextResponse.json({ message: "Invalid shipping method ID." }, { status: 400 })
  }
  const database = await db()
  const serializedCountries = JSON.stringify(countries)
  const serializedPrices = JSON.stringify(countyPrices || {})
  const amountMinor = toMinor(amount)

  if (id) {
    const existing = await database
      .prepare(`SELECT provider FROM shipping_option WHERE id = ?1`)
      .bind(id)
      .first<{ provider: string }>()
    if (!existing) {
      return NextResponse.json({ message: "Shipping method not found." }, { status: 404 })
    }
    if (existing.provider !== "manual") {
      return NextResponse.json({ message: "Live carrier rates cannot be edited here." }, { status: 409 })
    }
    await database
      .prepare(
        `UPDATE shipping_option
            SET name = ?2, countries = ?3, amount_minor = ?4, currency_code = ?5,
                county_prices_json = ?6, is_active = ?7
          WHERE id = ?1`
      )
      .bind(id, name, serializedCountries, amountMinor, currency, serializedPrices, body.is_active ? 1 : 0)
      .run()
    return NextResponse.json({ id })
  }

  const newOptionId = newId("ship")
  await database
    .prepare(
      `INSERT INTO shipping_option (
         id, name, provider, countries, amount_minor, currency_code, rank, is_active, county_prices_json
       )
       VALUES (
         ?1, ?2, 'manual', ?3, ?4, ?5,
         (SELECT COALESCE(MAX(rank), 0) + 1 FROM shipping_option), ?6, ?7
       )`
    )
    .bind(newOptionId, name, serializedCountries, amountMinor, currency, body.is_active ? 1 : 0, serializedPrices)
    .run()
  return NextResponse.json({ id: newOptionId }, { status: 201 })
}
