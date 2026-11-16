ALTER TABLE book DROP COLUMN binding_type;

UPDATE store_setting
   SET value = json_remove(value, '$.items[1].columns[1]')
 WHERE key = 'navigation'
   AND json_extract(value, '$.items[1].columns[1].heading') = 'Format';
