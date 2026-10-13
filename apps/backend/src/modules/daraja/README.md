# Daraja (M-Pesa) payment provider

Provider ID: `pp_daraja_daraja`. Offered on the Kenya (KES) region only, since Daraja is Safaricom Kenya.

## Flow
1. `initiatePayment` sends an STK Push (Lipa na M-Pesa Online). The callback URL carries Medusa's payment
   session id as `?sid=`, so the callback can be matched to the session.
2. The storefront polls cart completion while the shopper approves on their phone; `authorizePayment`
   re-checks with the STK status query (the fallback when the callback is delayed).
3. Safaricom calls `POST /api/payment/mpesa/callback?sid=...`. Callbacks are unsigned, so a success is only
   trusted after the STK status query confirms it. `processPaymentWorkflow` is idempotent, so retries are safe.
   Set `DARAJA_ALLOWED_IPS` to restrict callers.

## Env
`DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_PASSKEY`, `DARAJA_SHORTCODE`,
`DARAJA_CALLBACK_URL` (public URL of `/api/payment/mpesa/callback`), `DARAJA_ENVIRONMENT` (`sandbox` or `production`).

Without credentials, the provider creates mock sessions that authorize immediately, for local development.
