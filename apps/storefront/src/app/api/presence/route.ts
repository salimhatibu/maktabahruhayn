import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/db"

/**
 * POST /api/presence — heartbeat, and the count of people on the site.
 *
 * Each browser keeps one row, refreshed on every beat. A row counts while it
 * is fresher than WINDOW, so someone who closes the tab drops out on their
 * own without needing a goodbye that a closing browser may never send.
 */
const COOKIE = "mr_presence"
/** A row counts as live for this long after its last beat. */
const WINDOW = 70
/** Sweeping on every beat would write far more than it saves. */
const SWEEP_CHANCE = 0.1
const SWEEP_AFTER = 60 * 30

export async function POST(request: NextRequest) {
  const now = Math.floor(Date.now() / 1000)
  const existing = request.cookies.get(COOKIE)?.value
  const token = /^[A-Za-z0-9_-]{16,64}$/.test(existing || "") ? (existing as string) : crypto.randomUUID()

  let live = 1
  try {
    const d = await db()
    await d
      .prepare(
        `INSERT INTO presence (token, last_seen) VALUES (?1, ?2)
         ON CONFLICT (token) DO UPDATE SET last_seen = excluded.last_seen`
      )
      .bind(token, now)
      .run()

    const row = await d
      .prepare(`SELECT COUNT(*) AS n FROM presence WHERE last_seen > ?1`)
      .bind(now - WINDOW)
      .first<{ n: number }>()
    live = Math.max(1, Number(row?.n || 1))

    if (Math.random() < SWEEP_CHANCE) {
      await d.prepare(`DELETE FROM presence WHERE last_seen < ?1`).bind(now - SWEEP_AFTER).run()
    }
  } catch {
    // The island is decoration: a database hiccup must not surface as an error.
    live = 1
  }

  const response = NextResponse.json({ live })
  response.cookies.set(COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 6,
  })
  return response
}
