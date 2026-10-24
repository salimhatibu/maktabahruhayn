import type { Metadata } from "next"
import Link from "next/link"
import { currentRegion, listShippingCountries } from "@/lib/region-context"
import { RegisterForm } from "../forms"

export const metadata: Metadata = { title: "Create an Account", robots: { index: false } }

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const raw = (await searchParams).next
  const next = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account"
  const [region, countries] = await Promise.all([currentRegion(), Promise.resolve(listShippingCountries())])
  return (
    <main className="wrap auth-page single">
      <section className="panel">
        <h1 className="serif-title">Create an Account</h1>
        <p className="muted auth-lede">Track orders, save addresses and check out in a few taps.</p>
        <RegisterForm next={next} countries={countries} defaultCountry={region.country} />
        <p className="muted center">
          Already have an account? <Link href={`/account/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </p>
      </section>
    </main>
  )
}
