ALTER TABLE coaches
  ADD COLUMN IF NOT EXISTS loader_icon_mode TEXT NOT NULL DEFAULT 'eva'
    CHECK (loader_icon_mode IN ('eva', 'coach', 'none'));

UPDATE coaches
SET loader_icon_mode = CASE
  WHEN loader_show_icon = false THEN 'none'
  ELSE 'eva'
END;
