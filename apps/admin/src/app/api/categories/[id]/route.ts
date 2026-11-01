import { NextResponse, type NextRequest } from "next/server"
import { DEFAULT_SETTINGS, withDefaults, type D1, type NavigationSettings } from "@maktabah/db"
import { db } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)

/**
 * Menu links point at a category by handle (/books?category=hadith), and the
 * two are stored apart, so renaming a handle would silently break every menu
 * item and dropdown link aimed at it. Rewriting them here keeps the pair in
 * step - which is what someone editing a category expects to happen.
 */
async function repointMenus(d: D1, from: string, to: string) {
  const row = await d.prepare(`SELECT value FROM store_setting WHERE key = 'navigation'`).first<{ value: string }>()
  let saved: unknown = null
  try {
    saved = row?.value ? JSON.parse(String(row.value)) : null
  } catch {
    return
  }
  const nav = (withDefaults("navigation", saved) ?? DEFAULT_SETTINGS.navigation) as NavigationSettings
  let touched = false
  const swap = (href: string) => {
    const next = href.replace(
      new RegExp(`([?&]category=)${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=&|$)`, "g"),
      `$1${to}`
    )
    if (next !== href) touched = true
    return next
  }

  const items = nav.items.map((item) => ({
    ...item,
    href: swap(item.href),
    columns: item.columns?.map((col) => ({
      ...col,
      href: col.href ? swap(col.href) : col.href,
      links: col.links.map((l) => ({ ...l, href: swap(l.href) })),
    })),
  }))
  const footerLinks = nav.footerLinks.map((l) => ({ ...l, href: swap(l.href) }))

  if (!touched) return
  await d
    .prepare(
      `INSERT INTO store_setting (key, value) VALUES ('navigation', ?1)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .bind(JSON.stringify({ ...nav, items, footerLinks }))
    .run()
}

/** PUT /api/categories/[id] — rename, re-handle, re-parent, show or hide. */
export async function PUT(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const body = (await request.json()) as {
    name?: string
    handle?: string
    parent_id?: string | null
    is_active?: boolean
    rank?: number
  }

  const d = await db()
  const current = await d
    .prepare(`SELECT id, handle FROM category WHERE id = ?1`)
    .bind(id)
    .first<{ id: string; handle: string }>()
  if (!current) {
    return NextResponse.json({ message: "That category no longer exists." }, { status: 404 })
  }

  const sets: string[] = []
  const binds: unknown[] = []
  const put = (column: string, value: unknown) => {
    if (value !== undefined) {
      binds.push(value)
      sets.push(`${column} = ?${binds.length}`)
    }
  }

  const name = body.name?.trim()
  if (body.name !== undefined && !name) {
    return NextResponse.json({ message: "Enter a category name." }, { status: 400 })
  }
  put("name", name)

  let nextHandle: string | null = null
  if (body.handle !== undefined) {
    nextHandle = slug(body.handle)
    if (!nextHandle) {
      return NextResponse.json({ message: "Enter a web address for the category." }, { status: 400 })
    }
    const clash = await d
      .prepare(`SELECT id FROM category WHERE handle = ?1 AND id <> ?2`)
      .bind(nextHandle, id)
      .first()
    if (clash) {
      return NextResponse.json({ message: "Another category already uses that web address." }, { status: 409 })
    }
    put("handle", nextHandle)
  }

  if (body.parent_id !== undefined) {
    if (body.parent_id === id) {
      return NextResponse.json({ message: "A category cannot sit inside itself." }, { status: 400 })
    }
    // Walking up from the proposed parent must never arrive back here, or the
    // two would point at each other and disappear from every tree that renders.
    let walk: string | null = body.parent_id || null
    for (let hops = 0; walk && hops < 50; hops++) {
      if (walk === id) {
        return NextResponse.json(
          { message: "That would put the category inside one of its own children." },
          { status: 400 }
        )
      }
      const row: { parent_id: string | null } | null = await d
        .prepare(`SELECT parent_id FROM category WHERE id = ?1`)
        .bind(walk)
        .first<{ parent_id: string | null }>()
      walk = row?.parent_id ?? null
    }
    put("parent_id", body.parent_id || null)
  }
  put("is_active", body.is_active === undefined ? undefined : body.is_active ? 1 : 0)
  put("rank", body.rank)

  if (sets.length) {
    binds.push(id)
    await d.prepare(`UPDATE category SET ${sets.join(", ")} WHERE id = ?${binds.length}`).bind(...binds).run()
  }

  if (nextHandle && nextHandle !== current.handle) {
    await repointMenus(d, current.handle, nextHandle)
  }

  return NextResponse.json({ ok: true, handle: nextHandle || current.handle })
}

/** DELETE /api/categories/[id] — removes it and unfiles the books in it. */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const d = await db()

  const kids = await d.prepare(`SELECT id FROM category WHERE parent_id = ?1`).bind(id).first()
  if (kids) {
    return NextResponse.json(
      { message: "Move or delete the categories inside this one first." },
      { status: 409 }
    )
  }

  // product.primary_category_id carries no foreign key, so nothing would clear
  // it on its own and the product would keep pointing at a category that is gone.
  await d.batch([
    d.prepare(`UPDATE product SET primary_category_id = NULL WHERE primary_category_id = ?1`).bind(id),
    d.prepare(`DELETE FROM product_category WHERE category_id = ?1`).bind(id),
    d.prepare(`DELETE FROM category WHERE id = ?1`).bind(id),
  ])

  return NextResponse.json({ ok: true })
}
