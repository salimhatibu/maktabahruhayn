import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"

/** POST /api/validate-handles — returns which product handles still exist. */
export async function POST(request: NextRequest) {
  const { handles } = (await request.json()) as { handles?: string[] }
  if (!handles?.length) {
    return NextResponse.json({ valid: [] })
  }
  const slugs = handles.slice(0, 20)
  const placeholders = slugs.map((_, i) => `?${i + 1}`).join(",")
  const { results } = await (await db())
    .prepare(`SELECT handle FROM product WHERE handle IN (${placeholders})`)
    .bind(...slugs)
    .all<{ handle: string }>()
  return NextResponse.json({ valid: results.map((r) => r.handle) })
}
