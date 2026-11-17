"use client"

import { Buildings } from "@medusajs/icons"
import { Button, Input, Select, Text, Textarea, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { ErrorNote, Field, PageHeader, Section } from "@/components/kit"
import { useSettings } from "@/lib/api"

type Business = {
  name: string
  tagline: string
  email: string
  phone: string
  whatsapp: string
  address: string
  instagram: string
  facebook: string
  x: string
}

const CURRENCIES = ["kes", "usd", "gbp", "eur", "aed", "sar", "ugx", "tzs"]

const BusinessPage = () => {
  const business = useSettings<Business>("business")
  const reporting = useSettings<{ currency: string }>("reporting")
  const affiliate = useSettings<{ defaultCommissionPercent: number; cookieDays: number }>("affiliate")
  const [form, setForm] = useState<Business | null>(null)
  const [currency, setCurrency] = useState("kes")
  const [aff, setAff] = useState({ defaultCommissionPercent: 10, cookieDays: 30 })
  useEffect(() => setForm(business.value), [business.value])
  useEffect(() => {
    if (reporting.value) setCurrency(reporting.value.currency)
  }, [reporting.value])
  useEffect(() => {
    if (affiliate.value) setAff(affiliate.value)
  }, [affiliate.value])

  const save = async () => {
    if (!form) return
    if (form.whatsapp && !/^\+?\d{9,15}$/.test(form.whatsapp.replace(/\s/g, ""))) {
      toast.error("WhatsApp number: digits with country code, e.g. +254712345678")
      return
    }
    try {
      await Promise.all([
        business.save({ ...form, whatsapp: form.whatsapp.replace(/\s/g, "") }),
        reporting.save({ currency }),
        affiliate.save({ defaultCommissionPercent: Number(aff.defaultCommissionPercent), cookieDays: Number(aff.cookieDays) }),
      ])
      toast.success("Business details saved")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!form) {
    return <Text>Loading…</Text>
  }

  const set = (k: keyof Business) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  return (
    <div>
      <PageHeader icon={Buildings} tone="slate"
        title="Business Details"
        subtitle="Contact details shown on the storefront and in emails."
        actions={<Button isLoading={business.saving} onClick={save}>Save changes</Button>}
      />
      <ErrorNote message={business.error} />
      <Section title="Store">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Store name">
            <Input value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Support email" hint="Shown in the Help Center and used as the email reply-to">
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Tagline" hint="Shown in the footer">
              <Textarea rows={2} value={form.tagline} onChange={set("tagline")} />
            </Field>
          </div>
          <Field label="Phone">
            <Input value={form.phone} onChange={set("phone")} placeholder="+254 7XX XXX XXX" />
          </Field>
          <Field label="WhatsApp number" hint="Adds a chat button to the storefront (wa.me link)">
            <Input value={form.whatsapp} onChange={set("whatsapp")} placeholder="+254712345678" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Address">
              <Input value={form.address} onChange={set("address")} />
            </Field>
          </div>
        </div>
      </Section>
      <Section title="Social media" description="Full profile URLs, shown in the footer.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Instagram">
            <Input value={form.instagram} onChange={set("instagram")} placeholder="https://instagram.com/…" />
          </Field>
          <Field label="Facebook">
            <Input value={form.facebook} onChange={set("facebook")} />
          </Field>
          <Field label="X (Twitter)">
            <Input value={form.x} onChange={set("x")} />
          </Field>
        </div>
      </Section>
      <Section title="Reporting & affiliates">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Dashboard currency" hint="Totals from all regions are converted into this">
            <Select value={currency} onValueChange={setCurrency}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {CURRENCIES.map((c) => (
                  <Select.Item key={c} value={c}>
                    {c.toUpperCase()}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </Field>
          <Field label="Default affiliate commission %">
            <Input type="number" min={0} max={100} value={aff.defaultCommissionPercent} onChange={(e) => setAff({ ...aff, defaultCommissionPercent: Number(e.target.value) })} />
          </Field>
          <Field label="Affiliate link lasts (days)">
            <Input type="number" min={1} max={365} value={aff.cookieDays} onChange={(e) => setAff({ ...aff, cookieDays: Number(e.target.value) })} />
          </Field>
        </div>
      </Section>
    </div>
  )
}


export default BusinessPage
