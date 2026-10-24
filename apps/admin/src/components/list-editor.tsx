"use client"

import { ArrowDownMini, ArrowUpMini, Trash } from "@medusajs/icons"
import { Button, IconButton } from "@medusajs/ui"
import type { ReactNode } from "react"

/** Generic ordered list editor: render each row, add, remove, reorder. */
export function ListEditor<T>({
  items,
  onChange,
  render,
  create,
  addLabel,
}: {
  items: T[]
  onChange: (items: T[]) => void
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode
  create: () => T
  addLabel: string
}) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg border border-ui-border-base p-3">
          <div className="flex-1">
            {render(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}
          </div>
          <div className="flex flex-col gap-1">
            <IconButton size="small" variant="transparent" onClick={() => move(i, i - 1)} aria-label="Move up">
              <ArrowUpMini />
            </IconButton>
            <IconButton size="small" variant="transparent" onClick={() => move(i, i + 1)} aria-label="Move down">
              <ArrowDownMini />
            </IconButton>
            <IconButton size="small" variant="transparent" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove">
              <Trash />
            </IconButton>
          </div>
        </div>
      ))}
      <div>
        <Button size="small" variant="secondary" onClick={() => onChange([...items, create()])}>
          {addLabel}
        </Button>
      </div>
    </div>
  )
}
