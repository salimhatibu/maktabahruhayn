# @maktabah/db

The shop's database: a Cloudflare D1 (SQLite) schema, its migrations, and the
typed helpers both the storefront Worker and the admin Worker use to read and
write it. There is no server in between — each Worker binds the database
directly and calls these functions.

## Layout

| Path | What |
|---|---|
| `migrations/0001_init.sql` | Catalogue, variants, pricing, inventory, customers, carts, orders, payments, promotions, settings |
| `migrations/0002_search.sql` | FTS5 index over the catalogue, kept current by triggers. Replaces Typesense |
| `src/catalogue.ts` | Catalogue reads: listings, filters, facets, product pages |
| `src/cart.ts` | Carts, lines, promotions and totals |
| `src/orders.ts` | Stock claims, order placement, order history |
| `src/reviews.ts`, `src/writes.ts` | Reviews, ratings, newsletter |
| `scripts/verify.mjs` | Checks the money path against a real local D1 |

## Conventions

- **Money is an integer in minor units** of the row's currency. Never a float.
- **Timestamps are ISO-8601 UTC text**, which sorts correctly as text.
- **Regions are code, not data** (`packages/shared`): they are static
  configuration. Only the FX rates they depend on are stored, and prices for
  currencies without an explicit row are derived at read time.
- **D1 has no interactive transactions.** Multi-step writes go through
  `batch()`, stock is claimed with a compare-and-set against
  `inventory_level.version`, and anything a provider can retry is guarded by
  `idempotency_key`.

## Commands

Run from the repo root. The binding lives in `apps/storefront/wrangler.jsonc`.

```bash
pnpm db:create                 # one-off: create the D1 database, then paste the id into wrangler.jsonc
pnpm db:migrate:local          # apply migrations to the local dev database
pnpm db:migrate                # apply migrations to the remote (production) database
pnpm db:console:local          # open a SQL shell against the local database
pnpm db:seed:local             # load the 22 catalogue titles and their covers
pnpm db:verify                 # assert the money path still behaves
```

## Concurrency

D1 has no interactive transactions, so two rules stand in for them and
`pnpm db:verify` asserts both:

- **Stock is claimed with a compare-and-set.** A checkout reads
  `inventory_level.version`, then updates `WHERE version = <what it read>`. If
  another checkout moved first, zero rows change and the claim is retried
  against fresh numbers. Without this, two shoppers reading the last copy at
  the same time would both sell it.
- **Checkouts are gated by a key.** `placeOrder` inserts into
  `idempotency_key` before doing anything else. A retried submit or a replayed
  payment webhook collides on the primary key and reads back the first
  outcome, so it can never produce a second order.
