import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { deleteProductsWorkflow, deleteReservationsWorkflow } from "@medusajs/medusa/core-flows"
import { collectProductDeletionStep } from "./steps/collect-product-deletion"
import { deleteProductFilesStep } from "./steps/delete-product-files"

/**
 * Deletes a book and everything that belongs to it: its variants, prices and
 * stock (Medusa), its Book record (through the product-book link's cascade),
 * its reviews and search document (through the `product.deleted` subscribers),
 * and its images and sample PDF in file storage.
 *
 * Stock reservations are released first. Medusa refuses to delete an inventory
 * item that still holds one, so without this a book that sits in an open order
 * can never be deleted.
 */
export const deleteCatalogProductWorkflow = createWorkflow(
  "delete-catalog-product",
  (input: { id: string }) => {
    const plan = collectProductDeletionStep(input)

    when("release-reservations", { plan }, ({ plan }) => plan.reservation_ids.length > 0).then(() => {
      deleteReservationsWorkflow.runAsStep({
        input: transform({ plan }, ({ plan }) => ({ ids: plan.reservation_ids })),
      })
    })

    deleteProductsWorkflow.runAsStep({
      input: transform({ input }, ({ input }) => ({ ids: [input.id] })),
    })

    const files = deleteProductFilesStep(
      transform({ input, plan }, ({ input, plan }) => ({ id: input.id, urls: plan.file_urls }))
    )

    return new WorkflowResponse(
      transform({ input, plan, files }, ({ input, plan, files }) => ({
        id: input.id,
        released_reservations: plan.reservation_ids.length,
        deleted_files: files.deleted,
      }))
    )
  }
)
