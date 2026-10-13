import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"
import { slugify } from "../../../../lib/catalog-editor"

/** POST /admin/maktabah/categories { name }: quick-add from the editor. */
export async function POST(req: MedusaRequest<{ name: string }>, res: MedusaResponse) {
  const name = req.validatedBody.name
  const { result } = await createProductCategoriesWorkflow(req.scope).run({
    input: {
      product_categories: [
        { name, handle: `${slugify(name)}-${Date.now().toString(36).slice(-3)}`, is_active: true },
      ],
    },
  })
  res.status(201).json({ category: { id: result[0].id, name: result[0].name, handle: result[0].handle } })
}
