-- Required extensions (must run before baseline schema)
CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";
