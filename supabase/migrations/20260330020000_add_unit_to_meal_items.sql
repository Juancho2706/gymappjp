-- Add unit column to saved_meal_items
ALTER TABLE "public"."saved_meal_items" ADD COLUMN "unit" text NOT NULL DEFAULT 'g';
