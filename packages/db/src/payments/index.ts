export * as mpesa from "./mpesa"
export * as shippo from "./shippo"

// The configuration shapes are re-exported so callers can type their own
// environment plumbing without reaching into the namespaces.
export type { MpesaConfig, MpesaCallback, StkPushResult, StkStatus } from "./mpesa"
export type { ShippoAddress, ShippoConfig, ShippoParcel, ShippoRate } from "./shippo"
