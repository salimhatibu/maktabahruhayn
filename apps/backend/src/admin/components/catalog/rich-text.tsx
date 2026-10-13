import { Button, DropdownMenu, Input, Popover, Text, Textarea, clx } from "@medusajs/ui"
import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Small WYSIWYG editor for product descriptions. Output is limited to the tags
 * the backend keeps (p, h2, h3, b/strong, i/em, u, lists, blockquote, pre/code,
 * links and simple tables).
 */

type Props = {
  value: string
  onChange: (html: string) => void
  templates: { name: string; html: string }[]
  onManageTemplates: () => void
}

const BLOCKS = [
  { tag: "p", label: "Paragraph" },
  { tag: "h2", label: "Heading" },
  { tag: "h3", label: "Subheading" },
] as const

function exec(command: string, arg?: string) {
  document.execCommand(command, false, arg)
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clx(
        "txt-compact-small-plus inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 transition-colors",
        active ? "bg-ui-bg-base-pressed text-ui-fg-base" : "text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base"
      )}
    >
      {children}
    </button>
  )
}

const Sep = () => <span className="bg-ui-border-base mx-1 h-4 w-px" aria-hidden />

export function RichTextEditor({ value, onChange, templates, onManageTemplates }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const [source, setSource] = useState(false)
  const [state, setState] = useState<{ block: string; bold: boolean; italic: boolean; underline: boolean; ul: boolean; ol: boolean }>({
    block: "p",
    bold: false,
    italic: false,
    underline: false,
    ul: false,
    ol: false,
  })
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")

  // Push external value changes (load, discard, template) into the editable area.
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== value) {
      el.innerHTML = value
    }
  }, [value, source])

  useEffect(() => {
    exec("defaultParagraphSeparator", "p")
    const onSelection = () => {
      const el = ref.current
      const sel = document.getSelection()
      if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) {
        return
      }
      savedRange.current = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
      setState({
        block: String(document.queryCommandValue("formatBlock") || "p").toLowerCase(),
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
      })
    }
    document.addEventListener("selectionchange", onSelection)
    return () => document.removeEventListener("selectionchange", onSelection)
  }, [])

  const emit = () => {
    if (ref.current) {
      onChange(ref.current.innerHTML === "<p><br></p>" ? "" : ref.current.innerHTML)
    }
  }

  const run = (command: string, arg?: string) => {
    ref.current?.focus()
    exec(command, arg)
    emit()
  }

  const restoreSelection = () => {
    const sel = document.getSelection()
    ref.current?.focus()
    if (sel && savedRange.current) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
  }

  const applyLink = () => {
    const url = linkUrl.trim()
    restoreSelection()
    if (!url) {
      exec("unlink")
    } else if (/^(https?:|mailto:|\/)/i.test(url) || /^[\w.-]+\.[a-z]{2,}/i.test(url)) {
      const href = /^[\w.-]+\.[a-z]{2,}/i.test(url) && !/^(https?:|mailto:|\/)/i.test(url) ? `https://${url}` : url
      const sel = document.getSelection()
      if (sel && sel.isCollapsed) {
        exec("insertHTML", `<a href="${href.replace(/"/g, "&quot;")}">${href.replace(/</g, "&lt;")}</a>`)
      } else {
        exec("createLink", href)
      }
    }
    setLinkOpen(false)
    setLinkUrl("")
    emit()
  }

  const insertTable = () => {
    run(
      "insertHTML",
      "<table><thead><tr><th>Heading</th><th>Heading</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p><br></p>"
    )
  }

  const insertTemplate = (html: string) => {
    if (ref.current && !ref.current.textContent?.trim()) {
      onChange(html)
      return
    }
    restoreSelection()
    const sel = document.getSelection()
    const block = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement
    if (block?.closest("p, h2, h3, li, blockquote, pre")?.textContent?.trim()) {
      // Start the template on its own line rather than inside the current paragraph.
      exec("insertParagraph")
    }
    exec("insertHTML", html)
    emit()
  }

  const words = (value.replace(/<[^>]+>/g, " ").match(/\S+/g) || []).length

  return (
    <div className="border-ui-border-base bg-ui-bg-field shadow-borders-base overflow-hidden rounded-lg">
      <div className="border-ui-border-base bg-ui-bg-subtle flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        {BLOCKS.map((b) => (
          <ToolButton
            key={b.tag}
            label={b.label}
            active={!source && state.block === b.tag}
            onClick={() => run("formatBlock", `<${b.tag}>`)}
          >
            {b.tag === "p" ? "P" : b.tag.toUpperCase()}
          </ToolButton>
        ))}
        <Sep />
        <ToolButton label="Bold" active={state.bold} onClick={() => run("bold")}>
          <span className="font-bold">B</span>
        </ToolButton>
        <ToolButton label="Italic" active={state.italic} onClick={() => run("italic")}>
          <span className="font-serif italic">I</span>
        </ToolButton>
        <ToolButton label="Underline" active={state.underline} onClick={() => run("underline")}>
          <span className="underline">U</span>
        </ToolButton>
        <Sep />
        <ToolButton label="Bulleted list" active={state.ul} onClick={() => run("insertUnorderedList")}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <circle cx="2.5" cy="4" r="1" fill="currentColor" />
            <circle cx="2.5" cy="7.5" r="1" fill="currentColor" />
            <circle cx="2.5" cy="11" r="1" fill="currentColor" />
            <path d="M5.5 4h7M5.5 7.5h7M5.5 11h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </ToolButton>
        <ToolButton label="Numbered list" active={state.ol} onClick={() => run("insertOrderedList")}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <text x="0.5" y="5.5" fontSize="4.5" fill="currentColor">1</text>
            <text x="0.5" y="9" fontSize="4.5" fill="currentColor">2</text>
            <text x="0.5" y="12.5" fontSize="4.5" fill="currentColor">3</text>
            <path d="M5.5 4h7M5.5 7.5h7M5.5 11h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </ToolButton>
        <ToolButton label="Quote" active={state.block === "blockquote"} onClick={() => run("formatBlock", "<blockquote>")}>
          <span className="font-serif text-base leading-none">“</span>
        </ToolButton>
        <ToolButton label="Code block" active={state.block === "pre"} onClick={() => run("formatBlock", "<pre>")}>
          <span className="font-mono text-xs">{"</>"}</span>
        </ToolButton>
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              title="Link"
              aria-label="Link"
              onMouseDown={(e) => e.preventDefault()}
              className="text-ui-fg-subtle hover:bg-ui-bg-base-hover hover:text-ui-fg-base inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
                <path
                  d="M6.3 8.7a2.5 2.5 0 0 0 3.5 0l2.2-2.2a2.5 2.5 0 0 0-3.5-3.5l-.6.6M8.7 6.3a2.5 2.5 0 0 0-3.5 0L3 8.5A2.5 2.5 0 0 0 6.5 12l.6-.6"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </Popover.Trigger>
          <Popover.Content className="w-72 p-3" align="start">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                applyLink()
              }}
              className="flex flex-col gap-2"
            >
              <Text size="small" weight="plus">
                Link address
              </Text>
              <Input size="small" autoFocus placeholder="https://" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              <Text size="xsmall" className="text-ui-fg-muted">
                Select text first to turn it into a link. Leave empty to remove a link.
              </Text>
              <div className="flex justify-end">
                <Button size="small" type="submit">
                  Apply
                </Button>
              </div>
            </form>
          </Popover.Content>
        </Popover>
        <ToolButton label="Insert table" onClick={insertTable}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
            <rect x="1.5" y="2.5" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1.5 6h12M1.5 9.3h12M6 6v6.5" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </ToolButton>
        <ToolButton label="Clear formatting" onClick={() => run("removeFormat")}>
          <span className="text-xs">T<sub>x</sub></span>
        </ToolButton>
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button size="small" variant="transparent" type="button" onMouseDown={(e) => e.preventDefault()}>
                Templates
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              {templates.length ? (
                templates.map((t) => (
                  <DropdownMenu.Item key={t.name} onClick={() => insertTemplate(t.html)}>
                    {t.name}
                  </DropdownMenu.Item>
                ))
              ) : (
                <DropdownMenu.Label>No templates yet</DropdownMenu.Label>
              )}
              <DropdownMenu.Separator />
              <DropdownMenu.Item onClick={onManageTemplates}>Manage templates…</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
          <ToolButton label={source ? "Visual editor" : "Edit HTML"} active={source} onClick={() => setSource((s) => !s)}>
            <span className="font-mono text-[11px]">HTML</span>
          </ToolButton>
        </div>
      </div>
      {source ? (
        <Textarea
          className="min-h-[260px] rounded-none border-0 font-mono text-xs shadow-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div
          ref={ref}
          role="textbox"
          aria-multiline
          aria-label="Description"
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          onPaste={(e) => {
            // Paste as plain text so foreign styles never reach the storefront.
            const text = e.clipboardData.getData("text/plain")
            if (text) {
              e.preventDefault()
              exec("insertText", text)
            }
          }}
          data-placeholder="Describe the book: what it covers, who it is for, edition details…"
          className="mr-prose text-ui-fg-base min-h-[260px] px-4 py-3 outline-none"
        />
      )}
      <div className="border-ui-border-base text-ui-fg-muted flex justify-between border-t px-3 py-1.5">
        <Text size="xsmall">{source ? "Editing HTML. Unsupported tags are removed when you save." : "Pasted text keeps its words but not its styling."}</Text>
        <Text size="xsmall" className="mr-tabular">
          {words} {words === 1 ? "word" : "words"}
        </Text>
      </div>
    </div>
  )
}
