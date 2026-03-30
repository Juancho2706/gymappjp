-- Add unit column to food_items table, defaulting to 'g'
ALTER TABLE food_items
ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'g';
