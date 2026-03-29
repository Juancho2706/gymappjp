-- Add video trimming columns to exercises table
ALTER TABLE public.exercises
ADD COLUMN video_start_time INTEGER DEFAULT 0,
ADD COLUMN video_end_time INTEGER;

-- Update comments for clarity
COMMENT ON COLUMN public.exercises.video_start_time IS 'Start time for video playback in seconds';
COMMENT ON COLUMN public.exercises.video_end_time IS 'End time for video playback in seconds';
