"use client"

import { unstable_isUnrecognizedActionError } from "next/navigation"

const KEY = "mr_stale_action_reload"

/** True when the page was built by an older server (e.g. open during a deploy or restart). */
export function isStaleActionError(error: unknown) {
  if (unstable_isUnrecognizedActionError(error)) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error ?? "")
  return /Server Action .* was not found on the server|failed-to-find-server-action/i.test(message)
}

/** Reloads once to pick up the current build. Returns false if a reload was just tried. */
export function reloadForStaleAction() {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 15_000) {
      return false
    }
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* storage unavailable: reload anyway */
  }
  window.location.reload()
  return true
}

/**
 * Runs a Server Action from an event handler. If the page is out of date it
 * reloads instead of throwing, and resolves to undefined.
 */
export async function callAction<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run()
  } catch (error) {
    if (isStaleActionError(error)) {
      reloadForStaleAction()
      return undefined
    }
    throw error
  }
}
