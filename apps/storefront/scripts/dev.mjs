import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const preferred = Number(process.env.PORT || process.env.STOREFRONT_PORT || 3000)

function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.on("error", () => resolve(false))
    server.listen(port, "0.0.0.0", () => {
      server.close(() => resolve(true))
    })
  })
}

async function pickPort(start) {
  for (let port = start; port < start + 20; port += 1) {
    if (await canListen(port)) {
      return port
    }
  }
  throw new Error(`No free port found near ${start}`)
}

const port = await pickPort(preferred)
if (port !== preferred) {
  console.log(`Port ${preferred} is busy — starting storefront on ${port}`)
}

// Turbopack is the default dev bundler; set NEXT_WEBPACK=1 (or run
// `pnpm dev:webpack`) to fall back to webpack.
const useWebpack = process.env.NEXT_WEBPACK === "1" || process.argv.includes("--webpack")
const args = ["dev", "--port", String(port), "--hostname", process.env.HOST || "0.0.0.0"]
if (!useWebpack) {
  args.push("--turbopack")
}

// Prefer IPv4 for outbound fetches (next/font downloads Google Fonts); on
// networks without IPv6 routing Node otherwise times out.
const nodeOptions = [process.env.NODE_OPTIONS, "--dns-result-order=ipv4first"].filter(Boolean).join(" ")

// Server Action IDs are salted with this key. Next generates a new one whenever
// .next is cleared, which breaks pages left open in a browser ("Server Action
// was not found"). Keep one stable key per machine outside .next.
function serverActionsKey() {
  if (process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY) {
    return process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
  }
  const dir = path.resolve(__dirname, "../node_modules/.cache")
  const file = path.join(dir, "server-actions-key")
  if (existsSync(file)) {
    return readFileSync(file, "utf8").trim()
  }
  const key = randomBytes(32).toString("base64")
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, key, { mode: 0o600 })
  return key
}

const nextBin = path.resolve(__dirname, "../node_modules/next/dist/bin/next")
console.log(`Starting storefront with ${useWebpack ? "webpack" : "Turbopack"} on port ${port}`)
const child = spawn(process.execPath, [nextBin, ...args], {
  stdio: "inherit",
  cwd: path.resolve(__dirname, ".."),
  env: {
    ...process.env,
    PORT: String(port),
    NODE_OPTIONS: nodeOptions,
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: serverActionsKey(),
  },
})

child.on("exit", (code) => process.exit(code ?? 0))
