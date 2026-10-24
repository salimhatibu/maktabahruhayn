/**
 * The front door: one Worker, two surfaces, chosen by the Host header.
 *
 *   PUBLIC_HOST (maktabahruhayn.com)        -> maktabah-storefront
 *   ADMIN_HOST  (admin.maktabahruhayn.com)  -> maktabah-admin
 *
 * Cloudflare Access guards ADMIN_HOST only; the shop stays open. Both apps are
 * reached through service bindings, so the shop never carries admin code.
 *
 * Any other host (this Worker's workers.dev address) serves the shop. On every
 * host but the admin's, /admin is a redirect to ADMIN_ORIGIN: the admin is
 * never served from a path of the shop.
 */
const stripWww = (host) => host.trim().toLowerCase().replace(/^www\./, "")

function surface(url, env) {
  const host = stripWww(url.hostname)
  if (env.ADMIN_HOST && host === stripWww(env.ADMIN_HOST)) return "admin"
  if (env.PUBLIC_HOST && host === stripWww(env.PUBLIC_HOST)) return "public"
  return "legacy"
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (surface(url, env) === "admin") {
      return env.ADMIN.fetch(request)
    }

    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      const origin = (env.ADMIN_ORIGIN || "").replace(/\/+$/, "")
      if (!origin) return new Response("Not found", { status: 404 })
      const rest = url.pathname.slice("/admin".length) || "/"
      return Response.redirect(`${origin}${rest}${url.search}`, 302)
    }

    return env.STOREFRONT.fetch(request)
  },
}
