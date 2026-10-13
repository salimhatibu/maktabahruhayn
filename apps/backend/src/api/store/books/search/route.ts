import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { TYPESENSE_MODULE } from "../../../../modules/typesense"
import TypesenseModuleService, {
  BOOK_SEARCH_FACETS,
  type BookSearchFilters,
  type BookSearchSort,
} from "../../../../modules/typesense/service"

function readList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).slice(0, 20)
  }
  if (typeof value === "string" && value.length) {
    return [value]
  }
  return []
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const q = String(req.query.q || "").slice(0, 120)
  const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 60)

  const filters: BookSearchFilters = {}
  for (const facet of BOOK_SEARCH_FACETS) {
    const values = readList(req.query[facet]).map((v) => v.slice(0, 120))
    if (values.length) {
      filters[facet] = values
    }
  }

  const sortParam = String(req.query.sort || "relevance")
  const sort = (["relevance", "price-asc", "price-desc", "title"].includes(sortParam)
    ? sortParam
    : "relevance") as BookSearchSort

  const typesense = req.scope.resolve(TYPESENSE_MODULE) as TypesenseModuleService
  const result = await typesense.searchBooks(q, limit, filters, sort)

  res.json({
    query: q,
    found: result.found,
    hits: (result.hits || []).map((hit) => hit.document),
    facets: result.facet_counts || [],
  })
}
