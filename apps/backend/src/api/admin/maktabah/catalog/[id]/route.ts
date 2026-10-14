import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { loadEditorProduct, type CatalogProductInput } from "../../../../../lib/catalog-editor"
import { deleteCatalogProductWorkflow } from "../../../../../workflows/delete-catalog-product"
import { saveCatalogProductWorkflow } from "../../../../../workflows/save-catalog-product"
import type { CatalogProductBodyType } from "../validators"

/** GET /admin/maktabah/catalog/:id: everything the editor needs. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const product = await loadEditorProduct(query, req.params.id)
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  }
  res.json({ product })
}

/** POST /admin/maktabah/catalog/:id: save the editor form. */
export async function POST(req: MedusaRequest<CatalogProductBodyType>, res: MedusaResponse) {
  const { result } = await saveCatalogProductWorkflow(req.scope).run({
    input: { ...(req.validatedBody as CatalogProductInput), id: req.params.id },
  })
  res.json({ id: result.product_id })
}

/** DELETE /admin/maktabah/catalog/:id: the product and everything it owns. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { result } = await deleteCatalogProductWorkflow(req.scope).run({
    input: { id: req.params.id },
  })
  res.json({
    id: req.params.id,
    object: "product",
    deleted: true,
    deleted_files: result.deleted_files.length,
    released_reservations: result.released_reservations,
  })
}
