import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Runs an @opennextjs/cloudflare command with the deployment's build-time
 * configuration in place.
 *
 * Next.js reads .env.local before .env.production, so a developer's local
 * settings would otherwise be compiled into a deployed bundle - and because
 * NEXT_PUBLIC_* values are inlined at build time, a Worker variable could not
 * undo it. Loading .env.production as real environment variables puts it ahead
 * of every .env file. Variables already set in the environment (Cloudflare
 * Workers Builds, CI, the shell) still win, so they remain the way to override.
 *
 *   node scripts/cf.mjs build|deploy|preview [extra args...]
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(__dirname, "..")

const [command = "build", ...rest] = process.argv.slice(2)
if (!["build", "deploy", "upload"].includes(command)) {
  console.error(`Unknown command "${command}". Use build, deploy or upload.`)
  process.exit(1)
}

/** Minimal KEY=VALUE reader: no interpolation, quotes stripped, # comments ignored. */
function readEnvFile(file) {
  const out = {}
  if (!existsSync(file)) {
    return out
  }
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!match || line.trimStart().startsWith("#")) {
      continue
    }
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2")
    out[match[1]] = value
  }
  return out
}

const fromFile = readEnvFile(path.join(appDir, ".env.production"))
const env = { ...process.env, DEPLOY_TARGET: "cloudflare" }
for (const [key, value] of Object.entries(fromFile)) {
  // An existing environment variable is a deliberate override; keep it.
  if (process.env[key] === undefined && value !== "") {
    env[key] = value
  }
}

const bin = path.resolve(appDir, "node_modules/.bin/opennextjs-cloudflare")
const args = [command, ...rest]
if (command === "build" && !rest.includes("--dangerouslyUseUnsupportedNextVersion")) {
  args.push("--dangerouslyUseUnsupportedNextVersion")
}
const child = spawn(bin, args, { stdio: "inherit", cwd: appDir, env })
child.on("exit", (code) => process.exit(code ?? 0))
