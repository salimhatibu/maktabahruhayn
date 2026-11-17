# Maktabah Ruhayn

An Islamic bookshop that runs entirely on Cloudflare: a **Next.js** storefront
on **Workers** (built by OpenNext), reading and writing **D1** directly through
a binding, with **R2** for media and the page cache. There is no API server and
no Postgres.

## Quick start

```bash
pnpm install
pnpm setup            # create the local D1 database and load the catalogue
pnpm dev              # http://localhost:3000
pnpm db:verify        # assert the money path behaves
```

The storefront listens on all interfaces, so phones on the LAN can use
`http://<your-ip>:3000`. Simulate a country with `?country=KE`, `?country=GB`,
and so on.

## What's in it

| Area | Details |
|---|---|
| Catalogue | 22 real titles (`packages/db/seed-data/books.json`): authors, translators, publishers, ISBNs, pages, sizes, weights, cover images, stock and sale prices |
| Book metadata | Arabic title, author, translator, tahqeeq, publisher, script, language, volumes, ISBN-10/13, sample PDF |
| Currencies | 23 regions, one per currency, as configuration rather than data. USD is the base price; every other currency is converted at read time from the stored FX rates and rounded to a shelf-friendly figure |
| Search | SQLite FTS5 over titles, Arabic titles, authors, publishers and categories, with prefix matching and diacritic folding, so "bukhar" finds "Sahih al-Bukhari" |
| Storefront | Responsive from phone to desktop: menu drawer, category bar, collapsible filters, carousels, quick add, quick view, cart drawer, formats, editorial reviews, ratings and reviews, recently viewed, wishlist, sale items, stock badges, gift options, promo codes and a newsletter sign-up |
| Accounts | Sign up with an optional shipping address and payment preference. Passwords are PBKDF2-HMAC-SHA256 through Web Crypto; a session is an opaque token stored only as a hash, so signing out genuinely ends it |
| Cart and checkout | Prices are snapshotted onto the line, so a price change never alters a cart mid-shop. Moving region re-prices it |
| Payments | M-Pesa STK push with an idempotent callback. An order is created only once money is confirmed |
| Shipping | Flat rates per destination from the database, plus live Shippo rates when it is configured; either degrades to the other |
| Edge | Region detection from `CF-IPCountry` in middleware |

## The database

Everything lives in D1. `packages/db` holds the schema, the migrations and
every query; see [its README](packages/db/README.md) for the conventions that
matter — integer minor units, regions as configuration, and how carts and
orders stay correct without interactive transactions.

```bash
pnpm db:create          # once: create the database, then paste the id into wrangler.jsonc
pnpm db:migrate:local   # or db:migrate for the deployed database
pnpm db:seed:local      # the 22 titles, categories and default settings
pnpm db:console:local "select count(*) from product"
```

## Hosts: the shop and the admin

One front door serves two surfaces, chosen by the `Host` header. The router
Worker (`apps/router`) owns both hostnames and hands each request to the right
app through a service binding:

| Surface | Host | Served by | Who can open it |
|---|---|---|---|
| Shop | `maktabahruhayn.com` (`PUBLIC_HOST`) | `maktabah-storefront` | Everyone |
| Admin | `admin.maktabahruhayn.com` (`ADMIN_HOST`) | `maktabah-admin` | Whoever the Cloudflare Access policy admits |

The admin is served from the root of its own hostname, never from a path of
the shop: `/admin` on any other host is a redirect to `ADMIN_ORIGIN`. Both
apps share the same D1 database. The hostnames are `vars` in
`apps/router/wrangler.jsonc`.

### Cutover checklist

`maktabahruhayn.com` is not on this Cloudflare account yet, and it currently
serves the shop hosted on Uzanga. Moving it replaces that shop, so do these
steps together:

1. Add the `maktabahruhayn.com` zone to this Cloudflare account.
2. Uncomment the `routes` block in `apps/router/wrangler.jsonc` (both
   hostnames as custom domains) and set `ADMIN_ORIGIN` to
   `https://admin.maktabahruhayn.com`. Deploy the router.
3. In Zero Trust > Access > Applications, create a self-hosted application
   for **`admin.maktabahruhayn.com` only**. Never add `maktabahruhayn.com`.
4. In `apps/admin/wrangler.jsonc`, set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`
   (from that application's overview), set `STOREFRONT_URL` to
   `https://maktabahruhayn.com`, set `ADMIN_OPEN` to `"false"`, and uncomment
   `workers_dev: false` and `preview_urls: false`. Deploy the admin.
