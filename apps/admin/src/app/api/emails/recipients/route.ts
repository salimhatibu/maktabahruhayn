import { NextResponse } from "next/server"
import { db } from "@/lib/db"

/** GET /api/emails/recipients — counts for the bulk-send audience picker. */
export async function GET() {
  const d = await db()
  const [subs, customers, all] = await Promise.all([
    d.prepare("SELECT COUNT(*) as c FROM newsletter_subscriber WHERE status = 'subscribed'").first<{ c: number }>(),
    d.prepare("SELECT COUNT(*) as c FROM customer").first<{ c: number }>(),
    d.prepare(
      `SELECT COUNT(*) as c FROM (
         SELECT email FROM customer
         UNION
         SELECT email FROM newsletter_subscriber WHERE status = 'subscribed'
       )`
    ).first<{ c: number }>(),
  ])

  return NextResponse.json({
    subscribers: subs?.c ?? 0,
    customers: customers?.c ?? 0,
    all: all?.c ?? 0,
  })
}
