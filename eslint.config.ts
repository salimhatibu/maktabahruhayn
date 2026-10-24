import { defineConfig } from "eslint/config"

/**
 * The storefront carries its own Next.js config (apps/storefront/eslint.config.mjs);
 * this root config exists so `turbo lint` has something to resolve at the top
 * of the workspace.
 */
export default defineConfig([
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/.next-build/**", "**/.open-next/**", "**/.wrangler/**"],
  },
])
