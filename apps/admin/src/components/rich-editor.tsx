"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const ICON = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

const Icons = {
  ul: <svg {...ICON}><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4.5" cy="6" r="1.5" fill="currentColor" /><circle cx="4.5" cy="12" r="1.5" fill="currentColor" /><circle cx="4.5" cy="18" r="1.5" fill="currentColor" /></svg>,
  ol: <svg {...ICON}><line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" /><path d="M4 4h1v4" strokeWidth="1.6" /><path d="M3.5 11.5h2l-2 3h2" strokeWidth="1.6" /><path d="M3.5 17h2v1.2h-1.4h1.4V20h-2" strokeWidth="1.6" /></svg>,
  quote: <svg {...ICON}><path d="M7 7H4v5h4V9c0 2-1 3-2.5 3.5" /><path d="M17 7h-3v5h4V9c0 2-1 3-2.5 3.5" /></svg>,
  alignLeft: <svg {...ICON}><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="18" y2="18" /></svg>,
  alignCenter: <svg {...ICON}><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="5" y1="18" x2="19" y2="18" /></svg>,
  alignRight: <svg {...ICON}><line x1="4" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="6" y1="18" x2="20" y2="18" /></svg>,
  link: <svg {...ICON}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" /></svg>,
  image: <svg {...ICON}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 15-5-5L5 20" /></svg>,
  hr: <svg {...ICON}><line x1="4" y1="12" x2="20" y2="12" /></svg>,
  undo: <svg {...ICON}><path d="M3 7v6h6" /><path d="M3.5 13a9 9 0 1 0 2.5-6.4L3 9" /></svg>,
  redo: <svg {...ICON}><path d="M21 7v6h-6" /><path d="M20.5 13A9 9 0 1 1 18 6.6L21 9" /></svg>,
  clear: <svg {...ICON}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" /></svg>,
}

function exec(command: string, value?: string) {
  document.execCommand(command, false, value)
}

