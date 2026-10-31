import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"

/**
 * GET /unsubscribe?id=<subscriber id> — removes someone from the newsletter.
 *
 * The id is the subscriber's random primary key, which only reaches them in
 * their own email, so no separate token is needed. The reply is always the
 * same page whether or not the id matched, so the endpoint cannot be used to
 * test whether an address is on the list.
 */
function page(title: string, message: string, storeUrl: string): Response {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#faf8f5;color:#1f3f37">
<main style="max-width:32rem;margin:0 auto;padding:4rem 1.5rem;text-align:center">
<h1 style="font-size:1.5rem;margin:0 0 .75rem">${esc(title)}</h1>
<p style="margin:0 0 1.5rem;line-height:1.6">${esc(message)}</p>
${storeUrl ? `<a href="${esc(storeUrl)}" style="display:inline-block;padding:.65rem 1.25rem;border-radius:999px;background:#1f3f37;color:#fff;text-decoration:none">Back to the shop</a>` : ""}
</main></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  )
}

export async function GET(request: NextRequest) {
  const storeUrl = (process.env.STOREFRONT_URL || "").replace(/\/+$/, "")
  const id = (request.nextUrl.searchParams.get("id") || "").slice(0, 100)

  if (id) {
    try {
      await (await db())
        .prepare("UPDATE newsletter_subscriber SET status = 'unsubscribed' WHERE id = ?1")
        .bind(id)
        .run()
    } catch {
      // Still answer the same way: the sender must never learn which ids exist.
    }
  }

  return page(
    "You have been unsubscribed",
    "You will no longer receive our newsletter. If this was a mistake you can sign up again from the shop at any time.",
    storeUrl
  )
}
