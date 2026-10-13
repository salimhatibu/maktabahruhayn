import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getCustomer } from "@/lib/auth"
import { LoginForm } from "../forms"

export const metadata: Metadata = { title: "Sign In", robots: { index: false } }

function safe(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account"
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safe((await searchParams).next)
  if (await getCustomer().catch(() => null)) {
    redirect(next)
  }
  return (
    <main className="wrap auth-page">
      <section className="panel">
        <h1 className="serif-title">Sign In</h1>
        <p className="muted">Track orders, write reviews, and check out faster.</p>
        <LoginForm next={next} />
      </section>
      <section className="panel">
        <h2 className="serif-title">New here?</h2>
        <p>Create an account to see your order history and save your details for next time.</p>
        <Link href={`/account/register?next=${encodeURIComponent(next)}`} className="btn btn-outline btn-block">
          Create an Account
        </Link>
      </section>
    </main>
  )
}
