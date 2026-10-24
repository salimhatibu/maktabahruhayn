/**
 * Who may use the admin, according to Cloudflare Access.
 *
 * Access sits in front of the admin hostname only (never the shop's) and hands
 * every request it lets through a signed token, in the
 * `Cf-Access-Jwt-Assertion` header and the `CF_Authorization` cookie. There is
 * no admin user table and no password: the Access policy decides who gets in,
 * and this module checks the token itself - signature, audience, issuer and
 * expiry - so a request that reaches the Worker some other way (its
 * workers.dev address, a preview URL) is still refused.
 *
 * `middleware.ts` runs `checkAccess` on every page and API request.
 */
export type AdminIdentity = { email: string; verified: boolean; open: boolean }

export type AccessResult =
  | { ok: true; identity: AdminIdentity }
  | { ok: false; status: 401 | 503; message: string }

/**
 * ADMIN_OPEN=true turns the gate off: the dashboard then answers anyone who
 * knows the hostname, with no sign-in at all. It exists so the admin can be
 * used before an Access policy is set up, and the UI says so on every page
 * while it is on. Set it back to "false" to require Access again - nothing
 * else has to change.
 */
const isOpen = () => process.env.ADMIN_OPEN === "true"

/** Access sends the token as a header, and as a cookie on browser requests. */
function readToken(headers: Headers): string | null {
  const header = headers.get("cf-access-jwt-assertion")?.trim()
  if (header) return header
  const match = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(headers.get("cookie") || "")
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1].trim())
  } catch {
    return match[1].trim()
  }
}

export async function checkAccess(headers: Headers): Promise<AccessResult> {
  const token = readToken(headers)
  const teamDomain = process.env.ACCESS_TEAM_DOMAIN?.trim()
  const audience = process.env.ACCESS_AUD?.trim()
  const email = token && teamDomain && audience ? await verifiedEmail(token, teamDomain, audience) : null

  if (isOpen()) {
    return { ok: true, identity: { email: email || "Not signed in", verified: Boolean(email), open: true } }
  }
  if (email) {
    return { ok: true, identity: { email, verified: true, open: false } }
  }
  // `next dev` has no Access in front of it.
  if (process.env.NODE_ENV === "development") {
    return { ok: true, identity: { email: "developer@localhost", verified: false, open: true } }
  }
  if (!teamDomain || !audience) {
    return { ok: false, status: 503, message: "The admin is locked until Cloudflare Access is configured." }
  }
  return { ok: false, status: 401, message: "Sign in through Cloudflare Access to continue." }
}

type Jwk = JsonWebKey & { kid?: string }

let certs: { team: string; keys: Jwk[]; fetchedAt: number } | null = null
const CERTS_TTL_MS = 10 * 60 * 1000

async function signingKey(teamDomain: string, kid: string | undefined): Promise<Jwk | undefined> {
  const fresh = certs && certs.team === teamDomain && Date.now() - certs.fetchedAt < CERTS_TTL_MS
  let key = fresh ? certs!.keys.find((k) => k.kid === kid) : undefined
  // Fetch again on a miss too: Access rotates its keys.
  if (!key) {
    const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
    const body = (await response.json()) as { keys?: Jwk[] }
    certs = { team: teamDomain, keys: body.keys || [], fetchedAt: Date.now() }
    key = certs.keys.find((k) => k.kid === kid)
  }
  return key
}

/** The email in a valid Access token, or null when the token does not check out. */
async function verifiedEmail(token: string, teamDomain: string, audience: string): Promise<string | null> {
  try {
    const [rawHeader, rawPayload, rawSignature] = token.split(".")
    if (!rawHeader || !rawPayload || !rawSignature) return null
    const header = JSON.parse(decodeBase64Url(rawHeader)) as { kid?: string; alg?: string }
    const payload = JSON.parse(decodeBase64Url(rawPayload)) as {
      aud?: string | string[]
      exp?: number
      nbf?: number
      iss?: string
      email?: string
    }
    const now = Date.now() / 1000
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (
      header.alg !== "RS256" ||
      !audiences.includes(audience) ||
      payload.iss !== `https://${teamDomain}` ||
      !payload.exp ||
      payload.exp < now ||
      (payload.nbf && payload.nbf > now + 60) ||
      !payload.email
    ) {
      return null
    }

    const jwk = await signingKey(teamDomain, header.kid)
    if (!jwk) return null
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
      "verify",
    ])
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(rawSignature) as BufferSource,
      new TextEncoder().encode(`${rawHeader}.${rawPayload}`)
    )
    return valid ? payload.email : null
  } catch {
    return null
  }
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "="))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function decodeBase64Url(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value))
}

/** Request headers the middleware sets for the layout; never trusted from the client. */
export const IDENTITY_HEADER = "x-maktabah-admin"
