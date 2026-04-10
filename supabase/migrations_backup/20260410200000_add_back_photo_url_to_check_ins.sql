ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS back_photo_url text;
