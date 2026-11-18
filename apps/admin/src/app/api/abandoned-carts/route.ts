import { getCart } from "@maktabah/db"
import { NextResponse, type NextRequest } from "next/server"
import { listAbandonedCarts } from "@/lib/abandoned-carts"
import { db } from "@/lib/db"

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const rawPage = Number(params.get("page") || 0)
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 ? Math.min(rawPage, 10000) : 0
  const result = await listAbandonedCarts(await db(), getCart, {
    view: params.get("view") === "all" ? "all" : "inactive",
    search: params.get("q") || "",
    page,
    now: new Date(),
  })
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
}
