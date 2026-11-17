export * as mpesa from "./mpesa"

// The configuration shapes are re-exported so callers can type their own
// environment plumbing without reaching into the namespaces.
export type { MpesaConfig, MpesaCallback, StkPushResult, StkStatus } from "./mpesa"
