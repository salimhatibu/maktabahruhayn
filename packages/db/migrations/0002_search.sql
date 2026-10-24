-- Full-text search over the catalogue, replacing Typesense.
--
-- unicode61 strips diacritics and splits on punctuation, so the hyphenated
-- transliterations ("an-Nawawi", "al-Bukhari") tokenise into their parts and a
-- search for "nawawi" matches - the behaviour the Typesense token_separators
-- setting existed to provide. Kept in its own migration because FTS5 is a
-- compile-time option: if a database ever lacks it, the core schema above
-- still applies and search falls back to LIKE.

CREATE VIRTUAL TABLE book_search USING fts5 (
  product_id UNINDEXED,
  title,
  title_arabic,
  author,
  publisher,
  categories,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- The indexed row is assembled from product, book and category, so it is
-- rebuilt rather than patched. Writers only have to touch the base tables.
CREATE TRIGGER book_search_product_ai AFTER INSERT ON product BEGIN
  INSERT INTO book_search (product_id, title, title_arabic, author, publisher, categories)
  VALUES (new.id, new.title, NULL, NULL, NULL, NULL);
END;

CREATE TRIGGER book_search_product_au AFTER UPDATE OF title ON product BEGIN
  UPDATE book_search SET title = new.title WHERE product_id = new.id;
END;

CREATE TRIGGER book_search_product_ad AFTER DELETE ON product BEGIN
  DELETE FROM book_search WHERE product_id = old.id;
END;

CREATE TRIGGER book_search_book_ai AFTER INSERT ON book BEGIN
  UPDATE book_search
     SET title_arabic = new.title_arabic,
         author       = new.author,
         publisher    = new.publisher
   WHERE product_id = new.product_id;
END;

CREATE TRIGGER book_search_book_au AFTER UPDATE ON book BEGIN
  UPDATE book_search
     SET title_arabic = new.title_arabic,
         author       = new.author,
         publisher    = new.publisher
   WHERE product_id = new.product_id;
END;

CREATE TRIGGER book_search_category_ai AFTER INSERT ON product_category BEGIN
  UPDATE book_search
     SET categories = (
       SELECT group_concat(c.name, ' ')
         FROM product_category pc JOIN category c ON c.id = pc.category_id
        WHERE pc.product_id = new.product_id
     )
   WHERE product_id = new.product_id;
END;

CREATE TRIGGER book_search_category_ad AFTER DELETE ON product_category BEGIN
  UPDATE book_search
     SET categories = (
       SELECT group_concat(c.name, ' ')
         FROM product_category pc JOIN category c ON c.id = pc.category_id
        WHERE pc.product_id = old.product_id
     )
   WHERE product_id = old.product_id;
END;
