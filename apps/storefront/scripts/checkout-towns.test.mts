import assert from "node:assert/strict"
import { test } from "node:test"
import { checkoutPlaces, fetchCheckoutTowns, selectedCheckoutTown } from "../src/lib/checkout-towns.ts"

test("towns are uncached, county-scoped and restore saved spelling after loading", async () => {
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, "/api/towns")
    assert.equal(options?.cache, "no-store")
    return Response.json({ towns: { nairobi: ["Ruiru", "Juja"], mombasa: ["Bamburi"] } })
  }
  const towns = await fetchCheckoutTowns(fetcher)
  const nairobi = checkoutPlaces(["Westlands"], towns, "nairobi")
  assert.deepEqual(nairobi, ["Westlands", "Ruiru", "Juja"])
  assert.equal(selectedCheckoutTown(nairobi, " rUIru "), "Ruiru")
  assert.equal(selectedCheckoutTown(checkoutPlaces(["Nyali"], towns, "mombasa"), "Ruiru"), "")
  assert.equal(selectedCheckoutTown(nairobi, ""), "")
  assert.equal(selectedCheckoutTown(["Westlands"], "Ruiru"), "")
})

test("failed and malformed responses can be retried", async () => {
  let attempts = 0
  const fetcher: typeof fetch = async () => {
    attempts++
    if (attempts === 1) return new Response(null, { status: 500 })
    if (attempts === 2) return Response.json({ towns: { nairobi: "Ruiru" } })
    return Response.json({ towns: { nairobi: ["Ruiru"] } })
  }
  await assert.rejects(fetchCheckoutTowns(fetcher))
  await assert.rejects(fetchCheckoutTowns(fetcher))
  assert.deepEqual(await fetchCheckoutTowns(fetcher), { nairobi: ["Ruiru"] })
})
