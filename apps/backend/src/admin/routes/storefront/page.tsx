import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingStorefront } from "@medusajs/icons"
import { Button, Input, Select, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { ImageManager } from "../../components/catalog/image-manager"
import { ErrorNote, Field, PageHeader, Section } from "../../components/kit"
import { ListEditor } from "../../components/list-editor"
import { useSettings } from "../../lib/api"

type Promo = { text: string; href: string }
type Slide = {
  kicker: string
  title: string
  text: string
  cta: string
  href: string
  tone: "sky" | "sand" | "green"
  coverTag: string
  images?: string[]
}
type HomeSection = { title: string; source: "tag" | "category" | "sale"; value: string; enabled: boolean }
type Content = { announcement: string; promoMessages: Promo[]; heroSlides: Slide[]; homeSections: HomeSection[]; popularSearches: string[] }

const TAGS = [
  { value: "bestseller", label: "Bestsellers" },
  { value: "new-release", label: "New Arrivals" },
  { value: "staff-pick", label: "Booksellers' Picks" },
  { value: "coming-soon", label: "Pre-Order" },
]

const CATEGORIES = [
  "quran-mushaf",
  "tafsir",
  "hadith",
  "fiqh-aqidah",
  "seerah-history",
  "islamic-living",
  "islamic-education",
  "childrens-books",
  "gifts",
  "marriage-family",
  "women",
  "arabic-books",
]

function TagSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <Select.Trigger>
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        {TAGS.map((t) => (
          <Select.Item key={t.value} value={t.value}>
            {t.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  )
}

const StorefrontPage = () => {
  const settings = useSettings<Content>("content")
  const [form, setForm] = useState<Content | null>(null)
  useEffect(() => setForm(settings.value), [settings.value])

  const save = async () => {
    if (!form) return
    try {
      await settings.save(form)
      toast.success("Storefront content saved. The site updates within a minute.")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!form) {
    return <Text>Loading…</Text>
  }

  return (
    <div>
      <PageHeader icon={BuildingStorefront} tone="teal"
        title="Storefront Content"
        subtitle="The promo bar, home page hero, home page shelves and popular searches."
        actions={<Button isLoading={settings.saving} onClick={save}>Save changes</Button>}
      />
      <ErrorNote message={settings.error} />

      <Section title="Announcement" description="Optional banner above the header (e.g. Eid closing dates). Leave empty to hide.">
        <Input value={form.announcement} onChange={(e) => setForm({ ...form, announcement: e.target.value })} />
      </Section>

      <Section title="Promo bar messages" description="Rotating messages at the very top. The free-shipping and payment messages are added automatically.">
        <ListEditor<Promo>
          items={form.promoMessages}
          onChange={(promoMessages) => setForm({ ...form, promoMessages })}
          create={() => ({ text: "", href: "/" })}
          addLabel="Add message"
          render={(m, update) => (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Text">
                <Input value={m.text} onChange={(e) => update({ text: e.target.value })} />
              </Field>
              <Field label="Link">
                <Input value={m.href} onChange={(e) => update({ href: e.target.value })} />
              </Field>
            </div>
          )}
        />
      </Section>

      <Section title="Hero slides" description="The rotating banner at the top of the home page. Add, remove or reorder the images on each slide.">
        <ListEditor<Slide>
          items={form.heroSlides}
          onChange={(heroSlides) => setForm({ ...form, heroSlides })}
          create={() => ({ kicker: "", title: "", text: "", cta: "Shop Now", href: "/books", tone: "sky", coverTag: "bestseller", images: [] })}
          addLabel="Add slide"
          render={(s, update) => (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Small heading">
                <Input value={s.kicker} onChange={(e) => update({ kicker: e.target.value })} />
              </Field>
              <Field label="Title">
                <Input value={s.title} onChange={(e) => update({ title: e.target.value })} />
              </Field>
              <Field label="Background">
                <Select value={s.tone} onValueChange={(v) => update({ tone: v as Slide["tone"] })}>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="sky">Blush rose</Select.Item>
                    <Select.Item value="sand">Parchment</Select.Item>
                    <Select.Item value="green">Sage</Select.Item>
                  </Select.Content>
                </Select>
              </Field>
              <div className="md:col-span-3">
                <Field label="Text">
                  <Textarea rows={2} value={s.text} onChange={(e) => update({ text: e.target.value })} />
                </Field>
              </div>
              <Field label="Button label">
                <Input value={s.cta} onChange={(e) => update({ cta: e.target.value })} />
              </Field>
              <Field label="Button link">
                <Input value={s.href} onChange={(e) => update({ href: e.target.value })} />
              </Field>
              {s.images?.length ? (
                <div />
              ) : (
                <Field label="No images? Show covers from" hint="Used only while the slide has no images.">
                  <TagSelect value={s.coverTag} onChange={(v) => update({ coverTag: v })} />
                </Field>
              )}
              <div className="md:col-span-3">
                <Text size="small" weight="plus" className="mb-1.5">
                  Slide images
                </Text>
                <Text size="xsmall" className="text-ui-fg-subtle mb-3">
                  Book covers or photos shown on the slide, in this order. Upload new images or choose ones already used on products.
                </Text>
                <ImageManager images={s.images || []} onChange={(images) => update({ images })} max={8} firstLabel="Front" />
              </div>
            </div>
          )}
        />
      </Section>

      <Section title="Home page shelves" description="Book carousels below the hero, in this order.">
        <ListEditor<HomeSection>
          items={form.homeSections}
          onChange={(homeSections) => setForm({ ...form, homeSections })}
          create={() => ({ title: "New shelf", source: "tag", value: "bestseller", enabled: true })}
          addLabel="Add shelf"
          render={(s, update) => (
            <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
              <Field label="Title">
                <Input value={s.title} onChange={(e) => update({ title: e.target.value })} />
              </Field>
              <Field label="Books from">
                <Select value={s.source} onValueChange={(v) => update({ source: v as HomeSection["source"], value: v === "tag" ? "bestseller" : v === "category" ? CATEGORIES[0] : "" })}>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="tag">Collection</Select.Item>
                    <Select.Item value="category">Department</Select.Item>
                    <Select.Item value="sale">Sale items</Select.Item>
                  </Select.Content>
                </Select>
              </Field>
              {s.source === "tag" ? (
                <Field label="Collection">
                  <TagSelect value={s.value} onChange={(v) => update({ value: v })} />
                </Field>
              ) : s.source === "category" ? (
                <Field label="Department">
                  <Select value={s.value} onValueChange={(v) => update({ value: v })}>
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {CATEGORIES.map((c) => (
                        <Select.Item key={c} value={c}>
                          {c}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </Field>
              ) : (
                <div />
              )}
              <label className="flex items-center gap-2 pb-2">
                <Switch checked={s.enabled} onCheckedChange={(v) => update({ enabled: v })} />
                <Text size="small">Visible</Text>
              </label>
            </div>
          )}
        />
      </Section>

      <Section title="Popular searches" description="Suggested under the search box. One per line.">
        <Textarea
          rows={6}
          value={form.popularSearches.join("\n")}
          onChange={(e) => setForm({ ...form, popularSearches: e.target.value.split("\n").map((s) => s.trimStart()) })}
        />
      </Section>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Storefront", icon: BuildingStorefront, rank: 10 })

export default StorefrontPage
