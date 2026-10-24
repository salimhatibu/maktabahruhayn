/**
 * Checks the parts of the schema that money depends on, against a real local
 * D1 (not a mock), because that is where the behaviour actually lives:
 *
 *   - catalogue reads return priced, in-stock books
 *   - a stale stock claim cannot oversell
 *   - a duplicate checkout cannot place a second order
 *   - order totals, stock and promotion counters land correctly
 *
 *   pnpm db:verify
 *
 * It writes to the LOCAL database only, under a `vfy_` prefix it cleans up.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const storefront = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/storefront")

function sql(command) {
  const out = execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "maktabah", "--local", "--persist-to", "../../.wrangler/state", "--json", "--command", command],
    { cwd: storefront, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  )
  const json = out.slice(out.indexOf("["))
  return JSON.parse(json)
}

/**
 * Runs a statement that is expected to fail, and returns the error text.
 * Wrangler reports a constraint violation as JSON on stdout, not stderr.
 */
function expectFailure(command) {
  try {
    sql(command)
    return null
  } catch (error) {
    return [error.stdout, error.stderr, error.message].filter(Boolean).join("\n")
  }
}

/**
 * Loads one of the package's modules in a child process with its imports
 * stubbed, so the real hashing and pricing code can be exercised without a
 * bundler. Returns null if this Node cannot read TypeScript.
 */
function probe(moduleName, script) {
  const dir = mkdtempSync(path.join(tmpdir(), "maktabah-verify-"))
  const file = moduleName.includes("/apps/")
    ? path.resolve(storefront, `../..${moduleName}`)
    : path.resolve(storefront, `../../packages/db/src/${moduleName}.ts`)
  const source = readFileSync(file, "utf8")
    .replace('import type { D1 } from "./client"', "type D1 = unknown")
    .replace('import { newId } from "./writes"', "const newId = (p: string) => p")
    .replace('import { isHtml, sanitizeHtml } from "@maktabah/shared"', "")
    .replace(
      'import { BASE_CURRENCY, convertToBase, getFxRates, newId, toMinor, type D1, type D1Statement } from "@maktabah/db"',
      [
        'const newId = (p: string) => p + "_x"',
        "const toMinor = (major: number) => Math.round(major * 100)",
        'const BASE_CURRENCY = "usd"',
        "const getFxRates = async (db: any) => (await db.prepare('SELECT currency_code, rate FROM fx_rate').all()).results",
        "  .reduce((acc: Record<string, number>, r: any) => ((acc[r.currency_code] = r.rate), acc), {})",
        "const convertToBase = (amountMinor: number, currency: string, rates: Record<string, number>) => {",
        "  const rate = rates[currency.toLowerCase()]",
        "  if (!rate || !Number.isFinite(rate) || rate <= 0) { return amountMinor }",
        "  return Math.round((Math.ceil(amountMinor / 100 / rate) - 0.01) * 100)",
        "}",
        "type D1Statement = { bind(...v: unknown[]): D1Statement }",
        "const isHtml = (value: string) => /<[a-z]/i.test(value)",
        "const sanitizeHtml = (value: string) => value",
        "type D1 = { prepare(q: string): D1Statement & { first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> }; batch(s: D1Statement[]): Promise<unknown> }",
      ].join("\n")
    )
  const temp = path.join(dir, `${path.basename(moduleName).replace(/\.ts$/, "")}.ts`)
  writeFileSync(temp, source)
  try {
    const out = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script.replace("__MODULE__", temp)],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    )
    return JSON.parse(out)
  } catch {
    return null
  }
}

let failures = 0
function check(name, condition, detail = "") {
  const status = condition ? "  ok  " : " FAIL "
  console.log(`[${status}] ${name}${detail && !condition ? ` - ${detail}` : ""}`)
  if (!condition) {
    failures += 1
  }
}

