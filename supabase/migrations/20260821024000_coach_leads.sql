-- coach_leads — el /join standalone deja de crear cuentas: ahora deja una SOLICITUD.
--
-- POR QUÉ (decisión del owner, 2026-08-21, textual): «el join debería llegarle al WhatsApp del
-- coach, o al correo, no registrarse de una porque cada coach quiere controlar a los estudiantes
-- igual». El 2026-08-20 (commit 723b7acb) se había reabierto el alta directa standalone para
-- cerrar el loop de Share Entreno; eso se revierte SOLO para standalone. Team y org conservan su
-- autoalta pre-existente (julio) y siguen escribiendo en `clients`, no acá.
--
-- Qué guarda: el contacto que el desconocido dejó en `/join/[código]` + la atribución de growth
-- que venía en el link de la tarjeta compartida (`?ref&src=share_card&k=`), para que al convertir
-- el lead en alumno esas tres columnas se copien a `clients` sin perder el crédito del referente.
--
-- Régimen de permisos (a propósito, no es un olvido):
--   · SELECT lo hace el coach autenticado bajo RLS (panel «Solicitudes» en /coach/clients).
--   · INSERT (form público de /join) y UPDATE (marcar contactado / convertido / descartado) los
--     hace SOLO el server con service_role, después de verificar que el lead es del coach
--     autenticado. Por eso NO hay policy de insert/update ni grants column-level: nadie escribe
--     esta tabla desde el navegador. Un form público con INSERT directo sería spam gratis.

create table if not exists public.coach_leads (
    id uuid primary key default gen_random_uuid(),

    -- Dueño del lead. Es también la clave de la policy de lectura.
    coach_id uuid not null references public.coaches(id) on delete cascade,
    -- Se guardan por si el día de mañana el flujo de solicitud se abre a team/org (hoy esos dos
    -- scopes siguen con autoalta y nunca llegan acá). `set null` porque perder el espacio no
    -- invalida el contacto.
    team_id uuid references public.teams(id) on delete set null,
    org_id uuid references public.organizations(id) on delete set null,

    -- Contacto. Los largos replican los del form; el check de abajo garantiza que haya AL MENOS
    -- una vía de respuesta (hoy el form pide WhatsApp obligatorio, pero la tabla no depende de eso).
    full_name text not null check (char_length(full_name) between 2 and 120),
    phone text check (phone is null or char_length(phone) between 6 and 30),
    email text check (email is null or char_length(email) <= 254),
    message text check (message is null or char_length(message) <= 500),

    -- Atribución first-party de Share Entreno (mismas columnas que `clients`, migración
    -- 20260819223729). Se copian a la fila `clients` cuando el coach convierte el lead.
    referred_by_client_id uuid references public.clients(id) on delete set null,
    referral_source text check (referral_source is null or char_length(referral_source) <= 40),
    referral_card_kind text check (referral_card_kind is null or char_length(referral_card_kind) <= 40),

    status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'dismissed')),
    converted_client_id uuid references public.clients(id) on delete set null,

    -- Ley 21.719: el checkbox de consentimiento del form es obligatorio y queda fechado acá.
    consent_accepted_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint coach_leads_contact_required check (phone is not null or email is not null)
);

comment on table public.coach_leads is
    'Solicitudes de alumnos que llegan por /join/[invite_code] standalone. El coach decide si las convierte en alumno. Escrituras solo con service_role.';

-- La única lectura que existe: «mis solicitudes pendientes, las más nuevas arriba».
create index if not exists coach_leads_coach_status_created_idx
    on public.coach_leads (coach_id, status, created_at desc);

alter table public.coach_leads enable row level security;

drop policy if exists "coach_leads_select_own" on public.coach_leads;
create policy "coach_leads_select_own" on public.coach_leads
    for select to authenticated
    using (coach_id = (select auth.uid()));

-- Supabase concede por default privileges a anon/authenticated en tablas nuevas: se revoca todo y
-- se devuelve solo el SELECT que la policy de arriba filtra. `service_role` no se toca.
revoke all on public.coach_leads from anon, authenticated;
grant select on public.coach_leads to authenticated;

-- `public.handle_updated_at` ya existe (baseline + 20260517120000_security_fixes, con
-- `search_path = ''`): se reutiliza, no se inventa otra.
drop trigger if exists coach_leads_updated_at on public.coach_leads;
create trigger coach_leads_updated_at
    before update on public.coach_leads
    for each row execute function public.handle_updated_at();
