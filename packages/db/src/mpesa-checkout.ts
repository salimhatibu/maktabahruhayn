import type { D1 } from "./client"
import { getCart } from "./cart"
import { finalizePaidCart, settlePayment } from "./orders"
import { newId } from "./writes"
import { isKenyanMobile, normalizePhone, type MpesaCallback } from "./payments/mpesa"

export type MpesaCheckout = {
  id: string
  cartId: string
  phone: string
  amountMinor: number | null
  checkoutId: string | null
  status: "starting" | "pending" | "confirmed" | "failed" | "review"
  receipt: string | null
  verifiedBy: "callback" | null
  resultDescription: string | null
}

const columns = `id, cart_id AS cartId, phone, amount_minor AS amountMinor,
  checkout_id AS checkoutId, status, receipt, verified_by AS verifiedBy, result_description AS resultDescription`

export async function getMpesaCheckout(db: D1, id: string): Promise<MpesaCheckout | null> {
  return db.prepare(`SELECT ${columns} FROM mpesa_checkout WHERE id = ?1`).bind(id).first<MpesaCheckout>()
}

export async function latestMpesaCheckout(db: D1, cartId: string): Promise<MpesaCheckout | null> {
  return db.prepare(`SELECT ${columns} FROM mpesa_checkout WHERE cart_id = ?1 ORDER BY rowid DESC LIMIT 1`)
    .bind(cartId).first<MpesaCheckout>()
}

/** Claims the cart before any request can reach Safaricom. */
export async function beginMpesaCheckout(db: D1, cartId: string, phone: string): Promise<MpesaCheckout | null> {
  if (!isKenyanMobile(phone)) throw new Error("Enter a valid Kenyan M-Pesa phone number.")
  const id = newId("stk")
  const result = await db.prepare(
    `INSERT OR IGNORE INTO mpesa_checkout (id, cart_id, phone, status)
     SELECT ?1, id, ?3, 'starting' FROM cart
      WHERE id = ?2 AND completed_order_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM payment WHERE cart_id = ?2 AND order_id IS NULL
            AND provider = 'manual' AND status IN ('pending', 'captured')
        )`
  ).bind(id, cartId, normalizePhone(phone)).run()
  return result.meta?.changes ? getMpesaCheckout(db, id) : null
}

export async function setMpesaCheckoutAmount(db: D1, id: string, amountMinor: number): Promise<void> {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor % 100 !== 0) {
    throw new Error("Invalid M-Pesa payment amount.")
  }
  const result = await db.prepare(
    `UPDATE mpesa_checkout SET amount_minor = ?2 WHERE id = ?1 AND status = 'starting' AND amount_minor IS NULL`
  ).bind(id, amountMinor).run()
  if (!result.meta?.changes) throw new Error("M-Pesa payment attempt could not be prepared.")
}

export async function markMpesaCheckoutSent(db: D1, id: string, checkoutId: string): Promise<void> {
  if (!checkoutId) throw new Error("M-Pesa did not provide a checkout request ID.")
  const result = await db.prepare(
    `UPDATE mpesa_checkout SET checkout_id = ?2,
       status = CASE WHEN status = 'starting' THEN 'pending' ELSE status END,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?1 AND (checkout_id IS NULL OR checkout_id = ?2)`
  ).bind(id, checkoutId).run()
  if (!result.meta?.changes) throw new Error("M-Pesa checkout request ID does not match the callback.")
}

/** Only use before sending a request to Safaricom. */
export async function cancelUnsentMpesaCheckout(db: D1, id: string): Promise<void> {
  await db.prepare(
    `UPDATE mpesa_checkout SET status = 'failed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?1 AND status = 'starting' AND checkout_id IS NULL`
  ).bind(id).run()
}

export async function reviewMpesaCheckout(db: D1, id: string): Promise<void> {
  await db.prepare(
    `UPDATE mpesa_checkout SET status = 'review', review_reason = 'uncertain',
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?1 AND status IN ('starting', 'pending')`
  ).bind(id).run()
}

