import { headers } from "next/headers"
import { hitRateLimit } from "@maktabah/db"
import { db } from "./db"

/** The visitor's address as Cloudflare saw it; the fallback only applies in development. */
export async function clientIp(): Promise<string> {
  const jar = await headers()
  return (
    jar.get("cf-connecting-ip") ||
    jar.get("x-real-ip") ||
    jar.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  )
}

type Limit = { limit: number; windowSeconds: number }

/**
 * Throttles one kind of action. Two counters, because one IP can be a
 * whole mobile network: Kenyan carriers put many subscribers behind one
 * address, so the per-IP limit is generous and only stops one machine
 * spraying requests, while the per-key limit (the account, the phone) is
 * strict and stops a targeted attack.
 *
 * Returns a message for the form when over a limit. A storage failure never
 * blocks a real shopper.
 */
export async function throttle(
  action: string,
  perIp: Limit,
  perKey?: Limit & { key: string }
): Promise<string | null> {
  try {
    const database = await db()
    const ip = await clientIp()
    const checks = [hitRateLimit(database, `${action}:ip:${ip}`, perIp.limit, perIp.windowSeconds)]
    if (perKey?.key) {
      checks.push(
        hitRateLimit(database, `${action}:key:${perKey.key.toLowerCase()}`, perKey.limit, perKey.windowSeconds)
      )
    }
    const blocked = (await Promise.all(checks)).find((r) => !r.allowed)
    if (!blocked) {
      return null
    }
    const minutes = Math.max(1, Math.ceil(blocked.retryAfterSeconds / 60))
    return `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`
  } catch (error) {
    console.error("Rate limit check failed", error)
    return null
  }
}

/** Limits, in one place so they can be tuned together. */
export const LIMITS = {
  login: { ip: { limit: 60, windowSeconds: 900 }, key: { limit: 8, windowSeconds: 900 } },
  register: { ip: { limit: 20, windowSeconds: 3600 } },
  promo: { ip: { limit: 30, windowSeconds: 600 } },
  stk: { ip: { limit: 20, windowSeconds: 900 }, key: { limit: 5, windowSeconds: 900 } },
  review: { ip: { limit: 30, windowSeconds: 3600 }, key: { limit: 5, windowSeconds: 3600 } },
  newsletter: { ip: { limit: 20, windowSeconds: 3600 } },
  orderLookup: { ip: { limit: 30, windowSeconds: 600 } },
  stockAlert: { ip: { limit: 20, windowSeconds: 3600 } },
} as const
