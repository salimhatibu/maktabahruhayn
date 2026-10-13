/**
 * Gives every admin user without a role the built-in super admin role. Run
 * after enabling the rbac feature flag on an existing install (Medusa's own
 * migration script skips when RBAC was not loaded at the time).
 *
 *   pnpm --filter @maktabah/backend assign:super-admin
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function assignSuperAdmin({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const { data: users } = await query.graph({
    entity: "user",
    fields: ["id", "email", "rbac_roles.id"],
  })

  let assigned = 0
  for (const user of users as { id: string; email: string; rbac_roles?: { id: string }[] | null }[]) {
    if (user.rbac_roles?.length) {
      continue
    }
    await link.create({
      [Modules.USER]: { user_id: user.id },
      [Modules.RBAC]: { rbac_role_id: "role_super_admin" },
    })
    assigned += 1
    logger.info(`Super admin role assigned to ${user.email}`)
  }
  logger.info(`Assigned the super admin role to ${assigned} of ${users.length} users`)
}
