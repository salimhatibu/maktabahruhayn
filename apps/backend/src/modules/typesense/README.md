# Typesense module

Wraps the Typesense JS client for the `books` collection.

Methods:
- `ensureCollection()`
- `upsertBookDocument(document)`
- `deleteDocument(id)`

Synced from `src/subscribers/product-typesense.ts` on product create/update/delete.

`pnpm seed:typesense` ensures the `books` collection exists and backfills all products from Medusa into Typesense.
