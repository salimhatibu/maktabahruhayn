import {
  ArrowUpRightOnBox,
  BellAlert,
  BuildingStorefront,
  Envelope,
  Plus,
  ShoppingCart,
  Star,
  Tag,
  Users,
} from "@medusajs/icons"
import Link from "next/link"
import { db } from "@/lib/db"

const DAYS = 14

const kes = (minor: number) =>
  new Intl.NumberFormat("en", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(minor / 100)

const PAYMENT: Record<string, [string, string]> = {
  captured: ["Paid", "ok"],
  authorized: ["Authorised", "info"],
  awaiting: ["Awaiting", "warn"],
  failed: ["Failed", "bad"],
  refunded: ["Refunded", "muted"],
}

/**
 * Dashboard. The figures the previous one led with: what has sold, what is in
 * the catalogue, and what needs attention.
 */
export default async function DashboardPage() {
  const database = await db()
  const since = new Date(Date.now() - (DAYS - 1) * 86_400_000).toISOString().slice(0, 10)

  const [totals, daily, recent, lowStock] = await database.batch<Record<string, number | string | null>>([
    database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM "order") AS orders,
        (SELECT COALESCE(SUM(total_minor), 0) FROM "order" WHERE payment_status = 'captured') AS revenue_minor,
        (SELECT COUNT(*) FROM "order" WHERE payment_status = 'captured') AS paid_orders,
        (SELECT COUNT(*) FROM "order" WHERE fulfillment_status = 'not_fulfilled' AND payment_status = 'captured') AS to_fulfil,
        (SELECT COUNT(*) FROM product WHERE status = 'published' AND deleted_at IS NULL) AS published,
        (SELECT COUNT(*) FROM product WHERE status != 'published' AND deleted_at IS NULL) AS drafts,
        (SELECT COUNT(*) FROM customer) AS customers,
        (SELECT COUNT(*) FROM review WHERE status = 'pending') AS pending_reviews,
        (SELECT COUNT(*) FROM newsletter_subscriber) AS subscribers,
        (SELECT COUNT(*) FROM cart WHERE completed_order_id IS NULL) AS open_carts
    `),
    database
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, COALESCE(SUM(total_minor), 0) AS revenue_minor
           FROM "order"
          WHERE payment_status = 'captured' AND substr(created_at, 1, 10) >= ?
          GROUP BY day`
      )
      .bind(since),
    database.prepare(
      `SELECT id, display_id, email, total_minor, currency_code, payment_status, created_at
         FROM "order" ORDER BY created_at DESC LIMIT 6`
    ),
    database.prepare(
      `SELECT p.id, p.title, v.title AS variant, il.stocked_quantity - il.reserved_quantity AS available
         FROM inventory_level il
         JOIN variant v ON v.id = il.variant_id
         JOIN product p ON p.id = v.product_id
        WHERE p.deleted_at IS NULL AND v.manage_inventory = 1
          AND il.stocked_quantity - il.reserved_quantity <= COALESCE(v.low_stock_threshold, 5)
        ORDER BY available ASC LIMIT 6`
    ),
  ])

  const row = totals.results[0] || {}
  const n = (key: string) => Number(row[key] ?? 0)

  const byDay = new Map(daily.results.map((r) => [String(r.day), Number(r.revenue_minor ?? 0)]))
  const series = Array.from({ length: DAYS }, (_, i) => {
    const date = new Date(Date.now() - (DAYS - 1 - i) * 86_400_000)
    const key = date.toISOString().slice(0, 10)
    return { key, label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), value: byDay.get(key) || 0 }
  })
  const peak = Math.max(1, ...series.map((s) => s.value))
  const fortnight = series.reduce((sum, s) => sum + s.value, 0)
  const average = n("paid_orders") ? n("revenue_minor") / n("paid_orders") : 0

  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

  const kpis = [
    { label: "Orders", value: n("orders"), note: `${n("to_fulfil")} waiting to ship`, href: "/orders", icon: ShoppingCart, tone: "green" },
    { label: "Customers", value: n("customers"), note: plural(n("open_carts"), "open cart"), href: "/customers", icon: Users, tone: "plum" },
    { label: "Books on sale", value: n("published"), note: plural(n("drafts"), "draft"), href: "/products", icon: Tag, tone: "gold" },
    { label: "Subscribers", value: n("subscribers"), note: "Newsletter list", href: "/newsletter", icon: Envelope, tone: "teal" },
  ]

  const attention = [
    { label: "Orders to fulfil", value: n("to_fulfil"), href: "/orders", icon: ShoppingCart },
    { label: "Reviews awaiting approval", value: n("pending_reviews"), href: "/reviews", icon: Star },
    { label: "Books running low", value: lowStock.results.length, href: "/stock-alerts", icon: BellAlert },
    { label: "Draft books", value: n("drafts"), href: "/products?view=draft", icon: Tag },
  ]

  return (
    <div className="mr-dash">
      <section className="mr-welcome">
        <div>
          <h1>Assalamu alaikum.</h1>
          <p>Here is how Maktabah Ruhayn is doing today.</p>
        </div>
        <div className="mr-health">
          <span className="mr-dot" aria-hidden="true" />
          <span>
            The shop is live
            <small>{n("published")} books published</small>
          </span>
        </div>
      </section>

      <div className="mr-bento">
        <section className="mr-card mr-card-hero" aria-labelledby="revenue-title">
          <div className="mr-card-head">
            <h2 id="revenue-title">Captured revenue</h2>
            <span className="mr-hero-chip">All time</span>
          </div>
          <p className="mr-hero-figure">{kes(n("revenue_minor"))}</p>
          <dl className="mr-hero-stats">
            <div>
              <dt>Paid orders</dt>
              <dd>{n("paid_orders")}</dd>
            </div>
            <div>
              <dt>Average order</dt>
              <dd>{kes(average)}</dd>
            </div>
            <div>
              <dt>Last {DAYS} days</dt>
              <dd>{kes(fortnight)}</dd>
            </div>
          </dl>
          <div className="mr-hero-chart" role="img" aria-label={`Revenue for each of the last ${DAYS} days`}>
            {series.map((s, i) => (
              <span
                key={s.key}
                className={i === series.length - 1 ? "is-today" : ""}
                style={{ height: `${Math.max(4, (s.value / peak) * 100)}%` }}
                title={`${s.label}: ${kes(s.value)}`}
              />
            ))}
          </div>
          <div className="mr-hero-axis">
            <span>{series[0].label}</span>
            <span>Today</span>
          </div>
        </section>

        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="mr-card mr-kpi">
            <span className={`mr-chip mr-tone-${k.tone}`} aria-hidden="true">
              <k.icon />
            </span>
            <span className="mr-kpi-label">{k.label}</span>
            <span className="mr-kpi-value">{k.value.toLocaleString("en")}</span>
            <span className="mr-kpi-note">{k.note}</span>
          </Link>
        ))}

        <section className="mr-card mr-card-attention" aria-labelledby="attention-title">
          <div className="mr-card-head">
            <h2 id="attention-title">Needs attention</h2>
          </div>
          <ul className="mr-rows">
            {attention.map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="mr-row-link">
                  <span className="mr-row-icon" aria-hidden="true">
                    <a.icon />
                  </span>
                  <span className="mr-row-label">{a.label}</span>
                  <span className={`mr-count ${a.value ? "is-hot" : ""}`}>{a.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mr-card mr-card-orders" aria-labelledby="recent-title">
          <div className="mr-card-head">
            <h2 id="recent-title">Recent orders</h2>
            <Link href="/orders" className="mr-link">
              View all
            </Link>
          </div>
          {recent.results.length ? (
            <ul className="mr-rows">
              {recent.results.map((o) => {
                const [label, tone] = PAYMENT[String(o.payment_status)] || [String(o.payment_status), "muted"]
                return (
                  <li key={String(o.id)}>
                    <Link href={`/orders/${o.id}`} className="mr-row-link">
                      <span className="mr-order-no">#{String(o.display_id)}</span>
                      <span className="mr-row-label">
                        {String(o.email)}
                        <small>{new Date(String(o.created_at)).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small>
                      </span>
                      <span className={`mr-pill mr-pill-${tone}`}>{label}</span>
                      <span className="mr-row-amount">
                        {new Intl.NumberFormat("en", {
                          style: "currency",
                          currency: String(o.currency_code).toUpperCase(),
                          maximumFractionDigits: 0,
                        }).format(Number(o.total_minor) / 100)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mr-card-empty">No orders yet. They will appear here as soon as someone checks out.</p>
          )}
        </section>

        <section className="mr-card mr-card-stock" aria-labelledby="stock-title">
          <div className="mr-card-head">
            <h2 id="stock-title">Low stock</h2>
            <Link href="/stock-alerts" className="mr-link">
              Alerts
            </Link>
          </div>
          {lowStock.results.length ? (
            <ul className="mr-rows">
              {lowStock.results.map((item) => (
                <li key={`${item.id}-${item.variant}`}>
                  <Link href={`/products/${item.id}`} className="mr-row-link">
                    <span className="mr-row-label">
                      {String(item.title)}
                      <small>{String(item.variant)}</small>
                    </span>
                    <span className={`mr-pill ${Number(item.available) <= 0 ? "mr-pill-bad" : "mr-pill-warn"}`}>
                      {Number(item.available) <= 0 ? "Out of stock" : `${item.available} left`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mr-card-empty">Nothing is running low.</p>
          )}
        </section>
      </div>

      <section className="mr-actions" aria-labelledby="actions-title">
        <div className="mr-actions-intro">
          <span className="mr-chip mr-tone-green" aria-hidden="true">
            <BuildingStorefront />
          </span>
          <div>
            <h2 id="actions-title">Quick actions</h2>
            <p>The things you do most often.</p>
          </div>
        </div>
        <div className="mr-actions-list">
          <Link href="/products/new" className="mr-action is-primary">
            <Plus /> Add a book
          </Link>
          <Link href="/orders" className="mr-action">
            <ShoppingCart /> Fulfil orders
          </Link>
          <Link href="/reviews" className="mr-action">
            <Star /> Moderate reviews
          </Link>
          <Link href="/storefront" className="mr-action">
            <ArrowUpRightOnBox /> Edit storefront
          </Link>
        </div>
      </section>
    </div>
  )
}