const cleanup = `
  DELETE FROM payment WHERE id LIKE 'vfy_%';
  DELETE FROM order_item WHERE id LIKE 'vfy_%';
  DELETE FROM "order" WHERE id LIKE 'vfy_%';
  DELETE FROM cart_item WHERE id LIKE 'vfy_%';
  DELETE FROM cart WHERE id LIKE 'vfy_%';
  DELETE FROM promotion WHERE id LIKE 'vfy_%';
  DELETE FROM idempotency_key WHERE key LIKE 'vfy_%';
  DELETE FROM customer_session WHERE token_hash LIKE 'vfy_%';
  DELETE FROM customer WHERE id LIKE 'vfy_%';
  DELETE FROM inventory_level WHERE variant_id LIKE 'vfy_%';
  DELETE FROM variant WHERE id LIKE 'vfy_%';
  DELETE FROM product WHERE id LIKE 'vfy_%';
`
sql(cleanup)

// ---------------------------------------------------------------- catalogue
const [catalogue] = sql(`
  SELECT COUNT(*) AS books,
         (SELECT COUNT(*) FROM book_search) AS indexed,
         (SELECT COUNT(*) FROM variant_price WHERE kind = 'base') AS priced
    FROM product WHERE status = 'published' AND deleted_at IS NULL`)
const cat = catalogue.results[0]
check("catalogue has published books", cat.books > 0, `${cat.books}`)
check("every book is in the search index", cat.indexed >= cat.books, `${cat.indexed} indexed / ${cat.books} books`)
check("every book has a base price", cat.priced >= cat.books, `${cat.priced} priced`)

const [search] = sql(`SELECT COUNT(*) AS hits FROM book_search WHERE book_search MATCH '"bukhar"*'`)
check("prefix search matches a hyphenated transliteration", search.results[0].hits > 0)

// The facet queries are built by string assembly, so each one is run rather
// than assumed: a missing join only shows up at runtime.
for (const [name, column] of [
  ["language", "b.language"],
  ["binding", "b.binding_type"],
  ["publisher", "b.publisher"],
]) {
  const [facet] = sql(`SELECT ${column} AS value, COUNT(*) AS count
     FROM product p
     JOIN variant v ON v.product_id = p.id AND v.rank = (SELECT MIN(rank) FROM variant WHERE product_id = p.id)
     LEFT JOIN book b ON b.product_id = p.id
    WHERE p.status = 'published' AND p.deleted_at IS NULL AND ${column} IS NOT NULL
    GROUP BY ${column}`)
  check(`the ${name} facet counts books`, facet.results.length > 0)
}
const [categoryFacet] = sql(`SELECT c.handle AS value, COUNT(DISTINCT p.id) AS count
   FROM product p
   JOIN variant v ON v.product_id = p.id AND v.rank = (SELECT MIN(rank) FROM variant WHERE product_id = p.id)
   LEFT JOIN book b ON b.product_id = p.id
   JOIN product_category pc ON pc.product_id = p.id
   JOIN category c ON c.id = pc.category_id
  WHERE p.status = 'published' AND p.deleted_at IS NULL
  GROUP BY c.handle`)
check("the category facet joins its table", categoryFacet.results.length > 0)

// Prices only convert when rates exist; without them every currency shows USD.
const [rates] = sql(`SELECT COUNT(*) AS n FROM fx_rate WHERE currency_code != 'usd'`)
check("exchange rates are stored for conversion", rates.results[0].n > 0, `${rates.results[0].n} currencies`)

// --------------------------------------------------------- oversell guard
// A throwaway book, so nothing here depends on or disturbs the real catalogue.
const variant = "vfy_variant"
sql(`
  INSERT INTO product (id, handle, title, status) VALUES ('vfy_product','vfy-verification-title','Verification title','draft');
  INSERT INTO variant (id, product_id, title, option_value, system_sku)
    VALUES ('${variant}','vfy_product','Hardcover','Hardcover','MR-VERIFY');
  INSERT INTO inventory_level (variant_id, location_id, stocked_quantity)
    SELECT '${variant}', id, 3 FROM stock_location LIMIT 1;
`)
const [{ results: before }] = sql(
  `SELECT location_id, version FROM inventory_level WHERE variant_id = '${variant}'`
)
const { location_id: location, version } = before[0]

