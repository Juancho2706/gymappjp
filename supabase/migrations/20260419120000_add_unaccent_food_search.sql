-- Enable unaccent extension
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Immutable wrapper (hardcodes dictionary so Postgres trusts it in generated columns)
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$func$
  SELECT public.unaccent('public.unaccent', $1)
$func$;

-- Generated column using the immutable wrapper
ALTER TABLE foods
  ADD COLUMN IF NOT EXISTS name_search text
    GENERATED ALWAYS AS (immutable_unaccent(lower(name))) STORED;

-- Index for fast ilike queries
CREATE INDEX IF NOT EXISTS foods_name_search_idx ON foods (name_search);
