# Stripe payment provider

Uses the official Medusa Stripe provider (`@medusajs/medusa/payment-stripe`).

Registered only when `STRIPE_API_KEY` is set.

- Provider ID: `pp_stripe_stripe`
- Webhook: `/hooks/payment/stripe_stripe`
- Supports PaymentIntents, 3DS2, Apple Pay / Google Pay via Stripe Checkout/Elements on the storefront

Enable the provider on the Global and Kenya regions (see `pnpm seed:regions`).
