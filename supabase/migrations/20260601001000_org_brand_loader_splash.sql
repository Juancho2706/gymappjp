-- Brand Center enterprise: org-level loader + splash white-label config.
-- Mirrors the loader columns coaches already have, but at the organization level
-- so a gym sets ONE identity that propagates to all its coaches/students.
--
-- icon mode: 'logo' shows the org logo in the loader; 'text' shows only the brand
-- word (no icon). On publish these map to coaches.loader_icon_mode ('coach'/'none').
-- splash_bg_color: background for the generated iOS splash screen (defaults to primary).
--
-- LOCAL ONLY — do not db push to prod (see MERGE_TO_LIVE_RUNBOOK.md).

ALTER TABLE "public"."organizations"
    ADD COLUMN IF NOT EXISTS "loader_text" text,
    ADD COLUMN IF NOT EXISTS "use_custom_loader" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "loader_icon_mode" text NOT NULL DEFAULT 'logo',
    ADD COLUMN IF NOT EXISTS "loader_text_color" text,
    ADD COLUMN IF NOT EXISTS "splash_bg_color" text;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_loader_icon_mode_check') THEN
        ALTER TABLE "public"."organizations"
            ADD CONSTRAINT "organizations_loader_icon_mode_check"
            CHECK ("loader_icon_mode" = ANY (ARRAY['logo'::text, 'text'::text]));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_loader_text_max_length') THEN
        ALTER TABLE "public"."organizations"
            ADD CONSTRAINT "organizations_loader_text_max_length"
            CHECK ("loader_text" IS NULL OR length("loader_text") <= 14);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_loader_text_color_hex') THEN
        ALTER TABLE "public"."organizations"
            ADD CONSTRAINT "organizations_loader_text_color_hex"
            CHECK ("loader_text_color" IS NULL OR "loader_text_color" ~ '^#[0-9a-fA-F]{6}$');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_splash_bg_color_hex') THEN
        ALTER TABLE "public"."organizations"
            ADD CONSTRAINT "organizations_splash_bg_color_hex"
            CHECK ("splash_bg_color" IS NULL OR "splash_bg_color" ~ '^#[0-9a-fA-F]{6}$');
    END IF;
END $$;

COMMENT ON COLUMN "public"."organizations"."loader_text" IS 'Texto del loader animado white-label (max 14 chars; se recorta a 10 al propagar a coaches).';
COMMENT ON COLUMN "public"."organizations"."use_custom_loader" IS 'Si true, el loader muestra loader_text en vez de EVA.';
COMMENT ON COLUMN "public"."organizations"."loader_icon_mode" IS 'logo = muestra logo de la org en el loader; text = solo el texto de marca.';
COMMENT ON COLUMN "public"."organizations"."loader_text_color" IS 'Color del texto del loader (hex). Null = gradiente por defecto.';
COMMENT ON COLUMN "public"."organizations"."splash_bg_color" IS 'Color de fondo del splash iOS generado. Null = usa primary_color.';
