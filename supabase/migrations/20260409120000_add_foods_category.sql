-- Plan nutrición A: categoría (unión valores alumno + coach, incl. snack)
ALTER TABLE foods
ADD COLUMN IF NOT EXISTS category text DEFAULT 'otro';

ALTER TABLE foods DROP CONSTRAINT IF EXISTS foods_category_check;
ALTER TABLE foods ADD CONSTRAINT foods_category_check CHECK (
  category IN (
    'proteina', 'carbohidrato', 'grasa', 'lacteo',
    'fruta', 'verdura', 'legumbre', 'bebida', 'snack', 'otro'
  )
);

CREATE INDEX IF NOT EXISTS idx_foods_category ON foods(category);
