"use client"

import { Trash } from "@medusajs/icons"
import { Button, Drawer, IconButton, Input, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

export type CatalogSettings = {
  units: string[]
  optionPresets: string[]
  descriptionTemplates: { name: string; html: string }[]
}

export type ManageKind = "units" | "optionPresets" | "descriptionTemplates"

const COPY: Record<ManageKind, { title: string; description: string; placeholder: string }> = {
  units: {
    title: "Units",
    description: "How a single product is counted on invoices and the product page, e.g. item, set, volume.",
    placeholder: "e.g. set",
  },
  optionPresets: {
    title: "Saved values",
    description: "Variant values you use often. They appear as suggestions when you add a variant.",
    placeholder: "e.g. Hardcover",
  },
  descriptionTemplates: {
    title: "Description templates",
    description: "Reusable starting points for product descriptions. HTML is allowed.",
    placeholder: "Template name",
  },
}

export function ManageDrawer({
  kind,
  settings,
  onClose,
  onSave,
}: {
  kind: ManageKind | null
  settings: CatalogSettings | null
  onClose: () => void
  onSave: (next: CatalogSettings) => Promise<unknown>
}) {
  const [items, setItems] = useState<string[]>([])
  const [templates, setTemplates] = useState<{ name: string; html: string }[]>([])
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (kind && settings) {
      setItems(kind === "descriptionTemplates" ? [] : [...settings[kind]])
      setTemplates(settings.descriptionTemplates.map((t) => ({ ...t })))
      setDraft("")
    }
  }, [kind, settings])

  if (!kind || !settings) {
    return null
  }
  const copy = COPY[kind]
  const isTemplates = kind === "descriptionTemplates"

  const add = () => {
    const value = draft.trim()
    if (!value) {
      return
    }
    if (isTemplates) {
      setTemplates((t) => [...t, { name: value, html: "<p></p>" }])
    } else if (!items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      setItems((i) => [...i, value])
    }
    setDraft("")
  }

  const save = async () => {
    setSaving(true)
    try {
      const cleaned = isTemplates
        ? { descriptionTemplates: templates.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), html: t.html })) }
        : { [kind]: items.map((i) => i.trim()).filter(Boolean) }
      await onSave({ ...settings, ...cleaned })
      toast.success(`${copy.title} saved`)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open onOpenChange={(open) => (open ? null : onClose())}>
      <Drawer.Content className={isTemplates ? "max-w-2xl" : undefined}>
        <Drawer.Header>
          <Drawer.Title>{copy.title}</Drawer.Title>
          <Drawer.Description>{copy.description}</Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-4 overflow-y-auto">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <Input size="small" placeholder={copy.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <Button size="small" variant="secondary" type="submit" disabled={!draft.trim()}>
              Add
            </Button>
          </form>

          {isTemplates ? (
            <div className="flex flex-col gap-4">
              {templates.map((t, i) => (
                <div key={i} className="border-ui-border-base flex flex-col gap-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      size="small"
                      value={t.name}
                      onChange={(e) => setTemplates((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <IconButton
                      size="small"
                      variant="transparent"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => setTemplates((all) => all.filter((_, j) => j !== i))}
                    >
                      <Trash />
                    </IconButton>
                  </div>
                  <Textarea
                    rows={5}
                    className="font-mono text-xs"
                    value={t.html}
                    onChange={(e) => setTemplates((all) => all.map((x, j) => (j === i ? { ...x, html: e.target.value } : x)))}
                  />
                </div>
              ))}
              {!templates.length ? <Text size="small" className="text-ui-fg-subtle">No templates yet.</Text> : null}
            </div>
          ) : (
            <ul className="divide-ui-border-base border-ui-border-base divide-y rounded-lg border">
              {items.map((item, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                  <Input
                    size="small"
                    className="border-0 shadow-none"
                    value={item}
                    onChange={(e) => setItems((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <IconButton
                    size="small"
                    variant="transparent"
                    aria-label={`Delete ${item}`}
                    onClick={() => setItems((all) => all.filter((_, j) => j !== i))}
                  >
                    <Trash />
                  </IconButton>
                </li>
              ))}
              {!items.length ? (
                <li className="px-3 py-3">
                  <Text size="small" className="text-ui-fg-subtle">Nothing here yet.</Text>
                </li>
              ) : null}
            </ul>
          )}
        </Drawer.Body>
        <Drawer.Footer>
          <Button size="small" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="small" isLoading={saving} onClick={save}>
            Save
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
