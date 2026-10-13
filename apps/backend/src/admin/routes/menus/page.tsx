import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ListBullet } from "@medusajs/icons"
import { Button, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { ErrorNote, Field, PageHeader, Section } from "../../components/kit"
import { ListEditor } from "../../components/list-editor"
import { useSettings } from "../../lib/api"

type NavLink = { label: string; href: string }
type NavColumn = { heading: string; href?: string; links: NavLink[] }
type NavItem = { label: string; href: string; columns?: NavColumn[] }
type Navigation = { items: NavItem[]; footerLinks: NavLink[] }

function LinksEditor({ links, onChange }: { links: NavLink[]; onChange: (l: NavLink[]) => void }) {
  return (
    <ListEditor<NavLink>
      items={links}
      onChange={onChange}
      create={() => ({ label: "", href: "/" })}
      addLabel="Add link"
      render={(l, update) => (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Label" value={l.label} onChange={(e) => update({ label: e.target.value })} />
          <Input placeholder="/books?category=hadith" value={l.href} onChange={(e) => update({ href: e.target.value })} />
        </div>
      )}
    />
  )
}

const MenusPage = () => {
  const settings = useSettings<Navigation>("navigation")
  const [form, setForm] = useState<Navigation | null>(null)
  useEffect(() => setForm(settings.value), [settings.value])

  const save = async () => {
    if (!form) return
    try {
      await settings.save(form)
      toast.success("Menus saved")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!form) {
    return <Text>Loading…</Text>
  }

  return (
    <div>
      <PageHeader icon={ListBullet} tone="teal"
        title="Menus"
        subtitle="The category bar and its dropdown panels, and the footer help links."
        actions={<Button isLoading={settings.saving} onClick={save}>Save changes</Button>}
      />
      <ErrorNote message={settings.error} />
      <Section title="Main menu" description="Top-level items in order. Add columns to give an item a dropdown panel.">
        <ListEditor<NavItem>
          items={form.items}
          onChange={(items) => setForm({ ...form, items })}
          create={() => ({ label: "New item", href: "/books" })}
          addLabel="Add menu item"
          render={(item, update) => (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Label">
                  <Input value={item.label} onChange={(e) => update({ label: e.target.value })} />
                </Field>
                <Field label="Link">
                  <Input value={item.href} onChange={(e) => update({ href: e.target.value })} />
                </Field>
              </div>
              <Text size="small" weight="plus">Dropdown columns</Text>
              <ListEditor<NavColumn>
                items={item.columns || []}
                onChange={(columns) => update({ columns: columns.length ? columns : undefined })}
                create={() => ({ heading: "Column", links: [] })}
                addLabel="Add column"
                render={(col, updateCol) => (
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Heading" value={col.heading} onChange={(e) => updateCol({ heading: e.target.value })} />
                      <Input placeholder="Heading link (optional)" value={col.href || ""} onChange={(e) => updateCol({ href: e.target.value || undefined })} />
                    </div>
                    <LinksEditor links={col.links} onChange={(links) => updateCol({ links })} />
                  </div>
                )}
              />
            </div>
          )}
        />
      </Section>
      <Section title="Footer help links">
        <LinksEditor links={form.footerLinks} onChange={(footerLinks) => setForm({ ...form, footerLinks })} />
      </Section>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Menus", icon: ListBullet, rank: 11 })

export default MenusPage