5. Check: `https://maktabahruhayn.com` opens with no sign-in;
   `https://admin.maktabahruhayn.com` asks for Access first;
   `https://maktabahruhayn.com/admin` redirects to the admin host.

## Admin

`apps/admin` is a separate Worker bound to the same database, served on
`ADMIN_HOST` by the router. Its `middleware.ts` verifies the Cloudflare Access
token on every page and API request (signature, audience, issuer and expiry),
so a request that reaches the Worker any other way is refused.

> `ADMIN_OPEN` must remain `"false"` on a public deployment. Setting it to
> `"true"` bypasses Access and lets anyone read customer details, send M-Pesa
> prompts and change the shop. Access replaces an admin login: there is no
> admin user table or password, and whoever the policy admits is an
> administrator.

```bash
pnpm admin:dev         # http://localhost:3001
pnpm admin:cf:deploy
```

| Page | What you manage |
|---|---|
| Dashboard | Orders, captured revenue, catalogue counts, customers, reviews awaiting moderation, subscribers, open carts, and what is running low |
| Products | The catalogue list with All, Published, Drafts, Bundles and Stock views, search, KES price ranges and inline stock editing |
| Reviews | Approve, reject or delete, filtered by status |
| Newsletter | Subscribers with name, email and phone, exportable as CSV |
| Storefront | Announcement banner, promo bar, hero slides with their images, home page shelves and popular searches |
| Menus | The category bar, dropdown columns and footer links |
| Appearance | Theme colours, with a live preview |
| Business Details | Store name, contact details, WhatsApp number, socials and reporting currency |
| Orders | Every order, filtered by fulfilment state, with details, payment history, delivery tracking, and permanent deletion |
| Payments | Gateway status, totals by provider and currency, and the M-Pesa STK tool for phone and WhatsApp orders |
| Shipping | Shippo status, free-shipping thresholds, fallback rates, zones and shipments with tracking |
| Emails | Provider status, editable templates, test sends and the send log |
| Customers | Everyone with an account, their order count and what they have spent |
| Product editor | The one-page editor: up to 10 images, rich-text description, categories, variants with KES selling, original and cost prices, stock per location, book details, editorial reviews, scheduling and bundles |

With `ADMIN_OPEN` set to `"false"`, the admin stays locked until the Access
team domain and application audience are set in `apps/admin/wrangler.jsonc`.
Image uploads need the `maktabah-media` R2 bucket and `R2_PUBLIC_URL`.
Order confirmation and completion emails use the HTTP email provider. Set
`EMAIL_API_URL` and `EMAIL_API_KEY` as secrets on both the storefront and admin
Workers; `SMTP_FROM` can override the default sender. Failed sends are logged
and can be retried from the order page. Deleting an order also deletes its
payment history, but does not refund the customer or restore stock.

## Deploying

One Worker, one database, one bill.

```bash
pnpm storefront:cf:build     # build with OpenNext
pnpm storefront:cf:preview   # run the built Worker locally in workerd
pnpm db:migrate              # apply migrations to the deployed database
pnpm storefront:cf:deploy    # build and deploy
pnpm db:seed                 # load the catalogue into it
```

Configuration comes from two places, and the difference matters:

- **Build time** — `apps/storefront/.env.production` (committed; public values
  only). Next.js compiles every `NEXT_PUBLIC_*` value into the bundle, so these
  cannot be changed afterwards. `cf:build` loads that file as real environment
  variables so it also beats a developer's `.env.local`, and refuses to build
  for deployment if the site URL would be a local one.
- **Runtime** — `vars` and secrets in `apps/storefront/wrangler.jsonc`, which
  Wrangler copies into `process.env` on each cold start. Payment and shipping
  credentials go in as secrets; that file lists the exact
  `wrangler secret put` commands. A provider with no credentials is simply not
  offered at checkout.

Also set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (`openssl rand -base64 32`) to the
same value in the build environment and as a Worker secret, or pages left open
across a deploy fail with "Server Action was not found".

The custom domains belong to the router Worker, not the storefront; see
"Hosts" above. Until they are attached the shop answers on
`maktabah-storefront.<subdomain>.workers.dev`.

`wrangler` detects the application from the working directory, and
`apps/storefront/wrangler.jsonc` is the only Worker config in the workspace.
Running it from the repo root instead fails with "The Cloudflare application
detection logic has been run in the root of a workspace". The commands above
avoid that. On Cloudflare Workers Builds, set the project's **root directory**
to `apps/storefront`, or leave it at the repo root and use
`pnpm storefront:cf:build` and `pnpm storefront:cf:deploy` as the commands.

