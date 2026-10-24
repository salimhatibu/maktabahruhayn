import { getCloudflareContext } from "@opennextjs/cloudflare"
import type { D1 } from "@maktabah/db"

/** The shop's database: the same binding the storefront reads. */
export async function db(): Promise<D1> {
  const { env } = await getCloudflareContext({ async: true })
  const binding = (env as unknown as { DB?: D1 }).DB
  if (!binding) {
    throw new Error("No D1 binding. Check d1_databases in apps/admin/wrangler.jsonc.")
  }
  return binding
}