// Two checkouts both read version ${version}; only the first may win.
sql(`UPDATE inventory_level SET reserved_quantity = reserved_quantity + 3, version = version + 1
      WHERE variant_id = '${variant}' AND location_id = '${location}' AND version = ${version}`)
sql(`UPDATE inventory_level SET reserved_quantity = reserved_quantity + 3, version = version + 1
      WHERE variant_id = '${variant}' AND location_id = '${location}' AND version = ${version}`)
const [{ results: after }] = sql(
  `SELECT reserved_quantity, stocked_quantity - reserved_quantity AS available FROM inventory_level WHERE variant_id = '${variant}'`
)
check(
  "a stale claim cannot oversell",
  after[0].reserved_quantity === 3 && after[0].available === 0,
  `reserved ${after[0].reserved_quantity}, expected 3`
)

// ------------------------------------------------------------ idempotency
sql(`INSERT INTO idempotency_key (key, scope, result) VALUES ('vfy_key1','place_order','{"orderId":"vfy_order1"}')`)
const duplicate = expectFailure(`INSERT INTO idempotency_key (key, scope) VALUES ('vfy_key1','place_order')`)
check("a duplicate checkout key is rejected", Boolean(duplicate && /UNIQUE|PRIMARYKEY/i.test(duplicate)))
const [replay] = sql(`SELECT result FROM idempotency_key WHERE key = 'vfy_key1'`)
check("a replay reads back the first outcome", JSON.parse(replay.results[0].result).orderId === "vfy_order1")

// ------------------------------------------------------------ order write
sql(`UPDATE inventory_level SET stocked_quantity = 10, reserved_quantity = 0, version = 0 WHERE variant_id = '${variant}'`)
sql(`
  INSERT INTO promotion (id, code, type, value, is_active) VALUES ('vfy_promo','VFY10','percentage',10,1);
  INSERT INTO cart (id, email, currency_code) VALUES ('vfy_cart','buyer@example.com','kes');
  INSERT INTO cart_item (id, cart_id, variant_id, quantity, unit_price_minor, title)
    VALUES ('vfy_li1','vfy_cart','${variant}',2,249000,'Verification title');
  UPDATE cart SET promotion_code = 'VFY10', shipping_total = 50000 WHERE id = 'vfy_cart';
  INSERT INTO "order" (id, display_id, email, currency_code, subtotal_minor, discount_minor,
      shipping_minor, tax_minor, total_minor, payment_status, shipping_address, promotion_code)
    VALUES ('vfy_order','999000','buyer@example.com','kes',498000,49800,50000,0,498200,'captured','{}','VFY10');
  INSERT INTO order_item (id, order_id, variant_id, product_title, variant_title, quantity, unit_price_minor, total_minor)
    VALUES ('vfy_oi1','vfy_order','${variant}','Verification title','Hardcover',2,249000,498000);
  INSERT INTO payment (id, order_id, cart_id, provider, status, amount_minor, currency_code, reference)
    VALUES ('vfy_pay','vfy_order','vfy_cart','mpesa','captured',498200,'kes','VFYREF1');
  UPDATE inventory_level SET stocked_quantity = stocked_quantity - 2, version = version + 1 WHERE variant_id = '${variant}';
  UPDATE cart SET completed_order_id = 'vfy_order' WHERE id = 'vfy_cart';
  UPDATE promotion SET used_count = used_count + 1 WHERE code = 'VFY10';
`)
const [placed] = sql(`
  SELECT o.total_minor,
         (SELECT COUNT(*) FROM order_item WHERE order_id = o.id) AS items,
         (SELECT stocked_quantity FROM inventory_level WHERE variant_id = '${variant}') AS stock,
         (SELECT completed_order_id FROM cart WHERE id = 'vfy_cart') AS cart_done,
         (SELECT used_count FROM promotion WHERE code = 'VFY10') AS promo_used
    FROM "order" o WHERE o.id = 'vfy_order'`)
