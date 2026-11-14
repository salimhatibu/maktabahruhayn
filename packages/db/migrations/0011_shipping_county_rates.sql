ALTER TABLE shipping_option
  ADD COLUMN county_prices_json TEXT NOT NULL DEFAULT '{}';

INSERT OR IGNORE INTO shipping_option (
  id, name, provider, countries, amount_minor, currency_code,
  free_above_minor, rank, is_active, county_prices_json
) VALUES (
  'express-kenya',
  'EXPRESS',
  'manual',
  '["ke"]',
  0,
  'kes',
  NULL,
  0,
  1,
  '{"mombasa":65000,"kwale":75000,"kilifi":65000,"tana-river":75000,"lamu":75000,"taita-taveta":75000,"garissa":75000,"wajir":75000,"mandera":75000,"marsabit":65000,"isiolo":65000,"meru":75000,"tharaka-nithi":75000,"embu":75000,"kitui":75000,"machakos":75000,"makueni":75000,"nyandarua":75000,"nyeri":75000,"kirinyaga":75000,"muranga":75000,"kiambu":50000,"turkana":75000,"west-pokot":75000,"samburu":75000,"trans-nzoia":75000,"uasin-gishu":75000,"elgeyo-marakwet":75000,"nandi":75000,"baringo":75000,"laikipia":75000,"nakuru":75000,"narok":75000,"kajiado":75000,"kericho":75000,"bomet":75000,"kakamega":75000,"vihiga":75000,"bungoma":75000,"busia":75000,"siaya":75000,"kisumu":75000,"homa-bay":75000,"migori":75000,"kisii":75000,"nyamira":75000,"nairobi":50000}'
);
