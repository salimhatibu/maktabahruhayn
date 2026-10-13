import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261007231800 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "book" (
        "id" text not null,
        "title_arabic" text null,
        "author" text null,
        "translator" text null,
        "commentator_tahqeeq" text null,
        "publisher" text null,
        "binding_type" text null,
        "script_type" text null,
        "language" text null,
        "volume_count" integer null,
        "isbn_10" text null,
        "isbn_13" text null,
        "sample_pdf_url" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "book_pkey" primary key ("id")
      );
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_book_deleted_at"
      ON "book" ("deleted_at")
      WHERE deleted_at IS NULL;
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_book_isbn_13"
      ON "book" ("isbn_13")
      WHERE deleted_at IS NULL;
    `)

    this.addSql(`
      CREATE INDEX IF NOT EXISTS "IDX_book_language"
      ON "book" ("language")
      WHERE deleted_at IS NULL;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_book_language";`)
    this.addSql(`drop index if exists "IDX_book_isbn_13";`)
    this.addSql(`drop index if exists "IDX_book_deleted_at";`)
    this.addSql(`drop table if exists "book" cascade;`)
  }
}
