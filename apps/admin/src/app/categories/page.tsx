"use client"

import { ArrowDownMini, ArrowUpMini, Plus, SquaresPlus, Trash } from "@medusajs/icons"
import { Button, Input, Select, StatusBadge, Switch, Table, Text, toast } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { ErrorNote, PageHeader, Section } from "@/components/kit"
import { api, useApi } from "@/lib/api"

type Category = {
  id: string
  handle: string
  name: string
  parent_id: string | null
  rank: number
  is_active: number
  books: number
}

const CategoriesPage = () => {
  const list = useApi<{ categories: Category[] }>("/api/categories")
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState(false)
  const [edits, setEdits] = useState<Record<string, { name: string; handle: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const rows = useMemo(() => list.data?.categories || [], [list.data])

  /** Parents in rank order, each followed by its own children. */
  const tree = useMemo(() => {
    const byParent = new Map<string | null, Category[]>()
    for (const c of rows) {
      const key = c.parent_id && rows.some((r) => r.id === c.parent_id) ? c.parent_id : null
      const list = byParent.get(key) || []
      list.push(c)
      byParent.set(key, list)
    }
    for (const list of byParent.values()) list.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    const out: { cat: Category; depth: number; siblings: Category[] }[] = []
    const walk = (parent: string | null, depth: number) => {
      const siblings = byParent.get(parent) || []
      for (const cat of siblings) {
        out.push({ cat, depth, siblings })
        if (depth < 2) walk(cat.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [rows])

  /** Descendants may not become a category's own parent. */
  const descendantsOf = (id: string) => {
    const out = new Set<string>()
    const walk = (parent: string) => {
      for (const c of rows) {
        if (c.parent_id === parent && !out.has(c.id)) {
          out.add(c.id)
          walk(c.id)
        }
      }
    }
    walk(id)
    return out
  }

  const move = async (cat: Category, siblings: Category[], delta: number) => {
    const order = siblings.map((s) => s.id)
    const at = order.indexOf(cat.id)
    const to = at + delta
    if (at < 0 || to < 0 || to >= order.length) return
    order.splice(to, 0, ...order.splice(at, 1))
    setBusy(cat.id)
    try {
      await api("/api/categories/order", { method: "POST", json: { ids: order } })
      list.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const reparent = async (cat: Category, parentId: string | null) => {
    setBusy(cat.id)
    try {
      await api(`/api/categories/${cat.id}`, { method: "PUT", json: { parent_id: parentId } })
      list.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const valueOf = (c: Category) => edits[c.id] || { name: c.name, handle: c.handle }
  const dirty = (c: Category) => {
    const v = valueOf(c)
    return v.name !== c.name || v.handle !== c.handle
  }

  const edit = (id: string, patch: Partial<{ name: string; handle: string }>) =>
    setEdits((e) => ({ ...e, [id]: { ...(e[id] || rows.find((r) => r.id === id)!), ...patch } }))

  const add = async () => {
    const name = draft.trim()
    if (!name) return
    setAdding(true)
    try {
      await api("/api/categories", { method: "POST", json: { name } })
      toast.success(`Added ${name}`)
      setDraft("")
      list.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const save = async (c: Category) => {
    const v = valueOf(c)
    setBusy(c.id)
    try {
      await api(`/api/categories/${c.id}`, { method: "PUT", json: { name: v.name, handle: v.handle } })
      toast.success(
        v.handle !== c.handle ? "Saved. Menu links pointing here were updated too." : "Saved"
      )
      setEdits((e) => {
        const next = { ...e }
        delete next[c.id]
        return next
      })
      list.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const toggle = async (c: Category, active: boolean) => {
    setBusy(c.id)
    try {
      await api(`/api/categories/${c.id}`, { method: "PUT", json: { is_active: active } })
      list.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (c: Category) => {
    const warning = c.books
      ? `Delete “${c.name}”? ${c.books} book${c.books === 1 ? "" : "s"} will be unfiled from it. The books themselves are kept.`
      : `Delete “${c.name}”? This cannot be undone.`
    if (!window.confirm(warning)) return
    setBusy(c.id)
    try {
      await api(`/api/categories/${c.id}`, { method: "DELETE" })
      toast.success(`Deleted ${c.name}`)
      list.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader
        icon={SquaresPlus}
        tone="gold"
        title="Categories"
        subtitle="The shelves books are filed under. Menus link to these by their web address."
      />
      <ErrorNote message={list.error} />

      <Section title="New category">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              value={draft}
              placeholder="e.g. Arabic Grammar"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
          </div>
          <Button isLoading={adding} disabled={!draft.trim()} onClick={add}>
            <Plus /> Add
          </Button>
        </div>
      </Section>

      <Section
        title="All categories"
        description="Renaming is safe. Changing the web address also repoints any menu link that used the old one. Arrows reorder a category among its own siblings."
        flush
      >
        <div className="mr-scroll-x">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell className="w-16">Order</Table.HeaderCell>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Sits under</Table.HeaderCell>
                <Table.HeaderCell>Web address</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Books</Table.HeaderCell>
                <Table.HeaderCell>Shown</Table.HeaderCell>
                <Table.HeaderCell className="w-32" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {tree.map(({ cat: c, depth, siblings }) => {
                const v = valueOf(c)
                const at = siblings.findIndex((s) => s.id === c.id)
                const blocked = descendantsOf(c.id)
                return (
                  <Table.Row key={c.id}>
                    <Table.Cell>
                      <div className="flex items-center">
                        <button
                          type="button"
                          className="text-ui-fg-subtle hover:text-ui-fg-base disabled:opacity-30 rounded p-0.5"
                          aria-label={`Move ${c.name} up`}
                          disabled={at <= 0 || busy === c.id}
                          onClick={() => move(c, siblings, -1)}
                        >
                          <ArrowUpMini />
                        </button>
                        <button
                          type="button"
                          className="text-ui-fg-subtle hover:text-ui-fg-base disabled:opacity-30 rounded p-0.5"
                          aria-label={`Move ${c.name} down`}
                          disabled={at < 0 || at >= siblings.length - 1 || busy === c.id}
                          onClick={() => move(c, siblings, 1)}
                        >
                          <ArrowDownMini />
                        </button>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div style={{ paddingLeft: depth * 20 }} className="flex items-center gap-1.5">
                        {depth ? <span className="text-ui-fg-muted select-none">└</span> : null}
                        <Input size="small" value={v.name} onChange={(e) => edit(c.id, { name: e.target.value })} />
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Select
                        size="small"
                        value={c.parent_id || "__none__"}
                        onValueChange={(next) => reparent(c, next === "__none__" ? null : next)}
                      >
                        <Select.Trigger aria-label={`Parent of ${c.name}`}>
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="__none__">Top level</Select.Item>
                          {rows
                            .filter((o) => o.id !== c.id && !blocked.has(o.id))
                            .map((o) => (
                              <Select.Item key={o.id} value={o.id}>
                                {o.name}
                              </Select.Item>
                            ))}
                        </Select.Content>
                      </Select>
                    </Table.Cell>
                    <Table.Cell>
                      <Input
                        size="small"
                        value={v.handle}
                        aria-label={`Web address for ${c.name}`}
                        onChange={(e) => edit(c.id, { handle: e.target.value })}
                      />
                    </Table.Cell>
                    <Table.Cell className="text-right">
                      {c.books ? c.books : <span className="text-ui-fg-muted">—</span>}
                    </Table.Cell>
                    <Table.Cell>
                      {c.is_active ? (
                        <StatusBadge color="green">Shown</StatusBadge>
                      ) : (
                        <StatusBadge color="grey">Hidden</StatusBadge>
                      )}
                      <Switch
                        className="ml-2 align-middle"
                        checked={Boolean(c.is_active)}
                        disabled={busy === c.id}
                        onCheckedChange={(on) => toggle(c, on)}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center justify-end gap-1">
                        {dirty(c) ? (
                          <Button size="small" isLoading={busy === c.id} onClick={() => save(c)}>
                            Save
                          </Button>
                        ) : null}
                        <button
                          type="button"
                          className="text-ui-fg-subtle hover:text-ui-fg-base rounded p-1"
                          title={`Delete ${c.name}`}
                          onClick={() => remove(c)}
                        >
                          <Trash />
                        </button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
              {list.data && !rows.length ? (
                <Table.Row>
                  <Table.Cell>
                    <Text className="text-ui-fg-subtle py-8">No categories yet.</Text>
                  </Table.Cell>
                  <Table.Cell />
                  <Table.Cell />
                  <Table.Cell />
                  <Table.Cell />
                  <Table.Cell />
                  <Table.Cell />
                </Table.Row>
              ) : null}
            </Table.Body>
          </Table>
        </div>
      </Section>
    </div>
  )
}

export default CategoriesPage
