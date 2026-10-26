"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"

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

const MARKS = ["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList", "justifyLeft", "justifyCenter", "justifyRight"]

function exec(command: string, value?: string) {
  document.execCommand(command, false, value)
}

function selectedElement(): Element | null {
  const sel = document.getSelection()
  const node = sel?.anchorNode
  if (!node) return null
  return node.nodeType === 1 ? (node as Element) : node.parentElement
}

type Cmd = (command: string, value?: string) => void

/**
 * Lives apart from the editor body on purpose: it re-renders on every caret
 * move, and a re-render that reached the contenteditable would drop the
 * selection the writer just made.
 */
const Toolbar = memo(function Toolbar({
  bodyRef,
  run,
  onPickImage,
}: {
  bodyRef: React.RefObject<HTMLDivElement | null>
  run: Cmd
  onPickImage: () => void
}) {
  const [active, setActive] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const refresh = () => {
      const el = bodyRef.current
      const sel = document.getSelection()
      if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return
      const state: Record<string, boolean> = {}
      for (const c of MARKS) {
        try {
          state[c] = document.queryCommandState(c)
        } catch {
          state[c] = false
        }
      }
      const node = selectedElement()
      state.h2 = Boolean(node?.closest("h2"))
      state.h3 = Boolean(node?.closest("h3"))
      state.blockquote = Boolean(node?.closest("blockquote"))
      setActive((prev) => (MARKS.concat(["h2", "h3", "blockquote"]).every((k) => prev[k] === state[k]) ? prev : state))
    }
    document.addEventListener("selectionchange", refresh)
    return () => document.removeEventListener("selectionchange", refresh)
  }, [bodyRef])

  const toggleBlock = useCallback((tag: string) => {
    run("formatBlock", selectedElement()?.closest(tag) ? "<p>" : `<${tag}>`)
  }, [run])

  const addLink = useCallback(() => {
    const current = selectedElement()?.closest("a")?.getAttribute("href") || ""
    const url = window.prompt("Link URL (leave blank to remove):", current)
    if (url === null) return
    const trimmed = url.trim()
    run(trimmed ? "createLink" : "unlink", trimmed || undefined)
  }, [run])

  const Btn = ({ k, title, on, children }: { k?: string; title: string; on?: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={k ? Boolean(active[k]) : undefined}
      className={`mr-rte-btn${k && active[k] ? " is-active" : ""}`}
      onMouseDown={(e) => {
        // Keeps the caret where the writer left it; without this the button
        // takes focus and the selection collapses.
        e.preventDefault()
        if (on) on()
        else if (k) run(k)
      }}
    >
      {children}
    </button>
  )

  return (
    <div className="mr-rte-toolbar" role="toolbar" aria-label="Formatting">
      <Btn k="bold" title="Bold"><b>B</b></Btn>
      <Btn k="italic" title="Italic"><i>I</i></Btn>
      <Btn k="underline" title="Underline"><u>U</u></Btn>
      <Btn k="strikeThrough" title="Strikethrough"><s>S</s></Btn>

      <span className="mr-rte-sep" />

      <Btn k="h2" title="Heading" on={() => toggleBlock("h2")}><b>H</b></Btn>
      <Btn k="h3" title="Subheading" on={() => toggleBlock("h3")}><b>H<sub>2</sub></b></Btn>

      <span className="mr-rte-sep" />

      <Btn k="insertUnorderedList" title="Bulleted list">{Icons.ul}</Btn>
      <Btn k="insertOrderedList" title="Numbered list">{Icons.ol}</Btn>
      <Btn k="blockquote" title="Quote" on={() => toggleBlock("blockquote")}>{Icons.quote}</Btn>

      <span className="mr-rte-sep" />

      <Btn k="justifyLeft" title="Align left">{Icons.alignLeft}</Btn>
      <Btn k="justifyCenter" title="Align centre">{Icons.alignCenter}</Btn>
      <Btn k="justifyRight" title="Align right">{Icons.alignRight}</Btn>

      <span className="mr-rte-sep" />

      <Btn title="Insert link" on={addLink}>{Icons.link}</Btn>
      <Btn title="Insert image" on={onPickImage}>{Icons.image}</Btn>
      <Btn title="Divider" on={() => run("insertHorizontalRule")}>{Icons.hr}</Btn>

      <span className="mr-rte-sep" />

      <Btn title="Undo" on={() => run("undo")}>{Icons.undo}</Btn>
      <Btn title="Redo" on={() => run("redo")}>{Icons.redo}</Btn>
      <Btn title="Clear formatting" on={() => run("removeFormat")}>{Icons.clear}</Btn>
    </div>
  )
})

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
  // Held in a ref so the callbacks below never change identity, which is what
  // keeps this component from re-rendering the body on each keystroke.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const el = bodyRef.current
    if (mounted.current || !el) return
    mounted.current = true
    el.innerHTML = value || ""
    el.toggleAttribute("data-empty", !el.textContent?.trim() && !el.querySelector("img, hr"))
    try {
      exec("defaultParagraphSeparator", "p")
    } catch {
      // Unsupported in some engines; Enter still breaks the line.
    }
  }, [value])

  const emit = useCallback(() => {
    const el = bodyRef.current
    if (!el) return
    el.toggleAttribute("data-empty", !el.textContent?.trim() && !el.querySelector("img, hr"))
    onChangeRef.current(el.innerHTML)
  }, [])

  const run = useCallback<Cmd>((command, val) => {
    bodyRef.current?.focus()
    exec(command, val)
    emit()
  }, [emit])

  const insertFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      bodyRef.current?.focus()
      exec("insertImage", String(reader.result))
      emit()
    }
    reader.readAsDataURL(file)
  }, [emit])

  const onPickImage = useCallback(() => fileRef.current?.click(), [])

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

  return (
    <div className="mr-rte">
      <Toolbar bodyRef={bodyRef} run={run} onPickImage={onPickImage} />

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
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        onDrop={onDrop}
        suppressContentEditableWarning
      />
    </div>
  )
}
