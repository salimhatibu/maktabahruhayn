import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Swatch } from "@medusajs/icons"
import { Button, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { ErrorNote, Field, PageHeader, Section } from "../../components/kit"
import { useSettings } from "../../lib/api"

type Theme = { brand: string; brandDark: string; accent: string; rose: string; promoBar: string; footer: string }

const FIELDS: { key: keyof Theme; label: string; hint: string }[] = [
  { key: "brand", label: "Brand color", hint: "Buttons, links, search button" },
  { key: "brandDark", label: "Brand hover", hint: "Buttons on hover" },
  { key: "accent", label: "Gold accent", hint: "Ornaments, rules and stars" },
  { key: "rose", label: "Rose", hint: "Author links, sale prices and highlights" },
  { key: "promoBar", label: "Promo bar", hint: "Top announcement bar" },
  { key: "footer", label: "Footer", hint: "Footer background" },
]

const AppearancePage = () => {
  const settings = useSettings<Theme>("theme")
  const [form, setForm] = useState<Theme | null>(null)
  useEffect(() => setForm(settings.value), [settings.value])

  const save = async () => {
    if (!form) return
    if (Object.values(form).some((v) => !/^#[0-9a-fA-F]{6}$/.test(v))) {
      toast.error("Use six-digit hex colors like #0f5470")
      return
    }
    try {
      await settings.save(form)
      toast.success("Theme saved")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!form) {
    return <Text>Loading…</Text>
  }

  return (
    <div>
      <PageHeader icon={Swatch} tone="teal"
        title="Appearance"
        subtitle="Storefront colors. Changes appear on the site within a minute."
        actions={
          <div className="flex gap-2">
            {settings.defaults ? (
              <Button variant="secondary" onClick={() => setForm(settings.defaults)}>
                Reset to defaults
              </Button>
            ) : null}
            <Button isLoading={settings.saving} onClick={save}>
              Save theme
            </Button>
          </div>
        }
      />
      <ErrorNote message={settings.error} />
      <Section title="Colors">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border border-ui-border-base bg-transparent"
                  aria-label={f.label}
                />
                <Input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            </Field>
          ))}
        </div>
      </Section>
      <Section title="Preview">
        <div className="overflow-hidden rounded-lg border border-ui-border-base">
          <div style={{ background: form.promoBar }} className="px-4 py-1.5 text-center text-xs font-semibold text-white">
            Free Standard Shipping on Orders of KES 7,500 or More
          </div>
          <div className="flex items-center gap-6 bg-white px-6 py-4">
            <span className="text-lg font-semibold uppercase tracking-[0.16em] text-neutral-800">
              <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", textTransform: "none", letterSpacing: "0.02em", fontSize: "1.6rem", color: form.brand }}>
                Maktabah Ruhayn
              </span>
              <span style={{ color: form.rose, marginLeft: "1rem", fontSize: "0.85rem", letterSpacing: 0, textTransform: "none" }}>Imam an-Nawawi</span>
            </span>
            <span className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-400">Search by Title, Author…</span>
            <span style={{ background: form.brand }} className="rounded px-4 py-2 text-sm font-semibold text-white">
              Add to Cart
            </span>
          </div>
          <div style={{ background: form.footer, borderTop: `3px double ${form.accent}` }} className="px-6 py-4 text-sm text-neutral-200">
            Footer
          </div>
        </div>
      </Section>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Appearance", icon: Swatch, rank: 12 })

export default AppearancePage
