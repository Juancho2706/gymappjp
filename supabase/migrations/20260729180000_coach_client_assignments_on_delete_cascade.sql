-- coach_client_assignments: client_id y coach_id quedaron sin ON DELETE (NO ACTION)
-- en 20260517130004_enterprise_assignments.sql. Eso bloquea con FK violation el hard
-- delete de un alumno con asignacion org (deleteClientAction / DELETE api mobile →
-- auth.admin.deleteUser) y el borrado de cuenta de un coach con asignaciones.
-- La fila de asignacion es un join puro: debe morir con cualquiera de sus lados.
-- Idempotente. Rollback: re-crear ambas FKs sin clausula ON DELETE.
do $$
begin
    if exists (
        select 1 from pg_constraint
        where conname = 'coach_client_assignments_client_id_fkey' and confdeltype <> 'c'
    ) then
        alter table public.coach_client_assignments
            drop constraint coach_client_assignments_client_id_fkey;
    end if;
    if not exists (
        select 1 from pg_constraint where conname = 'coach_client_assignments_client_id_fkey'
    ) then
        alter table public.coach_client_assignments
            add constraint coach_client_assignments_client_id_fkey
            foreign key (client_id) references public.clients(id) on delete cascade;
    end if;

    if exists (
        select 1 from pg_constraint
        where conname = 'coach_client_assignments_coach_id_fkey' and confdeltype <> 'c'
    ) then
        alter table public.coach_client_assignments
            drop constraint coach_client_assignments_coach_id_fkey;
    end if;
    if not exists (
        select 1 from pg_constraint where conname = 'coach_client_assignments_coach_id_fkey'
    ) then
        alter table public.coach_client_assignments
            add constraint coach_client_assignments_coach_id_fkey
            foreign key (coach_id) references public.coaches(id) on delete cascade;
    end if;
end $$;
