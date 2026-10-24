import { NextResponse, type NextRequest } from "next/server"
import { IDENTITY_HEADER, checkAccess } from "@/lib/access"

/** Every page and every API route passes through the Access check. */
export async function middleware(request: NextRequest) {
  const result = await checkAccess(request.headers)

  if (!result.ok) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ message: result.message }, { status: result.status })
    }
    return new NextResponse(lockedPage(result.message), {
      status: result.status,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    })
  }

  const headers = new Headers(request.headers)
  headers.set(IDENTITY_HEADER, encodeURIComponent(JSON.stringify(result.identity)))
  return NextResponse.next({ request: { headers } })
}

function lockedPage(message: string) {
  const text = message.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Maktabah Admin</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef4f1;color:#1d3a35;font:16px/1.5 system-ui,sans-serif}main{max-width:28rem;margin:1rem;padding:2rem;border:1px solid #d6e3de;border-radius:18px;background:#fff;text-align:center}h1{margin:0 0 .5rem;font-size:1.4rem}p{margin:0;color:#4d6862}</style></head><body><main><h1>Sign in required</h1><p>${text}</p></main></body></html>`
}

export const config = {
  matcher: ["/((?!_next/static|favicon.ico).*)"],
}
