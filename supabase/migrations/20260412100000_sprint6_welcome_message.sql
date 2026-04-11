-- Sprint 6 (ENG-047 / ENG-050 minimal):
-- add coach welcome message used in client experience.
alter table public.coaches
add column if not exists welcome_message text;