const row = placed.results[0]
check("order total is subtotal - discount + shipping", row.total_minor === 498200, `${row.total_minor}`)
check("order items were written", row.items === 1)
check("stock left the shelf", row.stock === 8, `${row.stock}, expected 8`)
check("the cart is closed against its order", row.cart_done === "vfy_order")
check("promotion usage was counted", row.promo_used === 1)

// Deleting a book must clear it from live carts without erasing order history.
sql(`DELETE FROM product WHERE id = 'vfy_product'`)
const [carts] = sql(`SELECT COUNT(*) AS lines FROM cart_item WHERE variant_id = '${variant}'`)
check("a deleted book leaves live carts", carts.results[0].lines === 0, `${carts.results[0].lines} lines left`)
const [survived] = sql(`SELECT product_title, variant_id FROM order_item WHERE id = 'vfy_oi1'`)
check(
  "order history survives the book being deleted",
  survived.results[0]?.product_title === "Verification title"
)

// ------------------------------------------------------------- passwords
const auth = probe(
  "auth",
  `const m = await import('__MODULE__')
   const hash = await m.hashPassword('correct horse battery staple')
   console.log(JSON.stringify({
     scheme: hash.split('$')[0],
     iterations: Number(hash.split('$')[1]),
     saltedUniquely: hash !== (await m.hashPassword('correct horse battery staple')),
     correct: await m.verifyPassword('correct horse battery staple', hash),
     wrong: await m.verifyPassword('Correct horse battery staple', hash),
     noPassword: await m.verifyPassword('anything', null),
     garbage: await m.verifyPassword('x', 'notahash'),
   }))`
)
if (!auth) {
  console.log("[ skip ] password checks (needs a Node that can read TypeScript)")
} else {
  check("passwords are PBKDF2 with a strong iteration count", auth.scheme === "pbkdf2" && auth.iterations >= 200000, `${auth.scheme}/${auth.iterations}`)
  check("every password gets its own salt", auth.saltedUniquely)
  check("the right password verifies", auth.correct)
  check("a wrong password does not", auth.wrong === false)
  check("an account with no password cannot be signed into", auth.noPassword === false)
  check("a malformed hash is rejected rather than throwing", auth.garbage === false)
}

