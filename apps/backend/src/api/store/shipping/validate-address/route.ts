import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ShippoClient } from "../../../../modules/shippo/client"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as {
    name?: string
    street1?: string
    street2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
    phone?: string
    email?: string
  }

  if (!body.street1 || !body.city || !body.country) {
    res.status(400).json({
      is_valid: false,
      messages: ["street1, city, and country are required"],
    })
    return
  }

  const client = new ShippoClient({
    apiKey: process.env.SHIPPO_API_KEY || "",
    fromAddress: {
      name: process.env.SHIPPO_FROM_NAME || "Maktabah Ruhayn",
      street1: process.env.SHIPPO_FROM_STREET1 || "Nairobi CBD",
      city: process.env.SHIPPO_FROM_CITY || "Nairobi",
      state: process.env.SHIPPO_FROM_STATE || "Nairobi",
      zip: process.env.SHIPPO_FROM_ZIP || "00100",
      country: process.env.SHIPPO_FROM_COUNTRY || "KE",
    },
  })

  const result = await client.validateAddress({
    name: body.name || "Customer",
    street1: body.street1,
    street2: body.street2,
    city: body.city,
    state: body.state,
    zip: body.zip || "00000",
    country: body.country.toUpperCase(),
    phone: body.phone,
    email: body.email,
  })

  res.json(result)
}
