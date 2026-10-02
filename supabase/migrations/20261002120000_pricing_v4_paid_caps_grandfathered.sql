-- ═══════════════════════════════════════════════════════════════════════════
-- Pricing v4 (docs/specs/pricing-v4/SPEC.md, propuesta del socio traída por el owner 2026-10-02,
-- opción A): Pro pasa a 2–10 alumnos y Elite a 11–60. Precios sin cambio.
--
-- Grandfather por COMPRA: «los que ya tienen PRO o han comprado PRO o ELITE se quedan con los
-- límites actuales; son los nuevos PRO y ELITE». La marca vive en una columna nueva:
--   coaches.paid_caps_grandfathered = true  ⇒ el write-path (`tierMaxClientsFor`) le sigue
--   escribiendo los cupos pagos previos al renovar, cambiar de plan o recomprar tras cancelar
--   (pro 30 si nació antes de 2026-08-18, si no 25; elite 100 / 60).
--   false (DEFAULT, todo coach nuevo y todo Free de hoy) ⇒ catálogo v4 (pro 10, elite 60).
--
-- El CORTE es el instante en que corre esta migración: la marca es el dato, no hay fecha en código.
--
-- QUÉ HACE:
--   (1) ADD COLUMN boolean NOT NULL DEFAULT false (metadata-only en PG ≥ 11: no reescribe la tabla).
--   (2) Backfill: true para todo coach con plan pago HOY (pro/elite/growth/scale, cualquier status:
--       un pro cancelado también «compró PRO») + todo coach con un cobro real de plan pago en
--       billing_snapshots aunque hoy esté en free.
--   NO toca max_clients de nadie: ningún coach cambia de cupo por esta migración.
--
-- PERMISOS: `authenticated` tiene SELECT a nivel tabla sobre coaches (lo lee el panel) y UPDATE
-- solo por columna (lista blanca de marca): esta columna NO entra en ningún GRANT UPDATE, así que
-- un coach no puede auto-marcarse. Solo service_role / admin la escriben.
--
-- PRECONDICIÓN VERIFICADA EN LIVE (2026-10-02, solo lectura):
--   pro 15 (7 con max_clients 30, 8 con 25; olympuswolf canceled) · elite 1 (fraga-gym, 60) ·
--   0 coaches free con cobros en billing_snapshots ⇒ el backfill esperado marca 16 filas (simulado con SELECT: 15 pro + 1 elite).
--
-- ORDEN DE DEPLOY: aplicar ANTES del deploy web (el código nuevo selecciona la columna). Si alguien
-- compra Pro con el código viejo entre la migración y el deploy, queda con max_clients 25 y la marca
-- en false; el re-run post-deploy de TASKS W5 (pro con max_clients > 10 sin marca) lo corrige.
--
-- ROLLBACK (revertir primero el código que lee la columna):
--   alter table public.coaches drop column if exists paid_caps_grandfathered;
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.coaches
    add column if not exists paid_caps_grandfathered boolean not null default false;

comment on column public.coaches.paid_caps_grandfathered is
    'Pricing v4 (2026-10-02): true = el coach tenía o había comprado un plan pago al corte v4 y conserva los cupos pagos previos (pro 30/25, elite 100/60) en activaciones y renovaciones. false = catálogo vigente (pro 10, elite 60). Solo la escriben service_role/admin.';

update public.coaches c
   set paid_caps_grandfathered = true
 where c.paid_caps_grandfathered = false
   and (
        c.subscription_tier in ('pro', 'elite', 'growth', 'scale')
        or exists (
            select 1
              from public.billing_snapshots b
             where b.coach_id = c.id
               and b.tier in ('pro', 'elite', 'growth', 'scale')
               and b.total_clp > 0
        )
   );

-- ── Verificación en la misma sesión ────────────────────────────────────────
-- select subscription_tier, paid_caps_grandfathered, count(*) from public.coaches
--  group by 1, 2 order by 1, 2;                                  -- → elite/true 1 · pro/true 15 · free/false N
-- select column_name, column_default, is_nullable from information_schema.columns
--  where table_schema = 'public' and table_name = 'coaches'
--    and column_name = 'paid_caps_grandfathered';                -- → false · NO
