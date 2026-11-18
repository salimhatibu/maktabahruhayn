import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm, rmdir, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const admin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(path.join(admin, "package.json"))
const esbuild = createRequire(require.resolve("wrangler/package.json"))("esbuild")

test("the email editor switches templates, preserves drafts and displays plain-text line breaks", async (t) => {
  let browser
  for (const candidate of ["chromium", "chromium-browser", "google-chrome"]) {
    try {
      execFileSync("which", [candidate], { stdio: "ignore" })
      browser = candidate
      break
    } catch { /* Try the next browser. */ }
  }
  if (!browser) return t.skip("Chromium is not installed")

  const bundle = await esbuild.build({
    stdin: {
      resolveDir: admin,
      sourcefile: "email-editor-harness.tsx",
      loader: "tsx",
      contents: `
        import React, { useState } from "react"
        import { createRoot } from "react-dom/client"
        import { RichEditor } from "./src/components/rich-editor"

        function App() {
          const [selected, setSelected] = useState("first")
          const [bodies, setBodies] = useState({
            first: "First greeting\\n\\nFirst < book & more",
            second: "<p>Second template</p>",
          })
          return <>
            <button id="first" onClick={() => setSelected("first")}>First</button>
            <button id="second" onClick={() => setSelected("second")}>Second</button>
            <RichEditor value={bodies[selected]} onChange={(html) => setBodies((previous) => ({ ...previous, [selected]: html }))} />
          </>
        }
        createRoot(document.getElementById("root")).render(<App />)
        const wait = () => new Promise((resolve) => setTimeout(resolve, 50))
        const check = (condition, message) => { if (!condition) throw new Error(message) }
        async function run() {
          await wait()
          const editor = () => document.querySelector('[contenteditable="true"]')
          check(editor().innerHTML === "First greeting<br><br>First &lt; book &amp; more", "Plain text or line breaks were not preserved")
          editor().focus()
          editor().innerHTML = "<p>Unsaved first draft</p>"
          const selection = document.getSelection()
          selection.selectAllChildren(editor().firstChild)
          selection.collapseToEnd()
          const anchor = selection.anchorNode
          const offset = selection.anchorOffset
          editor().dispatchEvent(new Event("input", { bubbles: true }))
          await wait()
          check(selection.anchorNode === anchor && selection.anchorOffset === offset, "Typing reset the caret")
          document.getElementById("second").click()
          await wait()
          check(editor().innerHTML === "<p>Second template</p>", "Switching did not show the second template")
          editor().innerHTML = "<p>Unsaved second draft</p>"
          editor().dispatchEvent(new Event("input", { bubbles: true }))
          await wait()
          document.getElementById("first").click()
          await wait()
          check(editor().innerHTML === "<p>Unsaved first draft</p>", "First draft was lost")
          document.getElementById("second").click()
          await wait()
          check(editor().innerHTML === "<p>Unsaved second draft</p>", "Second draft was lost")
          document.getElementById("result").textContent = "PASS"
        }
        run().catch((error) => { document.getElementById("result").textContent = "FAIL: " + error.message })
      `,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  })
  const dir = await mkdtemp(path.join(tmpdir(), "maktabah-email-editor-"))
  const file = path.join(dir, "index.html")
  const script = path.join(dir, "bundle.js")
  try {
    await writeFile(script, bundle.outputFiles[0].text)
    await writeFile(file, `<div id="root"></div><pre id="result">PENDING</pre><script src="bundle.js"></script>`)
    const output = execFileSync(browser, [
      "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--virtual-time-budget=3000", "--dump-dom", `file://${file}`,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30000 })
    assert.equal(/<pre id="result">([^<]*)<\/pre>/.exec(output)?.[1], "PASS")
  } finally {
    await rm(file)
    await rm(script)
    await rmdir(dir)
  }
})
