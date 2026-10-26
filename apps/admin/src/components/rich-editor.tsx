"use client"

import { useCallback, useRef } from "react"

const BTN = "mr-rte-btn"
const BTN_ACTIVE = "mr-rte-btn is-active"

function cmd(command: string, value?: string) {
  document.execCommand(command, false, value)
}

function queryActive(command: string) {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
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

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  const exec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus()
    cmd(command, value)
    handleInput()
  }, [handleInput])

  const insertLink = useCallback(() => {
    const url = window.prompt("Enter URL:")
    if (url) {
      exec("createLink", url)
    }
  }, [exec])

  const insertImage = useCallback(() => {
    const url = window.prompt("Enter image URL:")
    if (url) {
      exec("insertImage", url)
    }
  }, [exec])

  const setBlock = useCallback((tag: string) => {
    exec("formatBlock", tag)
  }, [exec])

  return (
    <div className="mr-rte">
      <div className="mr-rte-toolbar" role="toolbar" aria-label="Text formatting">
        <select
          className="mr-rte-select"
          onChange={(e) => {
            if (e.target.value) setBlock(e.target.value)
            e.target.value = ""
          }}
          defaultValue=""
        >
          <option value="" disabled>Heading</option>
          <option value="p">Paragraph</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="blockquote">Quote</option>
        </select>

        <span className="mr-rte-sep" />

        <button type="button" className={queryActive("bold") ? BTN_ACTIVE : BTN} title="Bold" onMouseDown={(e) => { e.preventDefault(); exec("bold") }}>
          <strong>B</strong>
        </button>
        <button type="button" className={queryActive("italic") ? BTN_ACTIVE : BTN} title="Italic" onMouseDown={(e) => { e.preventDefault(); exec("italic") }}>
          <em>I</em>
        </button>
        <button type="button" className={queryActive("underline") ? BTN_ACTIVE : BTN} title="Underline" onMouseDown={(e) => { e.preventDefault(); exec("underline") }}>
          <u>U</u>
        </button>
        <button type="button" className={queryActive("strikeThrough") ? BTN_ACTIVE : BTN} title="Strikethrough" onMouseDown={(e) => { e.preventDefault(); exec("strikeThrough") }}>
          <s>S</s>
        </button>

        <span className="mr-rte-sep" />

        <button type="button" className={BTN} title="Bulleted list" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList") }}>
          •&thinsp;List
        </button>
        <button type="button" className={BTN} title="Numbered list" onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList") }}>
          1.&thinsp;List
        </button>

        <span className="mr-rte-sep" />

        <button type="button" className={BTN} title="Insert link" onMouseDown={(e) => { e.preventDefault(); insertLink() }}>
          🔗 Link
        </button>
        <button type="button" className={BTN} title="Insert image" onMouseDown={(e) => { e.preventDefault(); insertImage() }}>
          🖼 Image
        </button>
        <button type="button" className={BTN} title="Horizontal rule" onMouseDown={(e) => { e.preventDefault(); exec("insertHorizontalRule") }}>
          ― HR
        </button>
        <button type="button" className={BTN} title="Remove formatting" onMouseDown={(e) => { e.preventDefault(); exec("removeFormat") }}>
          ✕ Clear
        </button>
      </div>

      <div
        ref={editorRef}
        className="mr-rte-body"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: value }}
        onInput={handleInput}
        onBlur={handleInput}
      />
    </div>
  )
}
