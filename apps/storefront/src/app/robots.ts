import type { MetadataRoute } from "next"

/**
 * The storefront is the only public face of the shop. The admin dashboard is
 * not part of this app at all (it is served by the backend on its own origin,
 * which disallows crawling), so there is nothing admin-related to hide here;
 * the disallowed paths are just the per-visitor pages worth keeping out of an
 * index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/account", "/cart", "/checkout", "/order-status", "/wishlist", "/api/"],
      },
    ],
  }
}
