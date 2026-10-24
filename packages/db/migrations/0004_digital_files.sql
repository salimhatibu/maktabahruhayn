-- Digital products: store the R2 key of the downloadable file on the product.
ALTER TABLE product ADD COLUMN digital_file_url TEXT;
