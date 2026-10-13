"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { isStaleActionError, reloadForStaleAction } from "@/lib/stale-action"

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleActionError(error)
  const [reloading, setReloading] = useState(stale)

  useEffect(() => {
    if (stale && !reloadForStaleAction()) {
      setReloading(false)
    }
  }, [stale])

  if (reloading) {
    return (
      <main className="wrap error-page">
        <p>The shop was just updated. Refreshing the page…</p>
      </main>
    )
  }

  return (
    <main className="wrap error-page">
      <h1>Something went wrong</h1>
      <p>{stale ? "This page is out of date. Please refresh to continue." : "Please try again. If it keeps happening, contact us."}</p>
      <div className="error-page-actions">
        <button type="button" className="btn btn-primary" onClick={() => (stale ? window.location.reload() : reset())}>
          {stale ? "Refresh page" : "Try again"}
        </button>
        <Link href="/" className="btn btn-outline">
          Go to the home page
        </Link>
      </div>
    </main>
  )
}
