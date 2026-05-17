-- Retire deprecated tier starter_lite: map to starter (1–10 alumnos, max_clients 10).
update public.coaches
set
  subscription_tier = 'starter',
  max_clients = greatest(max_clients, 10)
where subscription_tier = 'starter_lite';
