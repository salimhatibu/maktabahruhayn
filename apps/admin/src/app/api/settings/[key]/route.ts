import { NextResponse, type NextRequest } from "next/server"
import { DEFAULT_SETTINGS, withDefaults, type SettingsKey } from "@maktabah/db"
import { db } from "@/lib/db"

/**
 * GET/POST /api/settings/:key
 *
 * One JSON document per section (business, theme, content, navigation, ...),
 * exactly as the previous admin read and wrote them. Unknown sections are
 * refused rather than silently created.
 */
function sectionOf(key: string): SettingsKey {
  if (!(key in DEFAULT_SETTINGS)) {
    throw new Error(`Unknown settings section "${key}"`)
  }
  return key as SettingsKey
}

export async function GET(_request: NextRequest, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params
  let section: SettingsKey
  try {
    section = sectionOf(key)
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 404 })
  }

  const row = await (await db())
    .prepare(`SELECT value FROM store_setting WHERE key = ?1`)
    .bind(section)
    .first<{ value: string }>()

  let saved: unknown = null
  try {
    saved = row ? JSON.parse(row.value) : null
  } catch {
    saved = null
  }
  return NextResponse.json({ key: section, value: withDefaults(section, saved), defaults: DEFAULT_SETTINGS[section] })
}

export async function POST(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params
  let section: SettingsKey
  try {
    section = sectionOf(key)
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 404 })
  }

  const body = (await request.json()) as { value?: Record<string, unknown> }
  const value = withDefaults(section, body.value ?? null)

  await (await db())
    .prepare(
      `INSERT INTO store_setting (key, value) VALUES (?1, ?2)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    )
    .bind(section, JSON.stringify(value))
    .run()

  return NextResponse.json({ key: section, value })
}
