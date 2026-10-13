import Link from "next/link"
import type { OrderSummary } from "@/lib/auth"
import { mediaUrl } from "@/lib/config"
import { countryName, formatMoney, titleCase } from "@/lib/format"
import { BookCover } from "./book-cover"

export function orderStatusLabel(order: OrderSummary) {
  const delivered = order.fulfillments?.some((f) => f.delivered_at)
  if (order.status === "canceled") {
    return "Canceled"
  }
  if (delivered) {
    return "Delivered"
  }
  if (order.fulfillment_status === "shipped" || order.fulfillments?.some((f) => f.shipped_at)) {
    return "Shipped"
  }
  if (order.fulfillments?.length) {
    return "Preparing shipment"
  }
  return order.payment_status === "captured" || order.payment_status === "authorized" ? "Processing" : titleCase(order.payment_status || "pending")
}

export function OrderDetails({ order }: { order: OrderSummary }) {
  const c = order.currency_code
  const address = order.shipping_address
  const tracking = (order.fulfillments || []).flatMap((f) =>
    (f.labels || []).map((l) => ({ ...l, status: f.metadata?.tracking_status as string | undefined }))
  )
  return (
    <div className="order-details">
      <div className="order-head">
        <div>
          <h2>Order #{order.display_id}</h2>
          <p className="muted">
            Placed {new Date(order.created_at).toLocaleDateString("en", { dateStyle: "long" })}
          </p>
        </div>
        <span className="order-status">{orderStatusLabel(order)}</span>
      </div>

      {tracking.length ? (
        <div className="tracking">
          {tracking.map((t) => (
            <p key={t.tracking_number}>
              Tracking <strong>{t.tracking_number}</strong>
              {t.status ? ` · ${titleCase(t.status.toLowerCase())}` : ""}{" "}
              {t.tracking_url ? (
                <a href={t.tracking_url} target="_blank" rel="noopener noreferrer">
                  Track package
                </a>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}

      <ul className="order-items">
        {order.items.map((item) => (
          <li key={item.id}>
            <span className="order-item-cover">
              <BookCover
                book={{
                  handle: item.product_handle || item.id,
                  title: item.product_title || item.title,
                  cover: mediaUrl(item.thumbnail),
                }}
              />
            </span>
            <span>
              {item.product_handle ? (
                <Link href={`/books/${item.product_handle}`}>{item.product_title || item.title}</Link>
              ) : (
                item.product_title || item.title
              )}
              {item.variant_title ? <small className="muted"> · {item.variant_title}</small> : null}
              <small className="muted"> × {item.quantity}</small>
            </span>
            <span>{formatMoney(item.unit_price * item.quantity, c)}</span>
          </li>
        ))}
      </ul>

      <div className="order-foot">
        {address ? (
          <address className="address-block">
            <strong>Shipping to</strong>
            <br />
            {address.first_name} {address.last_name}
            <br />
            {address.address_1}
            <br />
            {address.city} {address.postal_code}
            <br />
            {countryName(address.country_code || "")}
          </address>
        ) : null}
        <dl className="summary-rows">
          <div>
            <dt>Items</dt>
            <dd>{formatMoney(order.item_subtotal ?? 0, c)}</dd>
          </div>
          {order.discount_total ? (
            <div>
              <dt>Discount</dt>
              <dd>−{formatMoney(order.discount_total, c)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Shipping{order.shipping_methods?.[0] ? ` (${order.shipping_methods[0].name})` : ""}</dt>
            <dd>{order.shipping_total ? formatMoney(order.shipping_total, c) : "FREE"}</dd>
          </div>
          <div>
            <dt>Tax</dt>
            <dd>{formatMoney(order.tax_total ?? 0, c)}</dd>
          </div>
          <div className="summary-total">
            <dt>Total</dt>
            <dd>{formatMoney(order.total, c)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
