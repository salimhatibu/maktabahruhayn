import { defineCloudflareConfig } from "@opennextjs/cloudflare"

/** The admin is dynamic throughout; nothing is worth caching between requests. */
export default defineCloudflareConfig({})
