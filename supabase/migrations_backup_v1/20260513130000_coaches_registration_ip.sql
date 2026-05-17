-- Add registration_ip for free tier IP-based abuse detection
-- Max 3 free accounts per IP per 7 days check is enforced in server actions

ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS registration_ip TEXT;
