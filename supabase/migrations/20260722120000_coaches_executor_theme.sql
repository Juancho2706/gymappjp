-- Ejecutor V3: tema visual del ejecutor del alumno, elegido por el coach en su creador de marca.
-- 'coach' = usa los colores white-label del coach (comportamiento actual).
-- 'eva'   = usa el tema multicolor propio de EVA (Sport/Aqua/Ember).
-- Aditiva. Validación de valores en capa app (Zod), consistente con el diseño permisivo del repo.
-- Grants por columna: patrón white-label (branding se lee pre-login con anon; el coach edita con authenticated + RLS).

alter table public.coaches
  add column if not exists executor_theme text not null default 'coach';

grant select (executor_theme) on public.coaches to anon, authenticated;
grant update (executor_theme) on public.coaches to authenticated;
