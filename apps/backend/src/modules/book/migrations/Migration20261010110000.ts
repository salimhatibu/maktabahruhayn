import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Lookup indexes the ORM cannot express:
 * - unique ISBNs among live rows (partial indexes)
 * - trigram indexes so admin and API lookups by author/publisher can use
 *   ILIKE '%...%' without a sequential scan. pg_trgm is a trusted
 *   extension, so the database owner can enable it.
 */
export class Migration20261010110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create extension if not exists pg_trgm;`)
    this.addSql(`
      create unique index if not exists "IDX_book_isbn_13_unique"
        on "book" ("isbn_13") where "isbn_13" is not null and "deleted_at" is null;
    `)
    this.addSql(`
      create unique index if not exists "IDX_book_isbn_10_unique"
        on "book" ("isbn_10") where "isbn_10" is not null and "deleted_at" is null;
    `)
    this.addSql(`
      create index if not exists "IDX_book_author_trgm"
        on "book" using gin ("author" gin_trgm_ops) where "deleted_at" is null;
    `)
    this.addSql(`
      create index if not exists "IDX_book_publisher_trgm"
        on "book" using gin ("publisher" gin_trgm_ops) where "deleted_at" is null;
    `)
    this.addSql(`
      create index if not exists "IDX_book_language_binding"
        on "book" ("language", "binding_type") where "deleted_at" is null;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_book_language_binding";`)
    this.addSql(`drop index if exists "IDX_book_publisher_trgm";`)
    this.addSql(`drop index if exists "IDX_book_author_trgm";`)
    this.addSql(`drop index if exists "IDX_book_isbn_10_unique";`)
    this.addSql(`drop index if exists "IDX_book_isbn_13_unique";`)
  }
}
