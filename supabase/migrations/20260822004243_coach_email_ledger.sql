-- coach_email_ledger — el libro mayor de los correos que EVA le manda a un coach.
--
-- POR QUÉ EXISTE (embudo Free→Pro, W2.9/W2.10 + onboarding v2): el drip agenda correos en Resend con
-- `scheduled_at` a 1, 2, 7 y 14 días y HOY tira a la basura el `provider_message_id` que la API
-- devuelve. Sin ese id no se puede cancelar nada: el D+2 «precio y link» le llega igual al coach que
-- ya pagó el D+1. Y sin una fila local tampoco se puede deduplicar («este coach ya recibió este
-- correo») ni auditar qué se le mandó a quién.
--
-- Se decidió TABLA NUEVA (owner, 2026-08-21) en vez de estirar `admin_audit_logs` o el fósil
-- `coach_email_drip_events`:
--   · `admin_audit_logs` es append-only compartido por crons, panel admin y webhooks: no admite el
--     UPDATE de estado que necesita el webhook de Resend (sent → delivered → bounced) ni un UNIQUE
--     sobre el id del proveedor.
--   · `coach_email_drip_events` (drip v1, muerto desde abril) tiene CHECKs incompatibles
--     (`scheduled_day in (1,3,7,14)`, `status in (sent,failed,skipped)`) y su único escritor fue
--     borrado en `23f3f015`. Queda como fósil, no se toca.
--
-- QUIÉN ESCRIBE: solo el servidor con service_role, desde
-- `services/email/coach-email-ledger.service.ts` (`scheduleCoachEmail` / `cancelCoachEmails`) y
-- desde el webhook `api/webhooks/resend`. El coach solo LEE sus propias filas bajo RLS (hoy no hay
-- pantalla que las muestre; el SELECT existe para que la haya sin otra migración).

create table if not exists public.coach_email_ledger (
    id uuid primary key default gen_random_uuid(),

    -- Dueño del correo y clave de la policy de lectura. `cascade`: borrado el coach, su
    -- correspondencia no tiene a quién pertenecer.
    coach_id uuid not null references public.coaches(id) on delete cascade,

    -- Identidad LÓGICA del correo (`day2_pro`, `welcome_free`, `first_client_nudge`…). Es la mitad
    -- de la clave de dedupe junto con `coach_id`, y lo que `cancelCoachEmails` recibe para saber qué
    -- cancelar. Texto libre a propósito: las keys las definen los módulos de plantillas, no la DB.
    template_key text not null,

    -- Quién disparó el envío. `attempt`/`sweep` son los dos gatillos del correo de cupo (evento vs.
    -- cron `cap-nudge`), `drip` la secuencia de alta, `transactional` los correos de sistema y
    -- `behavior` los de onboarding v2 (el coach hizo —o no hizo— algo).
    trigger text not null check (trigger in ('attempt', 'sweep', 'drip', 'transactional', 'behavior')),

    -- Ciclo de vida. `scheduled` = agendado en Resend y todavía cancelable; `sent`/`delivered`/
    -- `bounced`/`complained` los escribe el webhook de Resend; `cancelled` lo escribe
    -- `cancelCoachEmails`; `failed` es un envío que Resend rechazó (queda para auditar, NO bloquea
    -- el dedupe: un correo que nunca salió debe poder reintentarse).
    status text not null check (status in ('scheduled', 'sent', 'delivered', 'bounced', 'complained', 'cancelled', 'failed')),

    -- Id del correo en Resend. UNIQUE porque es la clave con la que el webhook encuentra la fila
    -- (`data.email_id`) y la que garantiza que una re-entrega del mismo evento no duplique nada.
    -- Nullable: una fila `failed` nunca llegó a tener id.
    provider_message_id text unique,

    -- Momento pactado con Resend (`scheduled_at` de la API). Null en un envío inmediato.
    scheduled_at timestamptz,
    sent_at timestamptz,
    delivered_at timestamptz,

    -- Contexto para auditar sin adivinar: `to`, `subject`, `utm`, el motivo del fallo. NUNCA
    -- contenido del correo ni datos sensibles.
    payload jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.coach_email_ledger is
    'Libro mayor de correos enviados/agendados a coaches (dedupe por (coach_id, template_key), cancelación por provider_message_id, cierre del ciclo con el webhook de Resend). Escrituras solo con service_role.';
comment on column public.coach_email_ledger.template_key is
    'Identidad lógica del correo (day2_pro, welcome_free, …). Mitad de la clave de dedupe.';
comment on column public.coach_email_ledger.trigger is
    'Qué disparó el envío: attempt | sweep | drip | transactional | behavior.';
comment on column public.coach_email_ledger.status is
    'scheduled | sent | delivered | bounced | complained | cancelled | failed. Los cuatro del medio los escribe el webhook de Resend.';
comment on column public.coach_email_ledger.provider_message_id is
    'Id del correo en Resend. UNIQUE: es la llave del webhook (data.email_id) y de POST /emails/:id/cancel.';
comment on column public.coach_email_ledger.payload is
    'Contexto de auditoría (destinatario, asunto, utm, error). Nunca el cuerpo del correo ni datos sensibles.';

-- La lectura caliente: «¿qué le mandamos ya a este coach con esta key?» (dedupe de
-- `scheduleCoachEmail`) y el historial por coach, lo más nuevo arriba.
create index if not exists coach_email_ledger_coach_template_created_idx
    on public.coach_email_ledger (coach_id, template_key, created_at desc);

-- Barridos por estado: la cola de agendados a cancelar/vencer, sin escanear la tabla entera.
create index if not exists coach_email_ledger_status_scheduled_idx
    on public.coach_email_ledger (status, scheduled_at);

alter table public.coach_email_ledger enable row level security;

drop policy if exists "coach_email_ledger_select_own" on public.coach_email_ledger;
create policy "coach_email_ledger_select_own" on public.coach_email_ledger
    for select to authenticated
    using (coach_id = (select auth.uid()));

-- Mismo régimen que `coach_leads` (20260821030821): Supabase concede por default privileges a
-- anon/authenticated en tablas nuevas, se revoca todo y se devuelve SOLO el SELECT que la policy de
-- arriba filtra. Sin policy ni grant de insert/update/delete: escribe únicamente `service_role`
-- (que no pasa por RLS y no se toca acá).
revoke all on public.coach_email_ledger from anon, authenticated;
grant select on public.coach_email_ledger to authenticated;

-- `public.handle_updated_at` ya existe (baseline + 20260517120000_security_fixes, con
-- `search_path = ''`): se reutiliza, no se inventa otra.
drop trigger if exists coach_email_ledger_updated_at on public.coach_email_ledger;
create trigger coach_email_ledger_updated_at
    before update on public.coach_email_ledger
    for each row execute function public.handle_updated_at();
