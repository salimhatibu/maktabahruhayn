# GoShippo fulfillment provider

Provider ID: `fp_shippo_shippo`

## Features
- Dynamic rate calculation (`calculatePrice`) with express/postal service preferences
- Address validation before checkout (`validateFulfillmentData` + `/store/shipping/validate-address`)
- Label + commercial invoice generation on fulfillment create
- Fallback flat amounts when Shippo is unreachable

## Env
See root `.env.example` (`SHIPPO_*`).