### M-Pesa setup and recovery

M-Pesa STK push is the only new checkout payment method, and is available for
Kenyan-shilling carts only. Other regions cannot currently pay at checkout.
Historical card payments remain in the database; the card webhook has been
removed, so previously started card payments will not be finalized by it.

For local development, set these values in the ignored
`apps/storefront/.env.local` and `apps/admin/.env.local` files:

```text
DARAJA_CONSUMER_KEY=
DARAJA_CONSUMER_SECRET=
DARAJA_PASSKEY=
DARAJA_SHORTCODE=
DARAJA_PARTY_B=
DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline
DARAJA_ENVIRONMENT=sandbox
DARAJA_CALLBACK_URL=https://your-public-host/api/payment/mpesa/callback
DARAJA_CALLBACK_TOKEN=
```

For Buy Goods, `DARAJA_SHORTCODE` is the Safaricom business/store shortcode
used to generate the password; `DARAJA_PARTY_B` is the till number. The
callback must be publicly reachable over HTTPS even for sandbox testing.
Generate a random callback token of at least 16 characters, and use the same
token and callback URL in both apps. Keep credentials and the token private.

Local `.env.local` files do **not** configure deployed Workers. Set the
shortcode, till, transaction type, environment (`sandbox` or `production`)
and callback URL in both Workers' `wrangler.jsonc` variables. Set
`DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_PASSKEY` and
`DARAJA_CALLBACK_TOKEN` as Worker secrets in each app directory with
`pnpm exec wrangler secret put NAME`. Apply the database migration before
deploying both Workers. Verify an actual Safaricom payment and its callback
before accepting live orders; setting values alone does not verify connectivity.

Unresolved checkout attempts appear on the admin Payments page. An attempt can
remain pending or require review if a response or callback is lost, or if the
callback details do not match. Do not send another prompt until the transaction
has been checked against Safaricom records. A successful status query does not
include the receipt and amount needed to confirm an order. Only an independently
validated callback can confirm these checkouts; an unresolved attempt may need
manual reconciliation. The admin can retry order creation for a
callback-confirmed payment.

### Webhooks

| Provider | Endpoint | Notes |
|---|---|---|
| M-Pesa | `/api/payment/mpesa/callback?token=…` | Daraja cannot sign, so the URL carries `DARAJA_CALLBACK_TOKEN`. Processing errors return 503; recorded callbacks are idempotent. |

## Tests

```bash
pnpm test          # all of the below
pnpm db:verify     # 54 checks against the local D1
pnpm db:test       # 26 integration tests on a D1 built fresh for the run
pnpm html:test     # the description sanitiser against 29 XSS payloads
```

`db:verify` covers the parts where mistakes cost money: the catalogue and
search, the stock compare-and-set that stops two shoppers buying the last
copy, checkout idempotency, order totals, password hashing and sessions,
M-Pesa callback parsing and the currency rounding rules.

`db:test` runs the real `@maktabah/db` code against a throwaway database made
from every migration and the seed, and replays attacks that once worked:
paying for a small cart and then growing it, paying in a cheaper currency,
completing one cart with another's payment, overwriting another customer's
address. It also checks concurrent orders get distinct numbers, a paid order
is never lost to a stock race, and hostile search input cannot break a query.

## Security notes

- **Payments.** An order is placed only after the provider (never the
  browser) confirms the money, and only if the amount and currency cover the
  cart as it is now. M-Pesa callbacks need `DARAJA_CALLBACK_TOKEN` (16+
  characters), which is added to the callback URL automatically; without it
  M-Pesa is not offered.
- **Headers.** The storefront sends a per-request nonce Content Security
  Policy, HSTS, `X-Frame-Options`, `nosniff`, a referrer policy and a
  permissions policy; the admin sends its own, stricter set.
- **Accounts.** PBKDF2-SHA256 at 210,000 iterations, sessions as hashed random
  tokens, sign-in that takes the same time whether or not the account exists,
  and throttling on sign-in, sign-up, promo codes, reviews, the newsletter,
  order lookups, stock alerts and M-Pesa prompts.
- **Content.** Product descriptions pass an allowlist sanitiser on save and on
  render. Uploads are checked by their bytes (no SVG), digital files get
  random keys and are served as downloads, and CSV exports neutralise
  spreadsheet formulas.

## License

MIT
