"use client"

import { useRouter } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n-shared"
import { GlobeIcon } from "./icons"

export function LanguageSwitcher({ current }: { current: Locale }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [])

  function pick(locale: Locale) {
    document.cookie = `mr_locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="lang-switcher" ref={ref}>
      <button
        type="button"
        className="util-link"
        aria-label="Language"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <GlobeIcon size={20} />
        <span>{LOCALE_LABELS[current]}</span>
      </button>
      {open ? (
        <ul className="lang-menu" role="menu">
          {LOCALES.map((l) => (
            <li key={l} role="menuitem">
              <button
                type="button"
                className={l === current ? "is-active" : ""}
                onClick={() => pick(l)}
              >
                {LOCALE_LABELS[l]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
