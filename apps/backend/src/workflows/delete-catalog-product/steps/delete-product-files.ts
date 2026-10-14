import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { cleanupProductFiles } from "../../../lib/product-files"

/**
 * Deletes the product's images and sample PDF from file storage. Runs last and
 * without compensation: files cannot be restored, so nothing after it may fail.
 */
export const deleteProductFilesStep = createStep(
  { name: "delete-product-files", noCompensation: true },
  async ({ id, urls }: { id: string; urls: string[] }, { container }) => {
    const deleted = await cleanupProductFiles(container, urls, id)
    if (deleted.length) {
      const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
      logger.info(`Deleted ${deleted.length} file(s) belonging to product ${id}`)
    }
    return new StepResponse({ deleted })
  },
  async () => {}
)
