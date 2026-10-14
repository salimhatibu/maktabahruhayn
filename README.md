# Maktabah Ruhayn

It's built on **Medusa.js v2**, **PostgreSQL**, **Typesense**, and **Next.js (React + TypeScript)**, with M-Pesa (Daraja), Stripe, GoShippo, and Cloudflare.

## Quick start

```bash
pnpm install
pnpm db:ensure          # creates the DB (user-space Postgres on :5433 if system Postgres refuses)
pnpm setup              # infra, migrations, regions, shipping, catalog, promo code, storefront env
pnpm backend:dev        # http://localhost:9000 (admin at /app)
pnpm storefront:dev     # http://localhost:3000 with Turbopack (pnpm --filter @maktabah/storefront dev:webpack for webpack)
```

The storefront listens on all interfaces, so phones on the LAN can use `http://<your-ip>:3000`. Simulate a country with `?country=KE`, `?country=GB`, and so on.

## What's in it

| Area | Details |
|---|---|
| Catalog | 22 real titles from Darussalam's bestselling and featured lists (`apps/backend/seed-data/catalog`): authors, translators, publishers, ISBNs, pages, sizes, weights, cover images, stock, and sale prices |
| Book metadata | Book module linked to products: Arabic title, author, translator, tahqeeq, publisher, binding, script, language, volumes, ISBN-10/13, sample PDF. Unique-ISBN and trigram indexes are added in a raw-SQL migration |
| Currencies | One region per currency (23 regions). USD is the base price, and every other currency is derived from live FX rates every 6 hours, sale prices included. Shoppers are priced and charged in their own currency |
| Search | Typesense with typo tolerance, facets (language, binding, subject, publisher), price sorting, header typeahead, and recent and popular searches |
| Storefront | Responsive from phone to desktop: a menu drawer (three-line button) with collapsible departments, category bar with dropdowns on desktop, collapsible filters on phones, carousels, quick add, quick view, cart drawer, formats, editorial reviews, ratings and reviews, recently viewed, wishlist, sale items, stock badges, gift options, promo codes, and a newsletter sign-up (name, email and phone). Every cover sits in the same 3:4 frame |
| Accounts | Sign up with an optional shipping address and payment preference (M-Pesa number or card). The account page shows and edits personal details, addresses, the payment preference and order history. Phone numbers use a country-code picker covering every country |
| Shipping countries | 242 countries. Choosing an address in another currency region at checkout moves the cart to that currency |
| Payments | M-Pesa STK Push in Kenya, with polling and resend. Stripe Elements card form with 3D Secure and Apple Pay/Google Pay, shown when Stripe keys are set. A test payment option outside production |
| Shipping | Shippo rates from real parcel size and weight, converted to the cart currency. Free postal shipping above a threshold. Customs declarations on international labels. Tracking webhook |
| Edge | Region detection from `CF-IPCountry` in middleware. Deploys to Cloudflare Workers with OpenNext, static assets on Cloudflare's CDN, and R2 for media and the page cache |

## Admin (`http://localhost:9000/app`)

Medusa's admin, extended with a Maktabah section modeled on the Uzanga dashboard:

| Page | What you manage |
|---|---|
| Dashboard | GMV, captured revenue, orders, average order, products, active customers, and abandoned carts for any date range, converted to one reporting currency. Also a daily sales chart, sales channels, payment methods, regions, top books, low stock, recent orders, and quick links |
| Products | Medusa's Products section opens the Maktabah product list (All, Published, Drafts, Bundles, and Stock with inline stock editing) and one-page editor. Up to 10 images (upload, drag and drop, paste, or pick from the media library; drag to reorder). Rich-text description with reusable templates. Categories with a primary category, units, standard products or bundles, physical or digital delivery, inventory tracking, and shipping-size presets. Variants with a system SKU plus an optional custom SKU, saved option values, selling, original (sale) and cost prices in KES, low-stock alerts, and stock per location. Publish now, save as a draft, or schedule publishing. Collections (bestseller, new arrival, pre-order, booksellers' pick), release date and pre-orders, book details, bookseller's note, author bio, editorial reviews and a search listing preview. Every product gets a product number (`pnpm --filter @maktabah/backend backfill:product-numbers` numbers existing products). Deleting a book removes everything it owns: formats, prices, stock, book details, reviews, its search document and its uploaded images (stock it holds for open orders is released first, which is what otherwise makes a book in an order impossible to delete). `pnpm cleanup:orphan-images` lists images no product uses any more, and `-- --delete` removes them. Medusa's own product page stays reachable from the editor's menu (Advanced settings) |
| Abandoned Carts | Unfinished carts, with one-click reminder emails (or automatic reminders) |
| Payments | Gateway status and payment totals by method, plus an M-Pesa STK Push tool for phone and WhatsApp orders, tracked to paid or failed |
| Shipping | Shippo status, free-shipping thresholds, fallback rates, and shipments with tracking, labels, and customs invoices |
| Emails | SMTP status, editable templates (order placed, shipped, delivered, welcome, abandoned cart, newsletter), test sends, and the email log |
| Affiliates | Partner codes and `?ref=` links, with orders, sales, and commission per partner |
| Reviews, Newsletter | Moderate reviews; subscribers with name, email and phone, exportable as CSV |
| Storefront | Announcement banner, promo bar messages, hero slides with their own images (upload, reuse product images, reorder or remove; `pnpm --filter @maktabah/backend hero:images -- <department-handle>` fills them from a department), home page shelves, and popular searches |
| Menus | The category bar, dropdown columns, and footer links |
| Appearance | Theme colors, with a live preview |
| Business Details | Store name, contact details, WhatsApp number (adds a chat button), socials, reporting currency, and affiliate defaults |

Medusa's built-in pages cover Orders, Create Order (draft orders), Products, Inventory, Customers, Promotions, Price Lists, Users, and Roles & Permissions. Roles are enabled through Medusa's `rbac` feature flag; on an existing install, run `pnpm --filter @maktabah/backend assign:super-admin` once.

Storefront changes made in the admin appear within a minute.

## Key routes

| Route | Purpose |
|---|---|
| `GET /store/books/search` | Typesense search with facets and `sort=price-asc` or `sort=price-desc` |
| `GET/POST /store/products/:id/reviews` | Reviews (posting requires a signed-in customer) |
| `GET /store/reviews/summary` | Average ratings for a list of products |
| `POST /store/newsletter` | Newsletter sign-up |
| `GET /store/fx` | Exchange rates and conversion |
| `GET /store/shipping/free-threshold` | Free-shipping thresholds per currency |
| `POST /store/shipping/validate-address` | Shippo address validation |
| `POST /api/payment/mpesa/callback` | Daraja STK callback (verified, idempotent) |
| `POST /webhooks/shippo?token=` | Shippo tracking webhook (shared secret, idempotent) |
| `/hooks/payment/stripe_stripe` | Stripe webhooks (Medusa built-in) |
| Admin: Books, Reviews, Newsletter | Custom admin pages |

## Configuration

Backend (`apps/backend/.env`, see `.env.template`): `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `DARAJA_*`, `SHIPPO_API_KEY`, `SHIPPO_WEBHOOK_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `STOREFRONT_URL`, `R2_*`. Free-shipping thresholds are set in the admin (Shipping), and the env values are only defaults. After adding Stripe keys, re-run `pnpm seed:regions` to enable Stripe on the regions.

Storefront (`apps/storefront/.env.local`, see `.env.example`): `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, and in production `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (keeps Server Action IDs stable across deploys; the dev script creates one automatically).

## Deploying the storefront to Cloudflare

Run these from the repo root (they target the storefront package, wherever you are):

```bash
pnpm storefront:cf:build     # build with OpenNext
pnpm storefront:cf:preview   # build, then run it locally in workerd
pnpm storefront:cf:deploy    # deploy the Worker (set vars and the R2 cache bucket in wrangler.jsonc first)
```

`wrangler` and `opennextjs-cloudflare` detect the application from the current
directory, and `apps/storefront/wrangler.jsonc` is the only Worker config in the
workspace. Running either tool from the repo root instead fails with:

```text
The Cloudflare application detection logic has been run in the root of a
workspace instead of targeting a specific project.
```

The commands above (and `cd apps/storefront && pnpm cf:deploy`) avoid that. If
you build on Cloudflare (Workers Builds), set the project's **root directory**
to `apps/storefront`, or leave it at the repo root and set the commands to
`pnpm storefront:cf:build` and `pnpm storefront:cf:deploy` — the default
`npx wrangler deploy` runs at the repo root and hits the same error.

## Tests

```bash
pnpm test:unit      # FX conversion, price rounding, parcels, Shippo currency conversion, free shipping
```

## License

MIT
