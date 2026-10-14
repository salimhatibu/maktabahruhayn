import Typesense, { Client } from "typesense"
import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections"
import {
  TYPESENSE_BOOKS_COLLECTION,
  TYPESENSE_BOOKS_SCHEMA,
  type TypesenseBookDocument,
} from "./collection"

type TypesenseModuleOptions = {
  host?: string
  port?: number
  protocol?: string
  apiKey?: string
  collectionName?: string
}

class TypesenseModuleService {
  protected readonly client_: Client
  protected readonly collectionName_: string

  constructor(_container: unknown, options: TypesenseModuleOptions = {}) {
    const host = (options.host || process.env.TYPESENSE_HOST || "127.0.0.1").replace(
      "localhost",
      "127.0.0.1"
    )
    const port = Number(options.port || process.env.TYPESENSE_PORT || 8108)
    const protocol =
      options.protocol || process.env.TYPESENSE_PROTOCOL || "http"
    const apiKey = options.apiKey || process.env.TYPESENSE_API_KEY || "xyz"

    this.collectionName_ =
      options.collectionName ||
      process.env.TYPESENSE_COLLECTION ||
      TYPESENSE_BOOKS_COLLECTION

    this.client_ = new Typesense.Client({
      nodes: [{ host, port, protocol }],
      apiKey,
      connectionTimeoutSeconds: 5,
    })
  }

  getClient() {
    return this.client_
  }

  getCollectionName() {
    return this.collectionName_
  }

  async ensureCollection() {
    try {
      await this.client_.collections(this.collectionName_).retrieve()
      return { created: false, name: this.collectionName_ }
    } catch {
      const schema: CollectionCreateSchema = {
        name: this.collectionName_,
        fields: [...TYPESENSE_BOOKS_SCHEMA.fields],
        token_separators: [...TYPESENSE_BOOKS_SCHEMA.token_separators],
      }

      await this.client_.collections().create(schema)
      return { created: true, name: this.collectionName_ }
    }
  }

  /**
   * Drops and recreates the collection so schema-level settings (such as
   * token separators) take effect. Callers must reindex afterwards.
   */
  async recreateCollection() {
    try {
      await this.client_.collections(this.collectionName_).delete()
    } catch {
      // Collection did not exist.
    }
    return this.ensureCollection()
  }

  async upsertBookDocument(document: TypesenseBookDocument) {
    await this.ensureCollection()
    return this.client_
      .collections(this.collectionName_)
      .documents()
      .upsert(document)
  }

  async deleteDocument(id: string) {
    try {
      return await this.client_
        .collections(this.collectionName_)
        .documents(id)
        .delete()
    } catch (error: unknown) {
      const status =
        typeof error === "object" && error !== null && "httpStatus" in error
          ? (error as { httpStatus?: number }).httpStatus
          : undefined

      if (status === 404) {
        return null
      }

      throw error
    }
  }

  async searchBooks(
    query: string,
    limit = 12,
    filters: BookSearchFilters = {},
    sort: BookSearchSort = "relevance"
  ) {
    await this.ensureCollection()
    const q = query.trim() || "*"
    const filterBy = buildFilterBy(filters)

    return this.client_.collections(this.collectionName_).documents().search({
      q,
      query_by: "title,title_arabic,author,translator,publisher,isbn_13,categories",
      facet_by: "language,binding_type,categories,publisher",
      per_page: limit,
      ...(filterBy ? { filter_by: filterBy } : {}),
      ...(SORTS[sort] ? { sort_by: SORTS[sort] } : {}),
    })
  }
}

export const BOOK_SEARCH_FACETS = [
  "language",
  "binding_type",
  "categories",
  "publisher",
] as const

export type BookSearchFacet = (typeof BOOK_SEARCH_FACETS)[number]

export type BookSearchSort = "relevance" | "price-asc" | "price-desc" | "title"

const SORTS: Record<BookSearchSort, string | null> = {
  relevance: null,
  "price-asc": "price_usd:asc",
  "price-desc": "price_usd:desc",
  title: "_text_match:desc,price_usd:asc",
}

export type BookSearchFilters = Partial<Record<BookSearchFacet, string[]>>

/**
 * Builds a Typesense filter_by string from facet selections. Values are
 * wrapped in backticks so commas and spaces survive; backticks themselves are
 * stripped because Typesense has no escape for them.
 */
function buildFilterBy(filters: BookSearchFilters) {
  const clauses: string[] = []

  for (const facet of BOOK_SEARCH_FACETS) {
    const values = (filters[facet] || [])
      .map((value) => value.replace(/`/g, "").trim())
      .filter(Boolean)

    if (values.length) {
      clauses.push(`${facet}:=[${values.map((v) => `\`${v}\``).join(",")}]`)
    }
  }

  return clauses.join(" && ")
}

export default TypesenseModuleService
