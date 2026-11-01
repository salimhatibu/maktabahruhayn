-- A format can carry its own picture, so a hardcover is not shown with the
-- paperback's cover. Null means the format falls back to the book's images.
ALTER TABLE variant ADD COLUMN image TEXT;
