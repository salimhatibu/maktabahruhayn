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
await test("a published, priced edition goes in the cart at its price", async () => {
  const id = await cartWith([[A.variant_id, 2]])
  const cart = await lib.getCart(db, id)
  assert.equal(cart.lines.length, 1)
  assert.ok(cart.lines[0].unitPriceMinor > 0)
  assert.equal(cart.lines[0].quantity, 2)
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

/* ------------------------------------------------------------- payments */
await test("a pending payment can be recorded, and re-recorded, without SQL errors", async () => {
  const id = await cartWith([[A.variant_id, 1]])
  const input = { cartId: id, provider: "stripe", reference: `pi_${id}`, amountMinor: 100, currency: "usd" }
  await lib.recordPendingPayment(db, input)
  await lib.recordPendingPayment(db, { ...input, amountMinor: 250 })
  const rows = await db.prepare(`SELECT amount_minor FROM payment WHERE reference = ?1`).bind(input.reference).all()
  assert.equal(rows.results.length, 1)
  assert.equal(rows.results[0].amount_minor, 250)
})
await test("another cart cannot take over a recorded payment", async () => {
  const mine = await cartWith([[A.variant_id, 1]])
  const other = await cartWith([[A.variant_id, 1]])
  await lib.recordPendingPayment(db, { cartId: mine, provider: "stripe", reference: `pi_x_${mine}`, amountMinor: 100, currency: "usd" })
  await lib.recordPendingPayment(db, { cartId: other, provider: "stripe", reference: `pi_x_${mine}`, amountMinor: 1, currency: "usd" })
  const row = await one(`SELECT cart_id, amount_minor FROM payment WHERE reference = ?1`, `pi_x_${mine}`)
  assert.equal(row.cart_id, mine)
  assert.equal(row.amount_minor, 100)
})

async function paidCart(lines) {
  const id = await cartWith(lines)
  const cart = await lib.getCart(db, id)
  const reference = `pi_${id}`
  await lib.recordPendingPayment(db, { cartId: id, provider: "stripe", reference, amountMinor: cart.totals.totalMinor, currency: "usd" })
  await lib.settlePayment(db, { provider: "stripe", reference, status: "captured" })
  return { id, reference, total: cart.totals.totalMinor }
}

await test("ATTACK: paying for a small cart, then adding books, does not buy the bigger cart", async () => {
  const { id, reference, total } = await paidCart([[A.variant_id, 1]])
  await lib.addLine(db, id, B.variant_id, 5)
  const result = await lib.finalizePaidCart(db, { cartId: id, provider: "stripe", reference, paidMinor: total, currency: "usd" })
  assert.equal(result.ok, false)
  assert.equal(result.reason, "amount_mismatch")
  assert.equal(await one(`SELECT completed_order_id AS c FROM cart WHERE id = ?1`, id).then((r) => r.c), null)
})
await test("ATTACK: paying in a cheaper currency is refused", async () => {
  const { id, reference, total } = await paidCart([[A.variant_id, 1]])
  const result = await lib.finalizePaidCart(db, { cartId: id, provider: "stripe", reference, paidMinor: total, currency: "kes" })
  assert.equal(result.reason, "amount_mismatch")
})
await test("ATTACK: a payment made for one cart cannot complete another", async () => {
  const first = await paidCart([[A.variant_id, 1]])
  const second = await cartWith([[A.variant_id, 1]])
  const result = await lib.finalizePaidCart(db, {
    cartId: second,
    provider: "stripe",
    reference: first.reference,
    paidMinor: first.total,
    currency: "usd",
  })
  assert.equal(result.reason, "payment_not_for_cart")
})

await test("a fully paid cart becomes exactly one order, with stock and payment attached", async () => {
  const before = await stock(A.variant_id)
  const { id, reference, total } = await paidCart([[A.variant_id, 2]])
  const result = await lib.finalizePaidCart(db, { cartId: id, provider: "stripe", reference, paidMinor: total, currency: "usd" })
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
  const again = await lib.finalizePaidCart(db, { cartId: id, provider: "stripe", reference, paidMinor: total, currency: "usd" })
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
  const result = await lib.finalizePaidCart(db, { cartId: id, provider: "stripe", reference, paidMinor: total, currency: "usd" })
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
  await lib.settlePayment(db, { provider: "stripe", reference, status: "failed" })
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
