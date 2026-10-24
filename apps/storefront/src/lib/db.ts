import { getCloudflareContext } from "@opennextjs/cloudflare"
import type { D1 } from "@maktabah/db"

/**
 * The shop's database. Server code queries it directly through the Worker's
 * binding - there is no API server in between.
 */
export async function db(): Promise<D1> {
  const { env } = await getCloudflareContext({ async: true })
  const binding = (env as unknown as { DB?: D1 }).DB
  if (!binding) {
    throw new Error(
      "No D1 binding. Run `pnpm db:create` and put the database_id in apps/storefront/wrangler.jsonc, then `pnpm db:migrate:local && pnpm db:seed:local`."
    )
  }
  return binding
}