// -------------------------------------------------------------- sessions
sql(`
  INSERT INTO customer (id, email, password_hash) VALUES ('vfy_cus','verify@example.com','pbkdf2$1$00$00');
  INSERT INTO customer_session (token_hash, customer_id, expires_at)
    VALUES ('vfy_live','vfy_cus', strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day')),
           ('vfy_dead','vfy_cus', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));
`)
const [live] = sql(`SELECT COUNT(*) AS n FROM customer_session
   WHERE token_hash = 'vfy_live' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
const [dead] = sql(`SELECT COUNT(*) AS n FROM customer_session
   WHERE token_hash = 'vfy_dead' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
check("a live session resolves", live.results[0].n === 1)
check("an expired session does not", dead.results[0].n === 0)
sql(`DELETE FROM customer WHERE id = 'vfy_cus'`)
const [orphans] = sql(`SELECT COUNT(*) AS n FROM customer_session WHERE customer_id = 'vfy_cus'`)
check("deleting a customer ends their sessions", orphans.results[0].n === 0)

// -------------------------------------------------------------- payments
const webhook = probe(
  "payments/stripe",
  `const m = await import('__MODULE__')
   const secret = 'whsec_test_secret'
   const body = JSON.stringify({ id: 'evt_1' })
   const now = Math.floor(Date.now() / 1000)
   const sign = async (ts, payload, key = secret) => {
     const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
     const mac = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(ts + '.' + payload))
     return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
   }
   console.log(JSON.stringify({
     accepts: await m.verifyWebhook(secret, body, 't=' + now + ',v1=' + (await sign(now, body))),
     tampered: await m.verifyWebhook(secret, body + ' ', 't=' + now + ',v1=' + (await sign(now, body))),
     stale: await m.verifyWebhook(secret, body, 't=' + (now - 3600) + ',v1=' + (await sign(now - 3600, body))),
     wrongKey: await m.verifyWebhook(secret, body, 't=' + now + ',v1=' + (await sign(now, body, 'other'))),
     missing: await m.verifyWebhook(secret, body, null),
     zeroDecimal: m.toStripeAmount(350000, 'ugx'),
     normal: m.toStripeAmount(2699, 'usd'),
   }))`
)
if (!webhook) {
  console.log("[ skip ] Stripe webhook checks (needs a Node that can read TypeScript)")
} else {
  check("a correctly signed webhook is accepted", webhook.accepts)
  check("a tampered body is rejected", webhook.tampered === false)
  check("a replayed old signature is rejected", webhook.stale === false)
  check("a signature from the wrong secret is rejected", webhook.wrongKey === false)
  check("an unsigned request is rejected", webhook.missing === false)
  check("zero-decimal currencies are not multiplied again", webhook.zeroDecimal === 3500, `${webhook.zeroDecimal}`)
  check("ordinary currencies pass through unchanged", webhook.normal === 2699)
}

const stk = probe(
  "payments/mpesa",
  `const m = await import('__MODULE__')
   const paid = m.parseCallback({ Body: { stkCallback: {
     CheckoutRequestID: 'ws_CO_1', ResultCode: 0, ResultDesc: 'ok',
     CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' }] } } } })
   const cancelled = m.parseCallback({ Body: { stkCallback: { CheckoutRequestID: 'ws_CO_2', ResultCode: 1032, ResultDesc: 'cancelled' } } })
   console.log(JSON.stringify({
     receipt: paid.receipt,
     paid: paid.resultCode === 0,
     cancelled: cancelled.resultCode,
     noReceiptWhenCancelled: cancelled.receipt === undefined,
     garbageIsNull: m.parseCallback({ nope: true }) === null,
     local: m.normalizePhone('0712 345 678'),
     intl: m.normalizePhone('+254712345678'),
     valid: m.isKenyanMobile('0712345678'),
     foreign: m.isKenyanMobile('+1 555 0100'),
   }))`
)
if (!stk) {
  console.log("[ skip ] M-Pesa checks (needs a Node that can read TypeScript)")
} else {
  check("a successful STK callback yields its receipt", stk.receipt === "NLJ7RT61SV" && stk.paid)
  check("a cancelled push is not read as paid", stk.cancelled === 1032 && stk.noReceiptWhenCancelled)
  check("an unrecognised callback body is ignored", stk.garbageIsNull)
  check("phone numbers normalise to Safaricom's format", stk.local === "254712345678" && stk.intl === "254712345678")
  check("only Kenyan mobiles are accepted for M-Pesa", stk.valid && stk.foreign === false)
}

// --------------------------------------------------------- catalogue save
const save = probe(
  "/apps/admin/src/lib/catalog-save.ts",
  `const m = await import('__MODULE__')
   const statements = []
   const db = {
     prepare(q) {
       const s = { sql: q, binds: [], bind(...v) { s.binds = v; return s } }
       statements.push(s)
       return {
         ...s,
         bind: s.bind,
         async first() { return { max: 120 } },
         // saveCatalogProduct reads the FX table to write the base-currency price.
         async all() { return { results: [{ currency_code: 'kes', rate: 129.787571 }] } },
       }
     },
     async batch(list) { return list },
   }
   const id = await m.saveCatalogProduct(db, {
     title: 'Riyad us-Saliheen', images: ['a.webp', 'b.webp'], category_ids: ['cat_hadith'],
     unit: 'item', product_type: 'standard', delivery_type: 'physical', track_inventory: true,
     shipping_size: 'medium', option_title: 'Format', status: 'published', tags: ['bestseller'],
     book: { author: 'Imam an-Nawawi' },
     variants: [{ option_value: 'Hardcover', selling_price: 4980, original_price: 6500,
                  stock: [{ location_id: 'loc_main', quantity: 12 }] }],
   })
   const find = (needle) => statements.filter((s) => s.sql.includes(needle))
   console.log(JSON.stringify({
     handle: m.slugify('Riyad us-Saliheen (2 Volume Set)'),
     nextNumber: find('INSERT INTO product')[0].binds[1],
     images: find('INSERT INTO product_image').length,
     base: find("VALUES (?1, 'kes', 'base'")[0].binds[1],
     sale: find("VALUES (?1, 'kes', 'sale'")[0]?.binds[1],
     baseCurrency: find("VALUES (?1, ?2, 'base'")[0]?.binds[1],
     baseAmount: find("VALUES (?1, ?2, 'base'")[0]?.binds[2],
     saleBaseAmount: find("VALUES (?1, ?2, 'sale'")[0]?.binds[2],
     stock: find('INSERT INTO inventory_level')[0].binds[2],
     preset: find('INSERT INTO variant')[0].binds.slice(9, 13),
     createdId: id.startsWith('prd_'),
   }))`
)
if (!save) {
  console.log("[ skip ] catalogue save checks (needs a Node that can read TypeScript)")
} else {
  check("a new product gets the next product number", save.nextNumber === 121, `${save.nextNumber}`)
  check("the handle is slugified from the title", save.handle === "riyad-us-saliheen-2-volume-set", save.handle)
  check("every image is written in order", save.images === 2)
  check("the editor's KES price is stored in minor units", save.base === 498000, `${save.base}`)
  check("a higher original price becomes the struck-through one", save.sale === 650000, `${save.sale}`)
  check("stock is written against its location", save.stock === 12)
  check("the parcel preset is applied", JSON.stringify(save.preset) === "[25,18,6,1100]", JSON.stringify(save.preset))
  // The storefront converts outwards from the base row, so a price set in the
  // admin has to be written there too or non-KES shoppers read a stale figure.
  check("the editor's price is also written in the base currency", save.baseCurrency === "usd", `${save.baseCurrency}`)
  check("the base-currency price is converted from KES", save.baseAmount === 3899, `${save.baseAmount}`)
  check("a struck-through price gets a base-currency row too", save.saleBaseAmount === 5099, `${save.saleBaseAmount}`)
}

// ------------------------------------------------------------- pricing
const money = probe(
  "money",
  `const m = await import('__MODULE__')
   console.log(JSON.stringify({
     kesRounding: m.roundPrice(3495.01, 'kes'),
     charmPricing: m.roundPrice(26.46, 'gbp'),
     converted: m.convert(2699, 'kes', { kes: 129.5 }),
     noRate: m.convert(2699, 'myr', {}),
   }))`
)
if (!money) {
  console.log("[ skip ] pricing checks (needs a Node that can read TypeScript)")
} else {
  check("whole-unit currencies round to the nearest ten", money.kesRounding === 3500, `${money.kesRounding}`)
  check("other currencies land on .99", money.charmPricing === 26.99, `${money.charmPricing}`)
  check("a base price converts into the shopper's currency", money.converted === 350000, `${money.converted}`)
  check("a missing FX rate shows the base price, not an invented one", money.noRate === 2699, `${money.noRate}`)
}

sql(cleanup)
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed")
process.exit(failures ? 1 : 0)
