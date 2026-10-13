"use client"

import { useEffect } from "react"
import { isStaleActionError, reloadForStaleAction } from "@/lib/stale-action"

/** Recovers pages that outlived a deploy: an unknown Server Action triggers one reload. */
export function StaleActionGuard() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isStaleActionError(e.reason)) {
        e.preventDefault()
        reloadForStaleAction()
      }
    }
    const onError = (e: ErrorEvent) => {
      if (isStaleActionError(e.error)) {
        e.preventDefault()
        reloadForStaleAction()
      }
    }
    window.addEventListener("unhandledrejection", onRejection)
    window.addEventListener("error", onError)
    return () => {
      window.removeEventListener("unhandledrejection", onRejection)
      window.removeEventListener("error", onError)
    }
  }, [])
  return null
}
