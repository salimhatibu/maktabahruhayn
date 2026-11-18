/**
 * Integration tests for the money path: carts, payments, orders, accounts and
 * the catalogue, run against a real D1 (workerd's SQLite) that is built fresh
 * for every run from all migrations plus the seed catalogue, in a temporary
 * directory. Nothing touches the local development database.
 *
 *   pnpm db:test
 *
 * Several tests replay attacks that worked before they were fixed: paying for
 * a small cart then growing it, paying in a cheaper currency, completing one
 * cart with another cart's payment, and overwriting another customer's address.
 */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const storefront = path.join(root, "apps/storefront")
const requireFromStorefront = createRequire(path.join(storefront, "package.json"))
const { getPlatformProxy } = requireFromStorefront("wrangler")
const esbuild = createRequire(requireFromStorefront.resolve("wrangler/package.json"))("esbuild")
const wrangler = path.join(storefront, "node_modules/.bin/wrangler")

const work = mkdtempSync(path.join(tmpdir(), "maktabah-integration-"))
process.on("exit", () => rmSync(work, { recursive: true, force: true }))
writeFileSync(
  path.join(work, "wrangler.jsonc"),
  JSON.stringify({
    name: "maktabah-integration",
    compatibility_date: "2026-09-01",
    d1_databases: [
      { binding: "DB", database_name: "maktabah-test", database_id: "00000000-0000-0000-0000-000000000000", migrations_dir: path.join(root, "packages/db/migrations") },
    ],
  })
)
const quiet = { cwd: work, stdio: ["ignore", "pipe", "pipe"] }
execFileSync(wrangler, ["d1", "migrations", "apply", "maktabah-test", "--local", "--persist-to", "./state"], quiet)
execFileSync(process.execPath, ["--experimental-strip-types", path.join(root, "packages/db/scripts/build-catalog-seed.mjs")], { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
execFileSync(wrangler, ["d1", "execute", "maktabah-test", "--local", "--persist-to", "./state", `--file=${path.join(root, "packages/db/seed/catalog.sql")}`], quiet)
await esbuild.build({
  entryPoints: [path.join(root, "packages/db/src/index.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  outfile: path.join(work, "db.mjs"),
  logLevel: "warning",
})
const lib = await import(path.join(work, "db.mjs"))
await esbuild.build({
  entryPoints: [path.join(root, "apps/storefront/src/lib/checkout-total.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: path.join(work, "checkout-total.mjs"),
  logLevel: "warning",
})
const { checkoutTotal } = await import(path.join(work, "checkout-total.mjs"))

await esbuild.build({
  entryPoints: [path.join(root, "apps/admin/src/app/api/towns/route.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  outfile: path.join(work, "towns-route.mjs"),
  plugins: [{
    name: "towns-route-test-bindings",
    setup(build) {
      build.onResolve({ filter: /^(next\/server|@\/lib\/db)$/ }, (args) => ({ path: args.path, namespace: "towns-test" }))
      build.onLoad({ filter: /.*/, namespace: "towns-test" }, (args) => ({
        contents: args.path === "next/server"
          ? `export const NextResponse = { json: (body, init) => Response.json(body, init) }`
          : `export async function db() { return globalThis.__townsTestDb }`,
        loader: "js",
      }))
    },
  }],
  logLevel: "warning",
})
const townsRoute = await import(path.join(work, "towns-route.mjs"))

const mpesaConfig = {
  consumerKey: "test-key",
  consumerSecret: "test-secret",
  passkey: "test-passkey",
  shortcode: "123456",
  partyB: "654321",
  transactionType: "CustomerBuyGoodsOnline",
  callbackUrl: "https://example.com/callback",
  environment: "sandbox",
}
assert.equal(lib.mpesa.mpesaConfigured(mpesaConfig), true)
assert.equal(lib.mpesa.mpesaConfigured({ ...mpesaConfig, partyB: "" }), false)
assert.equal(lib.mpesa.mpesaConfigured({ ...mpesaConfig, transactionType: "invalid" }), false)
assert.equal(lib.mpesa.mpesaConfigured({ ...mpesaConfig, environment: "invalid" }), false)
{
  const originalFetch = globalThis.fetch
  let pushBody
  try {
    globalThis.fetch = async (url, init) => {
      if (url.includes("/oauth/")) {
        return Response.json({ access_token: "test-token" })
      }
      pushBody = JSON.parse(init.body)
      return Response.json({ ResponseCode: "0", MerchantRequestID: "merchant", CheckoutRequestID: "checkout" })
    }
    await lib.mpesa.stkPush(mpesaConfig, {
      phone: "0712345678",
      amount: 100,
      accountReference: "test",
      description: "test",
    })
    assert.equal(pushBody.TransactionType, "CustomerBuyGoodsOnline")
    assert.equal(pushBody.BusinessShortCode, "123456")
    assert.equal(pushBody.PartyB, "654321")
  } finally {
    globalThis.fetch = originalFetch
  }
}

const proxy = await getPlatformProxy({ configPath: path.join(work, "wrangler.jsonc"), persist: { path: path.join(work, "state/v3") } })
const db = proxy.env.DB
let passed = 0
const test = async (name, fn) => {
  try {
    await fn()
    passed++
    console.log(`[  ok  ] ${name}`)
  } catch (error) {
    console.log(`[ FAIL ] ${name}\n         ${error.message.split("\n").join("\n         ")}`)
    process.exitCode = 1
  }
}
const one = (sql, ...args) => db.prepare(sql).bind(...args).first()

await test("M-Pesa does not send an STK request when authentication fails", async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async () => {
      calls++
      return Response.json({ error: "unauthorized" }, { status: 401 })
    }
    await assert.rejects(
      lib.mpesa.stkPush(mpesaConfig, { phone: "0712345678", amount: 100, accountReference: "test", description: "test" }),
      lib.mpesa.MpesaRequestNotSentError
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
await test("M-Pesa status queries reject missing or malformed result codes", async () => {
  const originalFetch = globalThis.fetch
  let queryResult = { ResponseCode: "0", ResultCode: "0", ResultDesc: "Success" }
  try {
    globalThis.fetch = async (url) => url.includes("/oauth/")
      ? Response.json({ access_token: "test-token" })
      : Response.json(queryResult)
    assert.equal((await lib.mpesa.queryStk(mpesaConfig, "checkout")).resultCode, 0)
    for (const result of [null, "", "not-a-number", -1]) {
      queryResult = { ResponseCode: "0", ResultCode: result }
      await assert.rejects(lib.mpesa.queryStk(mpesaConfig, "checkout"), /invalid status/)
    }
    queryResult = { ResponseCode: "1", ResultCode: "0" }
    await assert.rejects(lib.mpesa.queryStk(mpesaConfig, "checkout"), /invalid status/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
await test("M-Pesa callback URLs must use HTTPS", async () => {
  assert.equal(lib.mpesa.callbackUrlWithToken("http://example.com/callback", "0123456789abcdef"), "")
  assert.ok(lib.mpesa.callbackUrlWithToken("https://example.com/callback", "0123456789abcdef"))
})

await test("binding metadata is removed from the schema and navigation", async () => {
  const columns = await db.prepare(`PRAGMA table_info(book)`).all()
  assert.equal(columns.results.some((column) => column.name === "binding_type"), false)
  const navigation = await one(`SELECT value FROM store_setting WHERE key = 'navigation'`)
  assert.ok(!navigation.value.includes("binding_type"))
})

// Two in-stock, priced, published books to shop with.
const { results: books } = await db
  .prepare(
    `SELECT v.id AS variant_id, p.id AS product_id, p.handle
       FROM variant v JOIN product p ON p.id = v.product_id
      WHERE p.status = 'published' AND v.manage_inventory = 1
        AND EXISTS (SELECT 1 FROM variant_price vp WHERE vp.variant_id = v.id AND vp.kind = 'base' AND vp.currency_code = 'usd')
        AND (SELECT SUM(stocked_quantity - reserved_quantity) FROM inventory_level il WHERE il.variant_id = v.id) >= 10
      LIMIT 2`
  )
  .all()
assert.equal(books.length, 2, "seed has two in-stock books")
const [A, B] = books
await db.prepare(`UPDATE fx_rate SET rate = 130 WHERE currency_code = 'kes'`).run()
// Plenty of copies, so repeated runs test races rather than running out.
await db
  .prepare(`UPDATE inventory_level SET stocked_quantity = 1000, reserved_quantity = 0 WHERE variant_id IN (?1, ?2)`)
  .bind(A.variant_id, B.variant_id)
  .run()

async function cartWith(lines, fields = {}) {
  const id = await lib.createCart(db, { currency: fields.currency || "usd", countryCode: "us" })
  for (const [variant, qty] of lines) await lib.addLine(db, id, variant, qty, fields.currency || "usd")
  await lib.setCartFields(db, id, {
    email: "shopper@example.com",
    shippingAddress: { first_name: "A", last_name: "B", address_1: "1 Road", city: "Nairobi", country_code: "ke" },
    shippingOptionId: lib.STANDARD_SHIPPING_ID,
    shippingTotalMinor: 500,
    ...fields,
  })
  return id
}
const stock = async (variant) =>
  Number((await one(`SELECT SUM(stocked_quantity) AS s FROM inventory_level WHERE variant_id = ?1`, variant)).s)

/* ------------------------------------------------------------- ids */
await test("ids are unique, sortable and not predictable from Math.random", async () => {
  const ids = Array.from({ length: 2000 }, () => lib.newId("cart"))
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids.slice(0, 5)) assert.match(id, /^cart_[0-9a-z]{8,9}[0-9a-z]{16}$/)
})

/* ------------------------------------------------------------- cart */
await test("checkout total includes the selected delivery price and handles discounts", async () => {
  assert.equal(checkoutTotal(3000, 0, 0, 500), 3500)
  assert.equal(checkoutTotal(3000, 100, 0, 650), 3550)
  assert.equal(checkoutTotal(19.99, 2.5, 0, 4.99), 22.48)
  assert.equal(checkoutTotal(3000, 0, 0, 0), 3000)
  assert.equal(checkoutTotal(3000, 0, 0, null), null)
})

await test("order notifications are logged, deduplicated and retry failed sends", async () => {
  const id = "order_notification_regression"
  await db.prepare(
    `INSERT INTO "order" (id, display_id, email, currency_code, subtotal_minor, total_minor, shipping_address)
     VALUES (?1, 900002, 'shopper@example.com', 'kes', 350000, 350000, '{"first_name":"A"}')`
  ).bind(id).run()
  const config = { endpoint: "https://example.invalid/emails", token: "test", storeUrl: "https://example.invalid" }
  const originalFetch = globalThis.fetch
  let sends = 0
  try {
    globalThis.fetch = async (_url, request) => {
      sends++
      const body = JSON.parse(request.body)
      assert.deepEqual(body.to, ["shopper@example.com"])
      assert.match(body.subject, /900002/)
      return new Response(JSON.stringify({ id: "provider-id" }), { status: 200 })
    }
    assert.equal((await lib.notifyOrder(db, id, "order_placed", {})).ok, false)
    assert.equal((await lib.notifyOrder(db, id, "order_placed", config)).ok, true)
    assert.equal((await lib.notifyOrder(db, id, "order_placed", config)).ok, true)
    assert.equal(sends, 1)
    assert.equal((await lib.notifyOrder(db, id, "order_completed", config)).ok, true)
    assert.equal(sends, 2)
    assert.equal((await one(`SELECT COUNT(*) AS n FROM email_log WHERE recipient = 'shopper@example.com' AND template IN ('order_placed', 'order_completed')`)).n, 3)
    await db.prepare(`DELETE FROM "order" WHERE id = ?1`).bind(id).run()
    assert.equal((await one(`SELECT COUNT(*) AS n FROM order_notification WHERE order_id = ?1`, id)).n, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
await test("deleting an order removes its payment without reusing its number or replaying the cart", async () => {
  const place = async () => {
    const cartId = await cartWith([[A.variant_id, 1]])
    const result = await lib.placeOrder(db, {
      cartId,
      idempotencyKey: lib.orderKeyForCart(cartId),
      email: "shopper@example.com",
      payment: { provider: "manual", status: "captured" },
    })
    assert.equal(result.ok, true)
    return { ...result, cartId }
  }
  const first = await place()
  await db.prepare(`DELETE FROM "order" WHERE id = ?1`).bind(first.orderId).run()
  assert.equal((await one(`SELECT COUNT(*) AS n FROM payment WHERE order_id = ?1`, first.orderId)).n, 0)
  const replay = await lib.finalizePaidCart(db, {
    cartId: first.cartId, provider: "manual", reference: "deleted", paidMinor: 0, currency: "usd",
  })
  assert.equal(replay.ok, false)
  const second = await place()
  assert.ok(second.displayId > first.displayId)
})
await test("a published, priced edition goes in the cart at its price", async () => {
  const id = await cartWith([[A.variant_id, 2]])
  const cart = await lib.getCart(db, id)
  assert.equal(cart.lines.length, 1)
  assert.ok(cart.lines[0].unitPriceMinor > 0)
  assert.equal(cart.lines[0].quantity, 2)
})
await test("Kenya EXPRESS rates use the selected county and are not offered without one", async () => {
  const row = await one(`SELECT county_prices_json FROM shipping_option WHERE id = 'express-kenya'`)
  const countyPrices = JSON.parse(row.county_prices_json)
  assert.equal(Object.keys(countyPrices).length, 47)
  const getExpressRate = async (countyCode) =>
    (await lib.listShippingOptions(db, { countryCode: "ke", currency: "kes", subtotalMinor: 0, countyCode })).find(
      (option) => option.id === "express-kenya"
    )
  for (const [county, expectedMinor] of [
    ["nairobi", 50000],
    ["kiambu", 50000],
    ["mombasa", 65000],
    ["marsabit", 65000],
    ["isiolo", 65000],
    ["kilifi", 65000],
    ["nakuru", 75000],
  ]) {
    assert.equal((await getExpressRate(county))?.amountMinor, expectedMinor, county)
  }
  assert.equal(await getExpressRate(null), undefined)
  assert.equal(
    (await lib.listShippingOptions(db, { countryCode: "us", currency: "usd", subtotalMinor: 0, countyCode: "nairobi" })).some(
      (option) => option.id === "express-kenya"
    ),
    false
  )
})
await test("manual shipping methods can be added and edited", async () => {
  const countyPrices = JSON.stringify({ nairobi: 50000 })
  await db
    .prepare(
      `INSERT INTO shipping_option (
         id, name, provider, countries, amount_minor, currency_code, rank, is_active, county_prices_json
       )
       VALUES (?1, ?2, 'manual', ?3, ?4, ?5, 1, ?6, ?7)`
    )
    .bind("shipping-save-regression", "LOCAL", JSON.stringify(["ke"]), 0, "kes", 1, countyPrices)
    .run()
  await db
    .prepare(
      `UPDATE shipping_option
          SET name = ?2, countries = ?3, amount_minor = ?4, currency_code = ?5,
              county_prices_json = ?6, is_active = ?7
        WHERE id = ?1`
    )
    .bind(
      "shipping-save-regression",
      "LOCAL EXPRESS",
      JSON.stringify(["ke", "ug"]),
      75000,
      "kes",
      JSON.stringify({ nairobi: 60000 }),
      0
    )
    .run()
  const saved = await one(
    `SELECT name, countries, amount_minor, currency_code, county_prices_json, is_active
       FROM shipping_option WHERE id = 'shipping-save-regression'`
  )
  assert.equal(saved.name, "LOCAL EXPRESS")
  assert.deepEqual(JSON.parse(saved.countries), ["ke", "ug"])
  assert.equal(saved.amount_minor, 75000)
  assert.equal(saved.currency_code, "kes")
  assert.deepEqual(JSON.parse(saved.county_prices_json), { nairobi: 60000 })
  assert.equal(saved.is_active, 0)
})
await test("custom shipping methods cannot be deleted while in use and preserve order snapshots", async () => {
  const methodId = "ship_delete_regression"
  const orderId = "order_shipping_delete_regression"
  const cartId = "cart_shipping_delete_regression"
  const methodSnapshot = { name: "Custom delivery", provider: "manual", amount_minor: 450 }
  await db
    .prepare(
      `INSERT INTO shipping_option (id, name, provider, countries, amount_minor, currency_code, is_active)
       VALUES (?1, 'Custom delivery', 'manual', '[]', 450, 'usd', 1)`
    )
    .bind(methodId)
    .run()
  assert.ok(
    (await lib.listShippingOptions(db, { countryCode: "us", currency: "usd", subtotalMinor: 0 })).some(
      (option) => option.id === methodId
    )
  )
  await db
    .prepare(
      `INSERT INTO "order" (
         id, display_id, email, currency_code, subtotal_minor, shipping_minor, tax_minor, total_minor,
         shipping_address, shipping_method
       ) VALUES (?1, 900001, 'shipping@example.com', 'usd', 1000, 450, 0, 1450, '{}', ?2)`
    )
    .bind(orderId, JSON.stringify(methodSnapshot))
    .run()
  await db
    .prepare(`INSERT INTO cart (id, currency_code, shipping_option_id) VALUES (?1, 'usd', ?2)`)
    .bind(cartId, methodId)
    .run()

  assert.equal(await lib.deleteShippingOption(db, methodId), "in_use")
  assert.equal((await one(`SELECT id FROM shipping_option WHERE id = ?1`, methodId)).id, methodId)

  await db
    .prepare(`UPDATE cart SET completed_order_id = ?2 WHERE id = ?1`)
    .bind(cartId, orderId)
    .run()
  assert.equal(await lib.deleteShippingOption(db, methodId), "deleted")
  assert.equal(await one(`SELECT id FROM shipping_option WHERE id = ?1`, methodId), null)
  assert.deepEqual(JSON.parse((await one(`SELECT shipping_method FROM "order" WHERE id = ?1`, orderId)).shipping_method), methodSnapshot)
  assert.equal(
    (await lib.listShippingOptions(db, { countryCode: "us", currency: "usd", subtotalMinor: 0 })).some(
      (option) => option.id === methodId
    ),
    false
  )

  assert.equal(await lib.deleteShippingOption(db, "express-kenya"), "system_managed")
  assert.equal(await lib.deleteShippingOption(db, "missing-shipping-method"), "not_found")
})
await test("a draft product cannot be added", async () => {
  await db.prepare(`UPDATE product SET status = 'draft' WHERE id = ?1`).bind(B.product_id).run()
  const id = await lib.createCart(db, { currency: "usd" })
  await assert.rejects(lib.addLine(db, id, B.variant_id, 1), /not available/)
  await db.prepare(`UPDATE product SET status = 'published' WHERE id = ?1`).bind(B.product_id).run()
})
await test("an edition with no price cannot be added at zero", async () => {
  const saved = await db.prepare(`SELECT * FROM variant_price WHERE variant_id = ?1`).bind(B.variant_id).all()
  await db.prepare(`DELETE FROM variant_price WHERE variant_id = ?1`).bind(B.variant_id).run()
  const id = await lib.createCart(db, { currency: "usd" })
  await assert.rejects(lib.addLine(db, id, B.variant_id, 1), /not available/)
  for (const row of saved.results) {
    await db
      .prepare(`INSERT INTO variant_price (variant_id, currency_code, kind, amount_minor, price_list_id) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(row.variant_id, row.currency_code, row.kind, row.amount_minor, row.price_list_id ?? null)
      .run()
  }
})
await test("an unknown variant id cannot be added", async () => {
  const id = await lib.createCart(db, { currency: "usd" })
  await assert.rejects(lib.addLine(db, id, "var_does_not_exist", 1), /not available/)
})
await test("unreadable and huge quantities are clamped to 1..99", async () => {
  const id = await lib.createCart(db, { currency: "usd" })
  await lib.addLine(db, id, A.variant_id, Number.NaN)
  assert.equal((await lib.getCart(db, id)).lines[0].quantity, 1)
  await lib.addLine(db, id, A.variant_id, 1e9)
  assert.equal((await lib.getCart(db, id)).lines[0].quantity, 99)
  await lib.updateLine(db, id, (await lib.getCart(db, id)).lines[0].id, 5000)
  assert.equal((await lib.getCart(db, id)).lines[0].quantity, 99)
})
await test("one cart cannot change another cart's lines", async () => {
  const mine = await cartWith([[A.variant_id, 1]])
  const theirs = await cartWith([[A.variant_id, 3]])
  const theirLine = (await lib.getCart(db, theirs)).lines[0].id
  await lib.updateLine(db, mine, theirLine, 50)
  await lib.removeLine(db, mine, theirLine)
  assert.equal((await lib.getCart(db, theirs)).lines[0].quantity, 3)
})
await test("promo codes match regardless of case", async () => {
  await db
    .prepare(`INSERT OR REPLACE INTO promotion (id, code, type, value, is_active) VALUES ('promo_t', 'SAVE10', 'percentage', 10, 1)`)
    .run()
  const id = await cartWith([[A.variant_id, 1]])
  assert.equal(await lib.applyPromotion(db, id, "  save10 "), true)
  const cart = await lib.getCart(db, id)
  assert.ok(cart.totals.discountMinor > 0)
})
await test("free-shipping promotions waive the selected delivery rate", async () => {
  await db.prepare(`INSERT INTO promotion (id, code, type, value, is_active) VALUES ('promo_free_delivery', 'FREEDELIVERY', 'free_shipping', 0, 1)`).run()
  const id = await cartWith([[A.variant_id, 1]])
  assert.equal(await lib.applyPromotion(db, id, "FREEDELIVERY"), true)
  const cart = await lib.getCart(db, id)
  assert.equal(cart.totals.freeShipping, true)
  assert.equal(cart.totals.shippingMinor, 0)
  assert.equal(cart.totals.totalMinor, cart.totals.itemSubtotalMinor)
})
await test("automatic promotions apply only inside their period and cannot be typed in", async () => {
  const insert = (id, start, end) =>
    db
      .prepare(
        `INSERT INTO promotion (id, code, type, value, is_active, automatic, starts_at, ends_at)
         VALUES (?1, ?2, 'percentage', 20, 1, 1, ?3, ?4)`
      )
      .bind(id, `AUTO-${id}`, start, end)
      .run()
  const past = new Date(Date.now() - 86400000 * 2).toISOString()
  const soon = new Date(Date.now() + 86400000).toISOString()
  await insert("auto_live", past, soon)
  await insert("auto_expired", past, new Date(Date.now() - 86400000).toISOString())
  try {
    const id = await cartWith([[A.variant_id, 1]])
    const cart = await lib.getCart(db, id)
    assert.equal(cart.promotionCode, "AUTO-auto_live")
    assert.equal(cart.totals.discountMinor, Math.round(cart.totals.itemSubtotalMinor * 0.2))
    assert.equal(await lib.applyPromotion(db, id, "AUTO-auto_live"), false)
    await db.prepare(`UPDATE promotion SET is_active = 0 WHERE id = 'auto_live'`).run()
    assert.equal((await lib.getCart(db, id)).totals.discountMinor, 0)
  } finally {
    await db.prepare(`DELETE FROM promotion WHERE id LIKE 'auto_%'`).run()
  }
})
await test("a fixed discount and its minimum spend are converted into the cart's currency", async () => {
  await db
    .prepare(
      `INSERT INTO promotion (id, code, type, value, currency_code, min_subtotal_minor, is_active)
       VALUES ('promo_fixed_kes', 'KES500', 'fixed', 50000, 'kes', 1, 1)`
    )
    .run()
  try {
    const id = await cartWith([[A.variant_id, 1]], { currency: "kes" })
    assert.equal(await lib.applyPromotion(db, id, "KES500"), true)
    const cart = await lib.getCart(db, id)
    assert.equal(cart.totals.discountMinor, Math.min(50000, cart.totals.itemSubtotalMinor))
  } finally {
    await db.prepare(`DELETE FROM promotion WHERE id = 'promo_fixed_kes'`).run()
  }
})

await test("review requests are sent once, three days after delivery", async () => {
  const config = { endpoint: "https://example.invalid/emails", token: "test", storeUrl: "https://example.invalid" }
  const insert = (id, display, delivered) => db.prepare(
    `INSERT INTO "order" (id, display_id, email, currency_code, subtotal_minor, total_minor, shipping_address, fulfillment_status, delivered_at)
     VALUES (?1, ?2, 'reader@example.com', 'kes', 1000, 1000, '{"first_name":"R"}', 'delivered', ${delivered})`
  ).bind(id, display).run()
  await insert("review_old", 900101, "strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 days')")
  await insert("review_new", 900102, "strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 days')")
  const originalFetch = globalThis.fetch
  let sent = []
  try {
    globalThis.fetch = async (_url, request) => {
      sent.push(JSON.parse(request.body))
      return new Response(JSON.stringify({ id: "p" }), { status: 200 })
    }
    assert.deepEqual(await lib.sendDueReviewRequests(db, config), { sent: 1, failed: 0 })
    assert.match(sent[0].subject, /900101/)
    assert.deepEqual(await lib.sendDueReviewRequests(db, config), { sent: 0, failed: 0 })
  } finally {
    globalThis.fetch = originalFetch
    await db.prepare(`DELETE FROM "order" WHERE id IN ('review_old', 'review_new')`).run()
  }
})

await test("reviews stay hidden until approved and keep their photo", async () => {
  const product = await one(`SELECT id FROM product WHERE status = 'published' LIMIT 1`)
  const id = await lib.createReview(db, { productId: product.id, rating: 5, body: "A wonderful book to own.", photoUrl: "https://media.example.invalid/reviews/x.jpg" })
  const photos = async () => (await lib.listReviews(db, product.id, 50)).reviews.filter((r) => r.id === id)
  assert.equal((await photos()).length, 0)
  await db.prepare(`UPDATE review SET status = 'approved' WHERE id = ?1`).bind(id).run()
  assert.equal((await photos())[0].photoUrl, "https://media.example.invalid/reviews/x.jpg")
  await db.prepare(`DELETE FROM review WHERE id = ?1`).bind(id).run()
})

await test("delivery towns are seeded under Nairobi and can be added and removed", async () => {
  assert.equal(await lib.findCountyTown(db, "nairobi", "  ruiru "), "Ruiru")
  assert.equal(await lib.findCountyTown(db, "mombasa", "Ruiru"), null)
  assert.equal(await lib.addCountyTown(db, "mombasa", "Bamburi"), "added")
  assert.equal(await lib.addCountyTown(db, "mombasa", "Nyali test town"), "added")
  assert.equal(await lib.addCountyTown(db, "mombasa", "bamburi"), "exists")
  const town = (await lib.listCountyTowns(db)).find((item) => item.name === "Bamburi")
  assert.equal(await lib.findCountyTown(db, "mombasa", "Nyali test town"), "Nyali test town")
  assert.equal(await lib.deleteCountyTown(db, town.id), true)
  assert.equal(await lib.findCountyTown(db, "mombasa", "Bamburi"), null)
  const second = (await lib.listCountyTowns(db)).find((item) => item.name === "Nyali test town")
  assert.equal(await lib.deleteCountyTown(db, second.id), true)
})

await test("the admin can add several towns in the same county through the API", async () => {
  globalThis.__townsTestDb = db
  const names = ["Integration Town One", "Integration Town Two"]
  try {
    for (const name of names) {
      const response = await townsRoute.POST(new Request("https://admin.example/api/towns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ county: "mombasa", name }),
      }))
      assert.equal(response.status, 201, await response.text())
    }
    const response = await townsRoute.GET()
    assert.equal(response.headers.get("cache-control"), "no-store")
    const { towns } = await response.json()
    for (const name of names) assert.ok(towns.some((town) => town.county_code === "mombasa" && town.name === name))
  } finally {
    await db.prepare(`DELETE FROM county_town WHERE county_code = ?1 AND name IN (?2, ?3)`)
      .bind("mombasa", ...names).run()
    delete globalThis.__townsTestDb
  }
})

await test("digital-only orders have no shipping charge while mixed carts require delivery", async () => {
  await db.prepare(`UPDATE product SET delivery_type = 'digital' WHERE id = ?1`).bind(B.product_id).run()
  try {
    const id = await cartWith([[B.variant_id, 1]], { currency: "kes" })
    let cart = await lib.getCart(db, id)
    assert.equal(cart.requiresShipping, false)
    assert.equal(cart.totals.shippingMinor, 0)
    assert.equal(cart.shippingOptionId, null)
    assert.equal(cart.totals.totalMinor, cart.totals.itemSubtotalMinor - cart.totals.discountMinor)
    await lib.setCartFields(db, id, { shippingOptionId: lib.DIGITAL_DELIVERY_ID, shippingTotalMinor: 0 })
    cart = await lib.getCart(db, id)
    assert.equal(cart.shippingOptionId, lib.DIGITAL_DELIVERY_ID)

    await lib.addLine(db, id, A.variant_id, 1, "kes")
    cart = await lib.getCart(db, id)
    assert.equal(cart.requiresShipping, true)
    assert.equal(cart.shippingOptionId, null)
    await assert.rejects(lib.recordManualMpesaSubmission(db, { cartId: id, message: "QAB111111111 confirmed payment" }), /delivery details/)
    await lib.setCartFields(db, id, { shippingOptionId: lib.STANDARD_SHIPPING_ID, shippingTotalMinor: 500 })
    cart = await lib.getCart(db, id)
    assert.equal(cart.totals.shippingMinor, 500)

    await lib.removeLine(db, id, cart.lines.find((line) => line.variantId === A.variant_id).id)
    cart = await lib.getCart(db, id)
    assert.equal(cart.totals.shippingMinor, 0)
    assert.equal(cart.shippingOptionId, null)
    await lib.setCartFields(db, id, { shippingOptionId: lib.DIGITAL_DELIVERY_ID, shippingTotalMinor: 0 })
    cart = await lib.getCart(db, id)
    const reference = `pi_${id}`
    await lib.recordPendingPayment(db, { cartId: id, provider: "mpesa", reference, amountMinor: cart.totals.totalMinor, currency: "kes" })
    await lib.settlePayment(db, { provider: "mpesa", reference, status: "captured" })
    const result = await lib.finalizePaidCart(db, { cartId: id, provider: "mpesa", reference, paidMinor: cart.totals.totalMinor, currency: "kes" })
    assert.equal(result.ok, true, JSON.stringify(result))
    const order = await one(`SELECT shipping_minor, shipping_address, shipping_method, total_minor FROM "order" WHERE id = ?1`, result.orderId)
    assert.equal(order.shipping_minor, 0)
    assert.equal(order.total_minor, cart.totals.totalMinor)
    assert.equal(JSON.parse(order.shipping_address).address_1, "1 Road")
    assert.equal(JSON.parse(order.shipping_method).name, "Digital delivery")
  } finally {
    await db.prepare(`UPDATE product SET delivery_type = 'physical' WHERE id = ?1`).bind(B.product_id).run()
  }
})

/* ------------------------------------------------------------- payments */
await test("concurrent STK starts claim the cart once and freeze its contents", async () => {
  const id = await cartWith([[A.variant_id, 1]], { currency: "kes" })
  const attempts = await Promise.all([
    lib.beginMpesaCheckout(db, id, "0712345678"),
    lib.beginMpesaCheckout(db, id, "0712345678"),
  ])
  assert.equal(attempts.filter(Boolean).length, 1)
  await assert.rejects(lib.addLine(db, id, B.variant_id, 1), /M-Pesa payment is being processed/)
  await assert.rejects(lib.setCartFields(db, id, { shippingTotalMinor: 1 }), /M-Pesa payment is being processed/)
  await lib.cancelUnsentMpesaCheckout(db, attempts.find(Boolean).id)
  await lib.addLine(db, id, B.variant_id, 1)
})
await test("STK callbacks before the initiation response create one confirmed order", async () => {
  const id = await cartWith([[A.variant_id, 1]], { currency: "kes" })
  const attempt = await lib.beginMpesaCheckout(db, id, "0712345678")
  const cart = await lib.getCart(db, id)
  const amount = Math.ceil(cart.totals.totalMinor / 100) * 100
  await lib.setMpesaCheckoutAmount(db, attempt.id, amount)
  const callback = {
    checkoutRequestId: `checkout_${id}`, merchantRequestId: "merchant",
    resultCode: 0, resultDesc: "Success", amount: amount / 100,
    phone: "254712345678", receipt: `receipt_${id}`,
  }
  assert.equal((await lib.recordMpesaCheckoutCallback(db, attempt.id, callback)).status, "confirmed")
  await lib.markMpesaCheckoutSent(db, attempt.id, callback.checkoutRequestId)
  const first = await lib.finalizeMpesaCheckout(db, attempt.id)
  assert.equal(first.ok, true)
  await lib.recordMpesaCheckoutCallback(db, attempt.id, callback)
  const replay = await lib.finalizeMpesaCheckout(db, attempt.id)
  assert.equal(replay.ok, true)
  assert.equal(first.orderId, replay.orderId)
})
await test("STK callback mismatches cannot confirm payment or unlock the cart", async () => {
  const id = await cartWith([[A.variant_id, 1]], { currency: "kes" })
  const attempt = await lib.beginMpesaCheckout(db, id, "0712345678")
  await lib.setMpesaCheckoutAmount(db, attempt.id, 10000)
  const callback = {
    checkoutRequestId: `checkout_${id}`, merchantRequestId: "merchant",
    resultCode: 0, resultDesc: "Success", amount: 99,
    phone: "254712345678", receipt: `receipt_${id}`,
  }
  assert.equal((await lib.recordMpesaCheckoutCallback(db, attempt.id, callback)).status, "review")
  await assert.rejects(lib.finalizeMpesaCheckout(db, attempt.id), /not confirmed/)
  await assert.rejects(lib.addLine(db, id, B.variant_id, 1), /M-Pesa payment is being processed/)
  assert.equal((await lib.recordMpesaCheckoutCallback(db, attempt.id, { ...callback, resultCode: 1032 })).status, "review")
})
await test("an uncertain initiation accepts a late decline without unlocking a mismatched success", async () => {
  const id = await cartWith([[A.variant_id, 1]], { currency: "kes" })
  const attempt = await lib.beginMpesaCheckout(db, id, "0712345678")
  await lib.setMpesaCheckoutAmount(db, attempt.id, 10000)
  await lib.reviewMpesaCheckout(db, attempt.id)
  const callback = {
    checkoutRequestId: `checkout_${id}`, merchantRequestId: "merchant",
    resultCode: 1032, resultDesc: "Cancelled",
  }
  assert.equal((await lib.recordMpesaCheckoutCallback(db, attempt.id, callback)).status, "failed")
  await lib.addLine(db, id, B.variant_id, 1)
})
await test("STK finalization never overwrites a conflicting existing payment", async () => {
  const id = await cartWith([[A.variant_id, 1]], { currency: "kes" })
  const attempt = await lib.beginMpesaCheckout(db, id, "0712345678")
  const amount = Math.ceil((await lib.getCart(db, id)).totals.totalMinor / 100) * 100
  await lib.setMpesaCheckoutAmount(db, attempt.id, amount)
  const checkoutId = `checkout_${id}`
  await lib.recordPendingPayment(db, { cartId: id, provider: "mpesa", reference: checkoutId, amountMinor: 100, currency: "kes" })
  await lib.recordMpesaCheckoutCallback(db, attempt.id, {
    checkoutRequestId: checkoutId, merchantRequestId: "merchant", resultCode: 0,
    resultDesc: "Success", amount: amount / 100, phone: "254712345678", receipt: `receipt_${id}`,
  })
  await assert.rejects(lib.finalizeMpesaCheckout(db, attempt.id), /does not match/)
  const payment = await one(`SELECT amount_minor, status FROM payment WHERE reference = ?1`, checkoutId)
  assert.equal(payment.amount_minor, 100)
  assert.equal(payment.status, "pending")
})
await test("admin STK callbacks arriving before the response verify their request", async () => {
  const id = lib.newId("preq")
  await db.prepare(
    `INSERT INTO payment_request (id, phone, amount_minor, reference, status)
     VALUES (?1, '254712345678', 10000, 'test', 'pending')`
  ).bind(id).run()
  const callback = {
    checkoutRequestId: `checkout_${id}`, merchantRequestId: "merchant",
    resultCode: 0, resultDesc: "Success", amount: 100,
    phone: "254712345678", receipt: `receipt_${id}`,
  }
  assert.equal(await lib.recordMpesaRequestCallback(db, id, callback), "recorded")
  assert.equal(await lib.recordMpesaRequestCallback(db, id, callback), "recorded")
  const row = await one(`SELECT status, checkout_id, receipt FROM payment_request WHERE id = ?1`, id)
  assert.deepEqual(row, { status: "paid", checkout_id: callback.checkoutRequestId, receipt: callback.receipt })
})
await test("admin STK mismatches remain reviewable even after a late decline", async () => {
  const id = lib.newId("preq")
  await db.prepare(
    `INSERT INTO payment_request (id, phone, amount_minor, reference, status)
     VALUES (?1, '254712345678', 10000, 'test', 'pending')`
  ).bind(id).run()
  const callback = {
    checkoutRequestId: `checkout_${id}`, merchantRequestId: "merchant",
    resultCode: 0, resultDesc: "Success", amount: 99,
    phone: "254712345678", receipt: `receipt_${id}`,
  }
  assert.equal(await lib.recordMpesaRequestCallback(db, id, callback), "review")
  assert.equal(await lib.recordMpesaRequestCallback(db, id, { ...callback, resultCode: 1032 }), "review")
  const row = await one(`SELECT status, mpesa_review FROM payment_request WHERE id = ?1`, id)
  assert.deepEqual(row, { status: "pending", mpesa_review: 1 })
  assert.equal(await lib.recordMpesaRequestCallback(db, id, { ...callback, amount: 100 }), "recorded")
  assert.equal((await one(`SELECT status FROM payment_request WHERE id = ?1`, id)).status, "paid")
})

await test("a pending payment can be recorded, and re-recorded, without SQL errors", async () => {
  const id = await cartWith([[A.variant_id, 1]])
  const input = { cartId: id, provider: "mpesa", reference: `pi_${id}`, amountMinor: 100, currency: "usd" }
  await lib.recordPendingPayment(db, input)
  await lib.recordPendingPayment(db, { ...input, amountMinor: 250 })
  const rows = await db.prepare(`SELECT amount_minor FROM payment WHERE reference = ?1`).bind(input.reference).all()
  assert.equal(rows.results.length, 1)
  assert.equal(rows.results[0].amount_minor, 250)
})
await test("another cart cannot take over a recorded payment", async () => {
  const mine = await cartWith([[A.variant_id, 1]])
  const other = await cartWith([[A.variant_id, 1]])
  await lib.recordPendingPayment(db, { cartId: mine, provider: "mpesa", reference: `pi_x_${mine}`, amountMinor: 100, currency: "usd" })
  await lib.recordPendingPayment(db, { cartId: other, provider: "mpesa", reference: `pi_x_${mine}`, amountMinor: 1, currency: "usd" })
  const row = await one(`SELECT cart_id, amount_minor FROM payment WHERE reference = ?1`, `pi_x_${mine}`)
  assert.equal(row.cart_id, mine)
  assert.equal(row.amount_minor, 100)
})
await test("manual M-Pesa messages stay pending and cannot create an order before verification", async () => {
  const id = await cartWith([[A.variant_id, 1]], { currency: "kes" })
  const input = { cartId: id, message: "QAB123456789 confirmed KES payment" }
  const [first, replay] = await Promise.all([
    lib.recordManualMpesaSubmission(db, input),
    lib.recordManualMpesaSubmission(db, input),
  ])
  assert.equal(first.alreadyPending || replay.alreadyPending, true)
  const submission = first.alreadyPending ? replay : first
  const cart = await lib.getCart(db, id)
  assert.equal(submission.amountMinor, Math.ceil(cart.totals.totalMinor / 100) * 100)
  const row = await one(`SELECT status, amount_minor, currency_code, raw FROM payment WHERE reference = ?1`, submission.reference)
  assert.equal(row.status, "pending")
  assert.equal(row.amount_minor, submission.amountMinor)
  assert.equal(row.currency_code, "kes")
  assert.equal(JSON.parse(row.raw).message, input.message)
  const result = await lib.finalizePaidCart(db, {
    cartId: id,
    provider: "manual",
    reference: submission.reference,
    paidMinor: submission.amountMinor,
    currency: submission.currency,
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, "payment_not_for_cart")
  assert.equal(await one(`SELECT completed_order_id AS id FROM cart WHERE id = ?1`, id).then((row) => row.id), null)
})
await test("a rejected manual M-Pesa message can be replaced without overwriting its history", async () => {
  const id = await cartWith([[A.variant_id, 1]], { currency: "kes" })
  const first = await lib.recordManualMpesaSubmission(db, { cartId: id, message: "QAB111111111 first payment" })
  await db.prepare(`UPDATE payment SET status = 'failed' WHERE reference = ?1`).bind(first.reference).run()
  const retry = await lib.recordManualMpesaSubmission(db, { cartId: id, message: "QAB222222222 replacement payment" })
  assert.notEqual(retry.reference, first.reference)
  assert.equal((await one(`SELECT status FROM payment WHERE reference = ?1`, first.reference)).status, "failed")
  assert.equal((await one(`SELECT status FROM payment WHERE reference = ?1`, retry.reference)).status, "pending")
})
await test("a manually verified M-Pesa payment creates one order and requires the rounded cart amount", async () => {
  const id = await cartWith([[B.variant_id, 1]], { currency: "kes" })
  const submission = await lib.recordManualMpesaSubmission(db, {
    cartId: id,
    message: "QAB987654321 confirmed KES payment",
  })
  await db
    .prepare(`UPDATE payment SET status = 'captured' WHERE reference = ?1 AND status = 'pending'`)
    .bind(submission.reference)
    .run()
  await lib.addLine(db, id, A.variant_id, 1, "kes")
  const mismatch = await lib.finalizePaidCart(db, {
    cartId: id,
    provider: "manual",
    reference: submission.reference,
    paidMinor: submission.amountMinor,
    currency: submission.currency,
  })
  assert.equal(mismatch.ok, false)
  assert.equal(mismatch.reason, "amount_mismatch")
  await lib.removeLine(db, id, (await lib.getCart(db, id)).lines.find((line) => line.variantId === A.variant_id).id)
  const verified = await lib.finalizePaidCart(db, {
    cartId: id,
    provider: "manual",
    reference: submission.reference,
    paidMinor: submission.amountMinor,
    currency: submission.currency,
  })
  assert.equal(verified.ok, true, JSON.stringify(verified))
  assert.equal((await one(`SELECT payment_status FROM "order" WHERE id = ?1`, verified.orderId)).payment_status, "captured")
  const replay = await lib.finalizePaidCart(db, {
    cartId: id,
    provider: "manual",
    reference: submission.reference,
    paidMinor: submission.amountMinor,
    currency: submission.currency,
  })
  assert.equal(replay.ok, true)
  assert.equal(replay.orderId, verified.orderId)
})

async function paidCart(lines) {
  const id = await cartWith(lines)
  const cart = await lib.getCart(db, id)
  const reference = `pi_${id}`
  await lib.recordPendingPayment(db, { cartId: id, provider: "mpesa", reference, amountMinor: cart.totals.totalMinor, currency: "usd" })
  await lib.settlePayment(db, { provider: "mpesa", reference, status: "captured" })
  return { id, reference, total: cart.totals.totalMinor }
}

await test("ATTACK: paying for a small cart, then adding books, does not buy the bigger cart", async () => {
  const { id, reference, total } = await paidCart([[A.variant_id, 1]])
  await lib.addLine(db, id, B.variant_id, 5)
  const result = await lib.finalizePaidCart(db, { cartId: id, provider: "mpesa", reference, paidMinor: total, currency: "usd" })
  assert.equal(result.ok, false)
  assert.equal(result.reason, "amount_mismatch")
  assert.equal(await one(`SELECT completed_order_id AS c FROM cart WHERE id = ?1`, id).then((r) => r.c), null)
})
await test("ATTACK: paying in a cheaper currency is refused", async () => {
  const { id, reference, total } = await paidCart([[A.variant_id, 1]])
  const result = await lib.finalizePaidCart(db, { cartId: id, provider: "mpesa", reference, paidMinor: total, currency: "kes" })
  assert.equal(result.reason, "amount_mismatch")
})
await test("ATTACK: a payment made for one cart cannot complete another", async () => {
  const first = await paidCart([[A.variant_id, 1]])
  const second = await cartWith([[A.variant_id, 1]])
  const result = await lib.finalizePaidCart(db, {
    cartId: second,
    provider: "mpesa",
    reference: first.reference,
    paidMinor: first.total,
    currency: "usd",
  })
  assert.equal(result.reason, "payment_not_for_cart")
})

await test("a fully paid cart becomes exactly one order, with stock and payment attached", async () => {
  const before = await stock(A.variant_id)
  const { id, reference, total } = await paidCart([[A.variant_id, 2]])
  const result = await lib.finalizePaidCart(db, { cartId: id, provider: "mpesa", reference, paidMinor: total, currency: "usd" })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.ok(result.displayId >= 1000)
  const order = await one(`SELECT total_minor, payment_status, shipping_method FROM "order" WHERE id = ?1`, result.orderId)
  assert.equal(order.total_minor, total)
  assert.equal(order.payment_status, "captured")
  assert.equal(JSON.parse(order.shipping_method).name, "Standard delivery")
  const payments = await db.prepare(`SELECT order_id, status FROM payment WHERE reference = ?1`).bind(reference).all()
  assert.equal(payments.results.length, 1, "pending row reused, not duplicated")
  assert.equal(payments.results[0].order_id, result.orderId)
  assert.equal(await stock(A.variant_id), before - 2)

  // The webhook and the shopper's browser both finishing: one order.
  const again = await lib.finalizePaidCart(db, { cartId: id, provider: "mpesa", reference, paidMinor: total, currency: "usd" })
  assert.equal(again.ok, true)
  assert.equal(again.orderId, result.orderId)
  assert.equal(again.replayed, true)
  assert.equal((await one(`SELECT COUNT(*) AS n FROM "order" WHERE id = ?1`, result.orderId)).n, 1)
  assert.equal(await stock(A.variant_id), before - 2, "stock not taken twice")
})
await test("a paid order is still placed when its last copy sold meanwhile (oversell, never lose money)", async () => {
  const { id, reference, total } = await paidCart([[A.variant_id, 1]])
  const saved = await db.prepare(`SELECT location_id, stocked_quantity FROM inventory_level WHERE variant_id = ?1`).bind(A.variant_id).all()
  await db.prepare(`UPDATE inventory_level SET stocked_quantity = reserved_quantity WHERE variant_id = ?1`).bind(A.variant_id).run()
  const result = await lib.finalizePaidCart(db, { cartId: id, provider: "mpesa", reference, paidMinor: total, currency: "usd" })
  assert.equal(result.ok, true, JSON.stringify(result))
  for (const row of saved.results) {
    await db.prepare(`UPDATE inventory_level SET stocked_quantity = ?3 WHERE variant_id = ?1 AND location_id = ?2`).bind(A.variant_id, row.location_id, row.stocked_quantity).run()
  }
})
await test("a refused order frees its key, so the shopper can fix the cart and retry", async () => {
  const id = await cartWith([[A.variant_id, 1]])
  const saved = await db.prepare(`SELECT location_id, stocked_quantity FROM inventory_level WHERE variant_id = ?1`).bind(A.variant_id).all()
  await db.prepare(`UPDATE inventory_level SET stocked_quantity = reserved_quantity WHERE variant_id = ?1`).bind(A.variant_id).run()
  const input = { cartId: id, idempotencyKey: lib.orderKeyForCart(id), email: "x@y.z", payment: { provider: "manual" } }
  const refused = await lib.placeOrder(db, input)
  assert.equal(refused.reason, "out_of_stock")
  for (const row of saved.results) {
    await db.prepare(`UPDATE inventory_level SET stocked_quantity = ?3 WHERE variant_id = ?1 AND location_id = ?2`).bind(A.variant_id, row.location_id, row.stocked_quantity).run()
  }
  const retried = await lib.placeOrder(db, input)
  assert.equal(retried.ok, true, JSON.stringify(retried))
})
await test("orders placed at the same moment get distinct order numbers", async () => {
  const carts = await Promise.all(Array.from({ length: 12 }, () => cartWith([[B.variant_id, 1]])))
  const results = await Promise.all(
    carts.map((id) => lib.placeOrder(db, { cartId: id, idempotencyKey: lib.orderKeyForCart(id), email: "x@y.z", payment: { provider: "manual" } }))
  )
  for (const r of results) assert.equal(r.ok, true, JSON.stringify(r))
  const numbers = results.map((r) => r.displayId)
  assert.equal(new Set(numbers).size, numbers.length, `duplicate order numbers: ${numbers}`)
})
await test("a double submit of the same checkout places one order", async () => {
  const id = await cartWith([[B.variant_id, 1]])
  const input = { cartId: id, idempotencyKey: lib.orderKeyForCart(id), email: "x@y.z", payment: { provider: "manual" } }
  const [a, b] = await Promise.all([lib.placeOrder(db, input), lib.placeOrder(db, input)])
  const ok = [a, b].filter((r) => r.ok)
  assert.ok(ok.length >= 1)
  assert.equal(new Set(ok.map((r) => r.orderId)).size, 1)
  assert.equal((await one(`SELECT COUNT(*) AS n FROM "order" WHERE id IN (SELECT completed_order_id FROM cart WHERE id = ?1)`, id)).n, 1)
})
await test("a late 'failed' event cannot undo a captured payment", async () => {
  const { reference } = await paidCart([[A.variant_id, 1]])
  await lib.settlePayment(db, { provider: "mpesa", reference, status: "failed" })
  assert.equal((await one(`SELECT status FROM payment WHERE reference = ?1`, reference)).status, "captured")
})
await test("an M-Pesa callback keeps the request id as the reference (replays still match)", async () => {
  const id = await cartWith([[A.variant_id, 1]])
  await lib.recordPendingPayment(db, { cartId: id, provider: "mpesa", reference: `ws_${id}`, amountMinor: 100, currency: "kes" })
  await lib.settlePayment(db, { provider: "mpesa", reference: `ws_${id}`, status: "captured", raw: { receipt: "QAB123" } })
  const again = await lib.settlePayment(db, { provider: "mpesa", reference: `ws_${id}`, status: "captured" })
  assert.equal(again.cartId, id)
})

/* ------------------------------------------------------------- accounts */
await test("ATTACK: one customer cannot overwrite another customer's address", async () => {
  const a = await lib.createCustomer(db, { email: `a_${Date.now()}@x.com`, password: "password-a" })
  const b = await lib.createCustomer(db, { email: `b_${Date.now()}@x.com`, password: "password-b" })
  const addr = await lib.saveAddress(db, a.customerId, { address1: "A's house", city: "Nairobi", countryCode: "ke" })
  await assert.rejects(lib.saveAddress(db, b.customerId, { id: addr, address1: "Attacker's drop", city: "X" }))
  assert.equal((await one(`SELECT address_1 FROM customer_address WHERE id = ?1`, addr)).address_1, "A's house")
})
await test("passwords verify, wrong ones do not, and a missing account costs the same work", async () => {
  const hash = await lib.hashPassword("correct horse")
  assert.equal(await lib.verifyPassword("correct horse", hash), true)
  assert.equal(await lib.verifyPassword("wrong", hash), false)
  const t0 = performance.now()
  await lib.verifyPassword("x", hash)
  const real = performance.now() - t0
  const t1 = performance.now()
  assert.equal(await lib.verifyPassword("x", null), false)
  const missing = performance.now() - t1
  assert.ok(missing > real * 0.5, `missing account answered in ${missing.toFixed(0)}ms vs ${real.toFixed(0)}ms`)
})
await test("a tampered hash with absurd iterations is refused, not run", async () => {
  const t = performance.now()
  assert.equal(await lib.verifyPassword("x", `pbkdf2$999999999$${"00".repeat(16)}$${"00".repeat(32)}`), false)
  assert.ok(performance.now() - t < 1000)
})

/* ------------------------------------------------------------- catalogue */
await test("drafts and scheduled books are not served by URL", async () => {
  await db.prepare(`UPDATE product SET status = 'draft' WHERE id = ?1`).bind(B.product_id).run()
  assert.equal(await lib.getBook(db, B.handle), null)
  await db.prepare(`UPDATE product SET status = 'published', publish_at = '2999-01-01T00:00:00Z' WHERE id = ?1`).bind(B.product_id).run()
  assert.equal(await lib.getBook(db, B.handle), null)
  await db.prepare(`UPDATE product SET publish_at = NULL WHERE id = ?1`).bind(B.product_id).run()
  assert.ok(await lib.getBook(db, B.handle))
})
await test("hostile listing input cannot break the query", async () => {
  for (const options of [
    { limit: Number.NaN, offset: Number.NaN },
    { limit: 1e9, offset: -5 },
    { q: `"""` },
    { q: `" OR 1=1 --` },
    { q: "NEAR( ) * ^ :" },
    { priceMin: Number.NaN, priceMax: Number.NaN },
    { category: ["x') OR 1=1 --"] },
  ]) {
    const { books } = await lib.listBooks(db, options)
    assert.ok(Array.isArray(books), JSON.stringify(options))
  }
})

/* ------------------------------------------------------------- throttling */
await test("the rate limiter counts per key and blocks past the limit", async () => {
  const key = `t_${Date.now()}`
  const hits = []
  for (let i = 0; i < 6; i++) hits.push((await lib.hitRateLimit(db, key, 5, 600)).allowed)
  assert.deepEqual(hits, [true, true, true, true, true, false])
  assert.equal((await lib.hitRateLimit(db, `${key}_other`, 5, 600)).allowed, true)
})

await proxy.dispose()
console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`)
