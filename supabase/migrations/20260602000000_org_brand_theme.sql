-- Brand Center v2: per-mode accent overrides, dark logo variant, neutral tint,
-- and a small published-brand history for rollback. All derived tokens (palette,
-- on-color text) are computed at render time by @eva/brand-kit (shared web+RN),
-- so we only persist INPUTS here, not the resolved theme.
--
-- LOCAL ONLY — do not db push to prod (see MERGE_TO_LIVE_RUNBOOK.md).

ALTER TABLE "public"."organizations"
    ADD COLUMN IF NOT EXISTS "accent_light" text,
    ADD COLUMN IF NOT EXISTS "accent_dark" text,
    ADD COLUMN IF NOT EXISTS "logo_url_dark" text,
    ADD COLUMN IF NOT EXISTS "neutral_tint" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "brand_history" jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_accent_light_hex') THEN
        ALTER TABLE "public"."organizations"
            ADD CONSTRAINT "organizations_accent_light_hex"
            CHECK ("accent_light" IS NULL OR "accent_light" ~ '^#[0-9a-fA-F]{6}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_accent_dark_hex') THEN
        ALTER TABLE "public"."organizations"
            ADD CONSTRAINT "organizations_accent_dark_hex"
            CHECK ("accent_dark" IS NULL OR "accent_dark" ~ '^#[0-9a-fA-F]{6}$');
    END IF;
END $$;

COMMENT ON COLUMN "public"."organizations"."accent_light" IS 'Override de acento para modo claro (hex). Null = usa el color de marca.';
COMMENT ON COLUMN "public"."organizations"."accent_dark" IS 'Override de acento para modo oscuro (hex). Null = usa el color de marca.';
COMMENT ON COLUMN "public"."organizations"."logo_url_dark" IS 'Logo para fondos oscuros (un logo oscuro desaparece en dark mode).';
COMMENT ON COLUMN "public"."organizations"."neutral_tint" IS 'Si true, los neutros (fondo/borde) se tiñen con el hue de marca.';
COMMENT ON COLUMN "public"."organizations"."brand_history" IS 'Historial de marcas publicadas (snapshots) para rollback. Máx ~3 entradas.';
