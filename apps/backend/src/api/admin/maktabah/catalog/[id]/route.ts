import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { deleteProductsWorkflow } from "@medusajs/medusa/core-flows"
import { loadEditorProduct, type CatalogProductInput } from "../../../../../lib/catalog-editor"
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

/** DELETE /admin/maktabah/catalog/:id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  await deleteProductsWorkflow(req.scope).run({ input: { ids: [req.params.id] } })
  res.json({ id: req.params.id, object: "product", deleted: true })
}
