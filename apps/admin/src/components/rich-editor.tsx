"use client"

import { useCallback, useEffect, useRef, useState } from "react"

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
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const initialised = useRef(false)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    if (editorRef.current && !initialised.current) {
      editorRef.current.innerHTML = value
      initialised.current = true
    }
  }, [value])

  const emitChange = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  const run = useCallback((command: string, val?: string) => {
    editorRef.current?.focus()
    exec(command, val)
    emitChange()
    forceUpdate((n) => n + 1)
  }, [emitChange])

  const onBlock = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const tag = e.target.value
    if (tag) {
      editorRef.current?.focus()
      exec("formatBlock", `<${tag}>`)
      emitChange()
      forceUpdate((n) => n + 1)
    }
    e.target.value = ""
  }, [emitChange])

  const onLink = useCallback(() => {
    const sel = window.getSelection()
    const existing = sel?.anchorNode?.parentElement?.closest("a")?.href || ""
    const url = window.prompt("URL:", existing)
    if (url === null) return
    if (url === "") {
      run("unlink")
    } else {
      run("createLink", url)
    }
  }, [run])

  const insertImageFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      editorRef.current?.focus()
      exec("insertImage", reader.result as string)
      emitChange()
    }
    reader.readAsDataURL(file)
  }, [emitChange])

  const onImageUpload = useCallback(() => {
    fileRef.current?.click()
  }, [])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) insertImageFile(file)
    e.target.value = ""
  }, [insertImageFile])

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault()
        const file = items[i].getAsFile()
        if (file) insertImageFile(file)
        return
      }
    }
  }, [insertImageFile])

  const isActive = (cmd: string) => {
    try { return document.queryCommandState(cmd) } catch { return false }
  }

  const btn = (cmd: string) => `mr-rte-btn${isActive(cmd) ? " is-active" : ""}`

  return (
    <div className="mr-rte">
      <div className="mr-rte-toolbar" role="toolbar" aria-label="Text formatting">
        <select className="mr-rte-select" onChange={onBlock} defaultValue="">
          <option value="" disabled>Format</option>
          <option value="p">Paragraph</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="blockquote">Quote</option>
        </select>

        <span className="mr-rte-sep" />

        <button type="button" className={btn("bold")} title="Bold (Ctrl+B)" onMouseDown={(e) => { e.preventDefault(); run("bold") }}>
          <strong>B</strong>
        </button>
        <button type="button" className={btn("italic")} title="Italic (Ctrl+I)" onMouseDown={(e) => { e.preventDefault(); run("italic") }}>
          <em>I</em>
        </button>
        <button type="button" className={btn("underline")} title="Underline (Ctrl+U)" onMouseDown={(e) => { e.preventDefault(); run("underline") }}>
          <u>U</u>
        </button>
        <button type="button" className={btn("strikeThrough")} title="Strikethrough" onMouseDown={(e) => { e.preventDefault(); run("strikeThrough") }}>
          <s>S</s>
        </button>

        <span className="mr-rte-sep" />

        <button type="button" className={btn("insertUnorderedList")} title="Bullet list" onMouseDown={(e) => { e.preventDefault(); run("insertUnorderedList") }}>
          • List
        </button>
        <button type="button" className={btn("insertOrderedList")} title="Numbered list" onMouseDown={(e) => { e.preventDefault(); run("insertOrderedList") }}>
          1. List
        </button>

        <span className="mr-rte-sep" />

        <button type="button" className="mr-rte-btn" title="Insert link" onMouseDown={(e) => { e.preventDefault(); onLink() }}>
          Link
        </button>
        <button type="button" className="mr-rte-btn" title="Upload image" onMouseDown={(e) => { e.preventDefault(); onImageUpload() }}>
          Image
        </button>
        <button type="button" className="mr-rte-btn" title="Horizontal rule" onMouseDown={(e) => { e.preventDefault(); run("insertHorizontalRule") }}>
          — HR
        </button>
        <button type="button" className="mr-rte-btn" title="Remove formatting" onMouseDown={(e) => { e.preventDefault(); run("removeFormat") }}>
          Clear
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFileChange}
      />

      <div
        ref={editorRef}
        className="mr-rte-body"
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emitChange}
        onBlur={emitChange}
        onPaste={onPaste}
        suppressContentEditableWarning
      />
    </div>
  )
}
