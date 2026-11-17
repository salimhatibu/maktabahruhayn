import openNext from "./.open-next/worker.js"
import { sendDueReviewRequests } from "@maktabah/db"

export * from "./.open-next/worker.js"

export default {
  fetch: openNext.fetch,

  // Hourly: email customers whose order was delivered three or more days ago.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      sendDueReviewRequests(env.DB, {
        endpoint: env.EMAIL_API_URL,
        token: env.EMAIL_API_KEY,
        from: env.SMTP_FROM,
        storeUrl: env.STOREFRONT_URL,
      }).then((result) => console.log("Review requests", JSON.stringify(result)))
    )
  },
}
