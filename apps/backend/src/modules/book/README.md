# Book metadata module

Extends Medusa products with Islamic bookstore fields via a linked `Book` data model.

Fields: `title_arabic`, `author`, `translator`, `commentator_tahqeeq`, `publisher`, `binding_type`, `script_type`, `language`, `volume_count`, `isbn_10`, `isbn_13`, `sample_pdf_url`.

Linked from Product through `src/links/product-book.ts`. Created/updated via product workflow hooks reading `additional_data`.

Migration: `migrations/Migration20261007231800.ts` (applied with `pnpm db:migrate` from the repo root).