export function RichEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)
  const [active, setActive] = useState<Record<string, boolean>>({})
  const [empty, setEmpty] = useState(true)

  // The editor is uncontrolled: React writes its HTML once, then the browser
  // owns it. Re-rendering the body would collapse the caret on every keystroke.
  useEffect(() => {
    if (mounted.current || !bodyRef.current) return
    mounted.current = true
    bodyRef.current.innerHTML = value || ""
    setEmpty(!bodyRef.current.textContent?.trim() && !bodyRef.current.querySelector("img, hr"))
    try {
      exec("defaultParagraphSeparator", "p")
    } catch {
      // Not supported everywhere; Enter still works.
    }
  }, [value])

  const refreshActive = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    const sel = document.getSelection()
    if (!sel?.anchorNode || !el.contains(sel.anchorNode)) return
    const state: Record<string, boolean> = {}
    for (const c of ["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList", "justifyLeft", "justifyCenter", "justifyRight"]) {
      try {
        state[c] = document.queryCommandState(c)
      } catch {
        state[c] = false
      }
    }
    const node = sel.anchorNode.nodeType === 1 ? (sel.anchorNode as Element) : sel.anchorNode.parentElement
    state.h2 = Boolean(node?.closest("h2"))
    state.h3 = Boolean(node?.closest("h3"))
    state.blockquote = Boolean(node?.closest("blockquote"))
    setActive(state)
  }, [])

  useEffect(() => {
    document.addEventListener("selectionchange", refreshActive)
    return () => document.removeEventListener("selectionchange", refreshActive)
  }, [refreshActive])

  const emit = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    setEmpty(!el.textContent?.trim() && !el.querySelector("img, hr"))
    onChange(el.innerHTML)
  }, [onChange])

  const run = useCallback((command: string, val?: string) => {
    bodyRef.current?.focus()
    exec(command, val)
    emit()
    refreshActive()
  }, [emit, refreshActive])

  const toggleBlock = useCallback((tag: string) => {
    const sel = document.getSelection()
    const node = sel?.anchorNode?.nodeType === 1 ? (sel.anchorNode as Element) : sel?.anchorNode?.parentElement
    const inside = node?.closest(tag)
    run("formatBlock", inside ? "<p>" : `<${tag}>`)
  }, [run])

  const addLink = useCallback(() => {
    const sel = document.getSelection()
    const node = sel?.anchorNode?.nodeType === 1 ? (sel.anchorNode as Element) : sel?.anchorNode?.parentElement
    const current = node?.closest("a")?.getAttribute("href") || ""
    const url = window.prompt("Link URL (leave blank to remove):", current)
    if (url === null) return
    run(url.trim() ? "createLink" : "unlink", url.trim() || undefined)
  }, [run])

  const insertFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      bodyRef.current?.focus()
      exec("insertImage", String(reader.result))
      emit()
    }
    reader.readAsDataURL(file)
  }, [emit])

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          insertFile(file)
          return
        }
      }
    }
  }, [insertFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"))
    if (file) {
      e.preventDefault()
      insertFile(file)
    }
  }, [insertFile])

  // mousedown is prevented so the caret stays where the writer put it.
  const Btn = ({ cmd, title, on, children }: { cmd?: string; title: string; on?: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={cmd ? Boolean(active[cmd]) : undefined}
      className={`mr-rte-btn${cmd && active[cmd] ? " is-active" : ""}`}
      onMouseDown={(e) => {
        e.preventDefault()
        if (on) on()
        else if (cmd) run(cmd)
      }}
    >
      {children}
    </button>
  )

  return (
    <div className="mr-rte">
      <div className="mr-rte-toolbar" role="toolbar" aria-label="Formatting">
        <Btn cmd="bold" title="Bold"><b>B</b></Btn>
        <Btn cmd="italic" title="Italic"><i>I</i></Btn>
        <Btn cmd="underline" title="Underline"><u>U</u></Btn>
        <Btn cmd="strikeThrough" title="Strikethrough"><s>S</s></Btn>

        <span className="mr-rte-sep" />

        <Btn cmd="h2" title="Heading" on={() => toggleBlock("h2")}><b>H</b></Btn>
        <Btn cmd="h3" title="Subheading" on={() => toggleBlock("h3")}><b>H<sub>2</sub></b></Btn>

        <span className="mr-rte-sep" />

        <Btn cmd="insertUnorderedList" title="Bulleted list">{Icons.ul}</Btn>
        <Btn cmd="insertOrderedList" title="Numbered list">{Icons.ol}</Btn>
        <Btn cmd="blockquote" title="Quote" on={() => toggleBlock("blockquote")}>{Icons.quote}</Btn>

        <span className="mr-rte-sep" />

        <Btn cmd="justifyLeft" title="Align left">{Icons.alignLeft}</Btn>
        <Btn cmd="justifyCenter" title="Align centre">{Icons.alignCenter}</Btn>
        <Btn cmd="justifyRight" title="Align right">{Icons.alignRight}</Btn>

        <span className="mr-rte-sep" />

        <Btn title="Insert link" on={addLink}>{Icons.link}</Btn>
        <Btn title="Insert image" on={() => fileRef.current?.click()}>{Icons.image}</Btn>
        <Btn title="Divider" on={() => run("insertHorizontalRule")}>{Icons.hr}</Btn>

        <span className="mr-rte-sep" />

        <Btn title="Undo" on={() => run("undo")}>{Icons.undo}</Btn>
        <Btn title="Redo" on={() => run("redo")}>{Icons.redo}</Btn>
        <Btn title="Clear formatting" on={() => run("removeFormat")}>{Icons.clear}</Btn>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) insertFile(file)
        e.target.value = ""
      }} />

      <div
        ref={bodyRef}
        className="mr-rte-body"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        data-empty={empty ? "true" : undefined}
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        onDrop={onDrop}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        suppressContentEditableWarning
      />
    </div>
  )
}