export async function recordMpesaCheckoutCallback(
  db: D1,
  id: string,
  callback: MpesaCallback
): Promise<MpesaCheckout | null> {
  const attempt = await getMpesaCheckout(db, id)
  if (!attempt || !callback.checkoutRequestId || !attempt.amountMinor ||
      !Number.isSafeInteger(callback.resultCode) || callback.resultCode < 0) return null
  if (attempt.checkoutId && attempt.checkoutId !== callback.checkoutRequestId) {
    throw new Error("M-Pesa callback checkout ID does not match.")
  }
  const validSuccess = callback.resultCode === 0 &&
    Number.isSafeInteger(callback.amount) && callback.amount! * 100 === attempt.amountMinor &&
    Boolean(callback.receipt) && Boolean(callback.phone) &&
    normalizePhone(callback.phone!) === attempt.phone
  const status = callback.resultCode === 0 ? (validSuccess ? "confirmed" : "review") : "failed"
  await db.prepare(
    `UPDATE mpesa_checkout SET checkout_id = ?2, status = ?3, receipt = ?4,
       verified_by = CASE WHEN ?3 = 'confirmed' THEN 'callback' ELSE NULL END,
       review_reason = CASE WHEN ?3 = 'review' THEN 'callback_mismatch' ELSE NULL END,
       result_description = ?5,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?1 AND (status IN ('starting', 'pending') OR
       (status = 'review' AND (?3 = 'confirmed' OR (review_reason = 'uncertain' AND ?3 = 'failed'))))
       AND (checkout_id IS NULL OR checkout_id = ?2)`
  ).bind(id, callback.checkoutRequestId, status, validSuccess ? callback.receipt : null, callback.resultDesc).run()
  return getMpesaCheckout(db, id)
}

export async function recordMpesaRequestCallback(
  db: D1, id: string, callback: MpesaCallback
): Promise<"recorded" | "review"> {
  const request = await db.prepare(
    `SELECT phone, amount_minor, checkout_id, mpesa_review FROM payment_request WHERE id = ?1`
  ).bind(id).first<{ phone: string; amount_minor: number; checkout_id: string | null; mpesa_review: number }>()
  if (!request || !callback.checkoutRequestId ||
      (request.checkout_id && request.checkout_id !== callback.checkoutRequestId) ||
      !Number.isSafeInteger(callback.resultCode) || callback.resultCode < 0) return "review"
  const validSuccess = callback.resultCode === 0 && Number.isSafeInteger(callback.amount) &&
    callback.amount! * 100 === request.amount_minor && Boolean(callback.receipt) &&
    Boolean(callback.phone) && normalizePhone(callback.phone!) === request.phone
  if (callback.resultCode === 0 && !validSuccess) {
    await db.prepare(
      `UPDATE payment_request SET checkout_id = ?2, mpesa_review = 1,
         description = 'Callback details do not match; check Safaricom records.',
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?1 AND status = 'pending' AND (checkout_id IS NULL OR checkout_id = ?2)`
    ).bind(id, callback.checkoutRequestId).run()
    return "review"
  }
  if (!validSuccess && request.mpesa_review) return "review"
  await db.prepare(
    `UPDATE payment_request SET checkout_id = ?2, status = ?3, receipt = ?4, mpesa_review = 0,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?1 AND status = 'pending' AND (checkout_id IS NULL OR checkout_id = ?2)
       AND (mpesa_review = 0 OR ?3 = 'paid')`
  ).bind(id, callback.checkoutRequestId, validSuccess ? "paid" : "failed", validSuccess ? callback.receipt : null).run()
  return "recorded"
}

export async function finalizeMpesaCheckout(db: D1, id: string) {
  const attempt = await getMpesaCheckout(db, id)
  if (!attempt || attempt.status !== "confirmed" || !attempt.checkoutId || !attempt.amountMinor || !attempt.receipt || !attempt.verifiedBy) {
    throw new Error("M-Pesa payment is not confirmed.")
  }
  const cart = await getCart(db, attempt.cartId)
  if (!cart) throw new Error("The paid cart could not be found.")
  if (cart.completedOrderId) {
    return { ok: true as const, orderId: cart.completedOrderId }
  }
  await db.prepare(
    `INSERT INTO payment (id, cart_id, provider, status, amount_minor, currency_code, reference)
     VALUES (?1, ?2, 'mpesa', 'pending', ?3, 'kes', ?4)
     ON CONFLICT (provider, reference) WHERE reference IS NOT NULL DO NOTHING`
  ).bind(newId("pay"), attempt.cartId, attempt.amountMinor, attempt.checkoutId).run()
  const payment = await db.prepare(
    `SELECT cart_id, amount_minor, currency_code FROM payment WHERE provider = 'mpesa' AND reference = ?1`
  ).bind(attempt.checkoutId).first<{ cart_id: string | null; amount_minor: number; currency_code: string }>()
  if (!payment || payment.cart_id !== attempt.cartId ||
      payment.amount_minor !== attempt.amountMinor || payment.currency_code !== "kes") {
    throw new Error("M-Pesa payment reference does not match the cart.")
  }
  await settlePayment(db, {
    provider: "mpesa", reference: attempt.checkoutId, status: "captured", raw: { receipt: attempt.receipt },
  })
  return finalizePaidCart(db, {
    cartId: attempt.cartId, provider: "mpesa", reference: attempt.checkoutId,
    paidMinor: attempt.amountMinor, currency: "kes",
  })
}
