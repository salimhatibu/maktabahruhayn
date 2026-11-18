import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { DatabaseSync } from "node:sqlite"
import test from "node:test"

const require = createRequire(new URL("../package.json", import.meta.url))
const ts = require("typescript")
const source = await readFile(new URL("../src/lib/abandoned-carts.ts", import.meta.url), "utf8")
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { listAbandonedCarts } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`)

function fixture() {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec(`
    CREATE TABLE cart (id TEXT, customer_id TEXT, email TEXT, shipping_address TEXT, created_at TEXT, updated_at TEXT, completed_order_id TEXT);
    CREATE TABLE customer (id TEXT, email TEXT, first_name TEXT, last_name TEXT, phone TEXT);
    CREATE TABLE cart_item (cart_id TEXT);
    CREATE TABLE payment (cart_id TEXT, provider TEXT, status TEXT, created_at TEXT);
    CREATE TABLE mpesa_checkout (cart_id TEXT, status TEXT, created_at TEXT);
    CREATE TABLE cart_reminder (cart_id TEXT, status TEXT, error TEXT);
    INSERT INTO customer VALUES ('customer', 'customer@example.com', 'Known', 'Shopper', '123');
    INSERT INTO cart VALUES
      ('secret-old', NULL, 'guest@example.com', '{"first_name":"Guest","phone":"456"}', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', NULL),
      ('secret-new', 'customer', NULL, NULL, '2026-01-02T00:00:00.000Z', '2026-01-03T18:00:00.000Z', NULL),
      ('secret-done', NULL, NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'order'),
      ('secret-empty', NULL, NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL);
    INSERT INTO cart_item VALUES ('secret-old'), ('secret-new'), ('secret-done');
    INSERT INTO payment VALUES ('secret-old', 'stripe', 'failed', '2026-01-02T01:00:00.000Z');
    INSERT INTO mpesa_checkout VALUES ('secret-old', 'review', '2026-01-02T02:00:00.000Z');
    INSERT INTO cart_reminder VALUES ('secret-old', 'failed', 'Email provider returned 503.');
  `)
  const database = {
    prepare(sql) {
      return { bind(...args) {
        const values = []
        const positional = sql.replace(/\?(\d+)/g, (_match, index) => {
          values.push(args[Number(index) - 1])
          return "?"
        })
        return { async all() { return { results: sqlite.prepare(positional).all(...values) } } }
      } }
    },
  }
  const getCart = async (_db, id) => ({
    completedOrderId: id === "secret-done" ? "order" : null,
    currency: "kes",
    lines: [{ productTitle: "Book", variantTitle: "Hardcover", quantity: 2, unitPriceMinor: 12500 }],
    totals: { itemSubtotalMinor: 25000, discountMinor: 1000, shippingMinor: 500, totalMinor: 24500 },
  })
  return { sqlite, database, getCart }
}

const now = new Date("2026-01-04T00:00:00.000Z")

test("inactive carts include guest contact and current items without bearer IDs", async () => {
  const { sqlite, database, getCart } = fixture()
  try {
    const result = await listAbandonedCarts(database, getCart, { view: "inactive", search: "", page: 0, now })
    assert.equal(result.carts.length, 1)
    const cart = result.carts[0]
    assert.equal(cart.customer_type, "anonymous")
    assert.equal(cart.name, "Guest")
    assert.equal(cart.email, "guest@example.com")
    assert.equal(cart.phone, "456")
    assert.deepEqual(cart.payment, { provider: "mpesa", status: "review" })
    assert.deepEqual(cart.reminder, { status: "failed", error: "Email provider returned 503." })
    assert.equal(cart.total, 245)
    assert.equal(cart.items[0].quantity, 2)
    assert.equal(JSON.stringify(result).includes("secret-"), false)
  } finally { sqlite.close() }
})

test("all incomplete view and search distinguish linked customers and exclude completed and empty carts", async () => {
  const { sqlite, database, getCart } = fixture()
  try {
    const options = { view: "all", search: "", page: 0, now }
    const all = await listAbandonedCarts(database, getCart, options)
    assert.equal(all.carts.length, 2)
    assert.equal(all.carts[0].customer_type, "linked")
    assert.equal(all.carts[0].email, "customer@example.com")
    assert.equal(all.carts[0].payment, null)
    const found = await listAbandonedCarts(database, getCart, { ...options, search: "456" })
    assert.equal(found.carts.length, 1)
    assert.equal(found.carts[0].name, "Guest")
  } finally { sqlite.close() }
})

test("pagination covers matching carts without exposing their IDs", async () => {
  const { sqlite, database, getCart } = fixture()
  try {
    const insertCart = sqlite.prepare("INSERT INTO cart VALUES (?, NULL, NULL, NULL, ?, ?, NULL)")
    const insertItem = sqlite.prepare("INSERT INTO cart_item VALUES (?)")
    for (let i = 0; i < 25; i++) {
      const id = `secret-extra-${i}`
      insertCart.run(id, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z")
      insertItem.run(id)
    }
    const options = { view: "all", search: "", page: 0, now }
    const first = await listAbandonedCarts(database, getCart, options)
    const second = await listAbandonedCarts(database, getCart, { ...options, page: 1 })
    assert.equal(first.carts.length, 25)
    assert.equal(first.has_more, true)
    assert.equal(second.carts.length, 2)
    assert.equal(second.has_more, false)
    assert.equal(JSON.stringify([first, second]).includes("secret-"), false)
  } finally { sqlite.close() }
})

test("the 24-hour boundary is inclusive and stale carts completed during loading are omitted", async () => {
  const { sqlite, database, getCart } = fixture()
  try {
    sqlite.prepare("UPDATE cart SET updated_at = ? WHERE id = ?").run("2026-01-03T00:00:00.000Z", "secret-old")
    sqlite.prepare("UPDATE cart SET updated_at = ? WHERE id = ?").run("2026-01-03T00:00:00.001Z", "secret-new")
    const options = { view: "inactive", search: "", page: 0, now }
    const atBoundary = await listAbandonedCarts(database, getCart, options)
    assert.equal(atBoundary.carts.length, 1)
    const completed = await listAbandonedCarts(database, async (...args) => ({
      ...await getCart(...args), completedOrderId: "order",
    }), options)
    assert.equal(completed.carts.length, 0)
  } finally { sqlite.close() }
})
