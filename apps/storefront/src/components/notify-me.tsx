"use client"

import { useState } from "react"
import { BellIcon } from "./icons"

export function NotifyMe({ productId, variantId }: { productId: string; variantId?: string }) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [message, setMessage] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setStatus("loading")
    try {
      const res = await fetch("/api/stock-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, variant_id: variantId || null, email: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Something went wrong")
      setStatus("done")
      setMessage(data.message)
    } catch (err) {
      setStatus("error")
      setMessage((err as Error).message)
    }
  }

  if (status === "done") {
    return (
      <div className="notify-me notify-me-done">
        <BellIcon size={20} />
        <p>{message}</p>
      </div>
    )
  }

  return (
    <form className="notify-me" onSubmit={submit}>
      <p className="notify-me-label">
        <BellIcon size={18} />
        Get notified when this item is back in stock
      </p>
      <div className="notify-me-row">
        <input
          type="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={status === "loading"}>
          {status === "loading" ? "Saving…" : "Notify Me"}
        </button>
      </div>
      {status === "error" ? <p className="form-error">{message}</p> : null}
    </form>
  )
}
