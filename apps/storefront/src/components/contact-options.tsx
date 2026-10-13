"use client"

import { useEffect, useRef, useState } from "react"
import { CloseIcon, PhoneIcon } from "./icons"

type Contact = { phone: string; email: string; whatsapp: string; instagram: string; name: string }

function CopyRow({ label, value, href }: { label: string; value: string; href: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <li className="contact-row">
      <span className="contact-label">{label}</span>
      <a href={href}>{value}</a>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1800)
          } catch {
            // Clipboard blocked; the link still works.
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </li>
  )
}

/** "Contact Options" dialog: phone and email with copy buttons, WhatsApp, Instagram. */
export function ContactOptions({ contact, label = "Contact Us", className = "util-link" }: { contact: Contact; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  const wa = contact.whatsapp.replace(/\D/g, "")
  if (!contact.phone && !contact.email && !wa) {
    return null
  }
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <PhoneIcon size={20} />
        <span>{label}</span>
      </button>
      <dialog ref={ref} className="contact-dialog" onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && setOpen(false)}>
        {open ? (
          <div className="contact-body">
            <button type="button" className="icon-btn contact-close" onClick={() => setOpen(false)} aria-label="Close">
              <CloseIcon />
            </button>
            <p className="ornament-kicker">Contact Options</p>
            <h2 className="serif-title">We&apos;d love to hear from you</h2>
            <ul className="contact-list">
              {contact.phone ? <CopyRow label="Phone" value={contact.phone} href={`tel:${contact.phone.replace(/\s/g, "")}`} /> : null}
              {contact.email ? <CopyRow label="Email" value={contact.email} href={`mailto:${contact.email}`} /> : null}
            </ul>
            <div className="contact-actions">
              {wa ? (
                <a className="btn btn-whatsapp" href={`https://wa.me/${wa}?text=${encodeURIComponent(`Assalamu alaikum ${contact.name}, `)}`} target="_blank" rel="noopener noreferrer">
                  Message on WhatsApp
                </a>
              ) : null}
              {/^https?:\/\//.test(contact.instagram) ? (
                <a className="btn btn-outline" href={contact.instagram} target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  )
}
