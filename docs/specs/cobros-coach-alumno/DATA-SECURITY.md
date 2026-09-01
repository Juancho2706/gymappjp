---
status: draft
owner: product-engineering
last_verified: "2026-08-29"
canonical: false
---

# SDD — Datos, gate y seguridad · «Cobros coach → alumno» (`cobros-coach-alumno`)

Writer «data-security» · 2026-08-28 · **alineado a R1–R23 el 2026-08-29** · repo leído en SOLO LECTURA
(`D:\Proyectos\Antigravity\gymappjp`, rama `rnmobiledenuevo`, HEAD `c85ef28b`).
Jerarquía vigente: **`DECISIONS.md` (owner) > `OUTLINE-16-RESOLUCIONES.md` (R1–R23) > `DECISIONS-2.md` >
`OUTLINE.md` > mapas/research**. Donde una corrección de crítico contradecía una resolución, manda la
resolución y el documento se corrigió (cada cambio lleva su `R-n` al lado).
Nombres canónicos: `OUTLINE §15`. Todo lo que se afirma del código lleva `archivo:línea`.

**Cómo se usa este documento**: es el diseño que un implementador copia. §1 y §2 son SQL listo para
pegar en `supabase/migrations/`; §3 a §10 son TS listo para pegar en `packages/cobros` y
`apps/web/src/**`. Lo que no está acá (UI, copys, correos, RN) vive en los otros archivos del SDD.

---

## 0. Invariantes que gobiernan todo el resto

| # | Invariante | Por qué | Dónde se prueba |
|---|---|---|---|
| I-1 | **Ninguna tabla nueva concede escritura a `anon`/`authenticated`.** `revoke all` + `grant select` acotado + escrituras solo `service_role`. | El alumno y el coach hablan PostgREST directo desde RN (`apps/mobile/lib/coach-client-detail.ts:802`, `:1372`); con `GRANT UPDATE` el alumno se auto-marcaría pagado. Precedentes: `coach_leads` (`supabase/migrations/20260821030821_coach_leads.sql:71`), `coach_email_ledger` (`20260822004243_coach_email_ledger.sql:97-98`). | `supabase/tests/cobros_grants.sql` (§13.1) |
| I-2 | **El estado de cobro es DERIVADO, jamás almacenado.** No hay columna `access_state`, no hay valor `cut`. Los seis estados son `off \| ok \| due_soon \| due \| unpaid \| ended` (**R1**). | Un cron caído no puede cortar a quien pagó ni dejar pasar a un moroso (`OUTLINE §2.1`, `maps/r2-gate-alumno.md §8.2`). | `packages/cobros/state.test.ts` (§3.4) |
| I-3 | **El gate del alumno moroso es fail-OPEN**; el del coach moroso (NUT-033) sigue fail-CLOSED. Conviven en la misma función sin mezclarse. | `supabase/migrations/20260728125000_student_write_gate_fail_closed.sql:60-61` es un contrato escrito («SIN ANCLA DE BILLING CONOCIDA, ESTA FUNCION CIERRA»); el término nuevo solo puede **agregar** una condición fail-open. | `supabase/tests/cobros_gate_equivalence.sql` (§2.2) |
| I-4 | **Los tokens OAuth del coach nunca viven en `public.coaches`.** Tabla propia, sin grant para ningún rol de cliente, cifrados AES-256-GCM a nivel app. | El alumno lee hoy las 69 columnas de su coach (verificado en LIVE, `maps/r7-db-seguridad.md §2.3`, policy `coaches_select_authenticated`). | `supabase/tests/cobros_grants.sql`, T-03/T-10 |
| I-5 | **Nunca se confía en el body de un webhook.** Se re-fetchea el recurso con el token del coach y se verifica `collector_id`. | `research/s8-mp-oauth-marketplace-subs.md §6.5`; el body es público y forjable. | `apps/web/src/app/api/cobros/mp/webhook/route.test.ts` (§13.3) |
| I-6 | **`checkout_url` / `init_point` jamás viajan a la app nativa.** Ni en `/api/mobile/config`, ni en `/api/mobile/coach/**`, ni en push. | Regla de tiendas (`apps/mobile/AGENTS.md §Pagos y tiendas`, BRIEF §3). | `tests/mobile/cobros-no-checkout-url.test.ts` (§13.5) |
| I-7 | **Segunda aplicación de MercadoPago** («EVA Cobros»), con `client_id`/`client_secret`/signing secret propios y ruta de webhook propia. | Un secret filtrado no puede comprometer el billing EVA↔coach (`OUTLINE §0.1`, `research/s8 §2.10` y `§4.5`). | Revisión de envs en W0 + T-21 |
| I-8 | **Moneda en entero CLP** (`amount_clp integer`), como `billing_snapshots.base_clp` (`supabase/migrations/20260612150000_coach_addons_selfservice_billing.sql:102-126`). | Coherencia con el billing propio y cero redondeo. El `client_payments.amount numeric(10,2)` histórico no se migra (D-W4). | CHECK en cada tabla |
| I-9 | **Módulo standalone**: ni `org_id` ni `team_id` en las tablas nuevas. | `STATS.md`: los 110 alumnos vivos son standalone. `OUTLINE §3.1`. La rama org-admin se resuelve joineando `clients`. | `supabase/tests/cobros_isolation.sql` (§13.2) |
| I-10 | **Un 200 al webhook significa «el efecto está escrito».** Nunca se responde 200 con un evento en `status <> 'applied'` salvo que se haya decidido, con información, que no hay nada que aplicar. Ante la duda: 502/503, que MP reintente. | MP deja de reintentar tras un 200: un 200 prematuro **es** un pago perdido, y el alumno queda cortado a los 0-3 días habiendo pagado. Es el criterio de aborto de la beta. | `webhook/route.test.ts` casos 3b y 9 (§13.3) |
| I-11 | **Si el motor no le cobra, el motor no lo corta.** Las exclusiones (`is_demo`, archivado, inactivo, org/team) y los frenos (`module_enabled=false`, `engine_hold_at`) valen **idénticos** en el cron, en la función pura y en la RLS. | Cortar a alguien que nunca recibió un correo de cobro es el peor bug posible del feature, y nace de que las tres capas listen condiciones distintas. | §2.2 (E-01…E-03) + espejo SQL↔TS de §3.4 |
| I-12 | **`paid_through` AVANZA por confirmaciones y RETROCEDE solo por eventos auditados**: deshacer confirmación (§8.4), reembolso o contracargo (§8.5). Nada más lo mueve. (**R8** — reemplaza la invariante vieja «solo avanza».) | «Solo avanza» era mentira operativa: sin retroceso, un reembolso o un contracargo dejaba acceso pagado con plata devuelta, y una confirmación equivocada del coach era irreversible. Los tres caminos que retroceden son RPCs auditadas, nunca un `update` suelto. | `cobros_confirm_charge.sql` + `confirm-payment.service.test.ts` (§13.6) |
| I-13 | **Nadie sigue cobrando a quien perdió el acceso** (**R5**). Todo camino que apaga un plan o una cuenta cancela primero el preapproval por API, con reintentos y alerta; si el token ya está muerto, el plan queda `needs_manual_cancel` y salen los dos correos. | Un cobro recurrente que el consumidor no puede detener es el riesgo legal más caro del feature (Ley 21.398) y el criterio de aborto de la beta. | `connection.service.test.ts` (§13.6) + §5.8 |

**Decisión del writer (D-W1)**: sin `org_id`/`team_id` en **ninguna** tabla nueva (el OUTLINE lo pide
para `client_billing_plans`; lo extiendo por simetría a `student_billing_charges`,
`student_subscriptions` y `student_payment_events`). La rama org-admin de las policies usa el `exists`
sobre `clients` que ya usa `client_payments_workspace_manage`
(`supabase/migrations/20260525180500_workspace_rls_sensitive_tables.sql:214-260`). Costo: un join por
fila en tablas con decenas de filas por coach. Beneficio: cero denormalización desincronizable.

---

## 0.1 Nombres nuevos que `SPEC.md §19` DEBE registrar (corrección C-06/C-07)

SPEC §19 exige registrar todo identificador antes de usarlo. Estos nacen acá y son **canónicos**;
si SPEC, PLAN, TASKS, EMAILS o TESTING-LEGAL usan otro nombre, se corrigen ellos.

| Identificador | Dónde vive | Qué es |
|---|---|---|
| `cutsAt` | `StudentBillingResult` (§3.1), payload `studentBilling` (§4.4), header del proxy (§4.2) | Instante exacto del corte, ya con el diferimiento por claim (R3). **Es el nombre único**: `dueUntil` queda derogado en los cinco documentos, porque `cutsAt` es el que ya usa la función pura y el que muestran los copys. |
| `canClaim` | payload `studentBilling` (§4.4) | ¿Hay una cuota `pending` sin claim vivo? Habilita «Avisar a mi coach». **NO lo devuelve la función pura** (necesita las cuotas): lo agrega el caller de `/api/mobile/config` sobre el resultado de `resolveStudentBillingState`. |
| `STUDENT_BILLING_STATE_HEADER` (`x-student-billing-state`) · `STUDENT_BILLING_UNTIL_HEADER` (`x-student-billing-until`, lleva `paidThrough`) · `STUDENT_BILLING_CUTS_AT_HEADER` (`x-student-billing-cuts-at`, lleva `cutsAt`) | §4.2, `apps/web/src/proxy.ts` | Los **tres** headers que el proxy inyecta. El tercero no era opcional ni experimental: sin él, las superficies server-side no pueden mostrar la fecha del corte sin repetir la consulta. |
| `client_billing_plans.effective_grace_days` | M2 | Gracia EFECTIVA ya resuelta (plan ?? coach) en la fila del plan. Corrección DB-04b: el proxy no puede leer `coach_billing_settings` con la sesión del alumno. En TS: `StudentBillingPlanRow.effectiveGraceDays`. |
| `client_billing_plans.module_enabled` | M2 | Interruptor del módulo desnormalizado en el plan. En TS: `moduleEnabled`. |
| `client_billing_plans.claim_deferral_until` | M2 | R3: hasta cuándo el claim «ya pagué» difiere el corte (≤ 5 días tras la gracia). En TS: `claimDeferralUntil`. |
| `client_billing_plans.engine_hold_at` | M2 | Freno del motor: EVA perdió la señal de cobro (MP desconectado / desautorizado). En TS: `engineHoldAt`. |
| `client_billing_plans.needs_manual_cancel` | M2 | R5, rama `mp-connect`: EVA ya no puede cancelar el preapproval por API y el coach tiene que hacerlo en su panel MP (C5). |
| `gateEnabled` | `StudentBillingInput` (§3.1) | R14: `COBROS_KILL_SWITCH` + `private.cobros_gate_enabled()` resueltos por el caller. `false` ⇒ `off` para todos. |

**Firma canónica de la función pura** (§3.1/§3.2), la que SPEC §5.1 debe transcribir tal cual:

```ts
resolveStudentBillingState(input: {
  plan: StudentBillingPlanRow | null
  coachIsPro: boolean
  clientExcluded: boolean
  gateEnabled: boolean
  now?: number
}): StudentBillingResult
```

**Conducta de `engine_hold_at` frente a SPEC §5.2 T18/T18b** (contradicción C-07, resuelta acá):
un plan `mp_*` cuya conexión quedó `revoked` **pasa a `manual`** (eso no cambia) y además
`engine_hold_at = now()` + `needs_manual_cancel = true`. El efecto del hold es doble y hay que
escribirlo en SPEC: (a) el estado derivado es **`off`** —nadie se corta por una plata que EVA ya no
puede cobrar—, y (b) el sweep (§9.1) **sigue creando cuotas y mandando E1/E2** —el coach puede
cobrar a mano— pero **nunca E3 ni E4**. «Pasa a manual sin cortar» y «`engine_hold_at` deriva `off`»
son la misma regla dicha dos veces; manda esta redacción.

**Contrato de E6 (contradicción C-08, resuelta por la opción (b))**: M2 **NO** agrega
`contract_text`, `contract_version` ni `contract_rendered_at`, y ninguna migración de este tren las
crea. DECISIONS-2 §EMAILS cerró que el contrato es el **texto estándar de EVA parametrizado** con
`client_billing_plans.description` (R21), monto, periodicidad, día de cobro, gracia, forma de
cancelar, responsable (el coach) y datos del coach (nombre, RUT) — sin campo libre del coach en el
primer tren. `EMAILS.md §0/§1.5/§11.7` se reescriben a ese render; el «prerrequisito bloqueante de
W5» de las tres columnas queda **anulado**.

---

## 1. Migraciones — DDL completo, una por objeto, en orden

> **FUENTE ÚNICA DEL DDL (corrección C-01, 28-08 · confirmada por R17).** Esta sección §1 es la
> **única** lista de migraciones del tren: cantidad (**16**), nombres de archivo, timestamps, contenido
> y rollback. `PLAN.md` y `TASKS.md` **referencian por nombre `M-n`** y no repiten timestamps (R17).
> `PLAN.md §W1` y `TASKS.md W1.2-W1.8` traían un juego incompatible (12 migraciones, corte del gate en
> un solo archivo, rollback único `cobros_schema_rollback.sql`, otro nombre para el test de
> equivalencia) y, peor, una **colisión de timestamp** con la lista vieja.
> **Resolución**: mandan los timestamps de acá; `PLAN §W1` y `TASKS W1.2-W1.8` se reescriben citando
> esta sección por `M-n` (un rollback POR migración, un solo nombre de test:
> `supabase/tests/cobros_gate_equivalence.sql`). El corte del gate queda **en dos archivos**
> (M15 función nueva + M16 `create or replace`) a propósito: así se revierte solo el término NUT-033
> sin tocar la función nueva. Queda registrado en `SPEC.md §19`. **Pendiente para el jefe**: es una
> corrección cross-archivo; acá solo se declara la autoridad, los otros dos documentos hay que
> editarlos.
>
> **Las tres migraciones nuevas de esta ronda** (R13/R14/R21) entran **antes** del gate, porque el
> gate las usa: M12 `platform_flags` + `private.cobros_gate_enabled()` (R14), M13
> `student_billing_consents` (R21) y M14 las cuatro RPCs `private.cobros_*` (R13). Los cambios de R16
> (sin unique sobre `student_billing_charges.payment_id`, `periods_covered`) y de R21
> (`client_billing_plans.description`) van **dentro** de M2/M3/M8, que son de este mismo tren y
> todavía no están aplicadas: la regla «nunca se edita una migración aplicada» no se toca.

Orden obligatorio (FKs y dependencias de funciones): **M1 settings → M2 plans → M3 charges →
M4 subscriptions → M5 events → M6 connections → M7 connection_events → M8 columnas `client_payments` →
M9 REVOKE anon → M10 `client_email_ledger` → M11 bucket `payment-receipts` →
M12 `platform_flags` + `private.cobros_gate_enabled` → M13 `student_billing_consents` →
M14 RPCs `private.cobros_*` → M15 `private.student_billing_allowed` →
M16 `create or replace private.student_write_allowed`.**

| M-n | Archivo | Objeto | Resolución que la exige |
|---|---|---|---|
| M1 | `20260829090000_coach_billing_settings.sql` | tabla | OUTLINE §3.1 |
| M2 | `20260829090500_client_billing_plans.sql` | tabla | OUTLINE §3.1 + **R2** (`paid_through`) + **R3** (diferimiento) + **R21** (`description`) |
| M3 | `20260829091000_student_billing_charges.sql` | tabla | OUTLINE §3.2 + **R3** (claim) + **R9** (estados) + **R16** (sin unique) |
| M4 | `20260829091500_student_subscriptions.sql` | tabla | OUTLINE §3.3 |
| M5 | `20260829092000_student_payment_events.sql` | tabla | OUTLINE §3.4 + **R12** (`status`) |
| M6 | `20260829092500_coach_payment_connections.sql` | tabla | OUTLINE §4 |
| M7 | `20260829093000_coach_payment_connection_events.sql` | tabla | OUTLINE §4 |
| M8 | `20260829093500_client_payments_cobros_columns.sql` | columnas | OUTLINE §3.5 + **R9** + **R16** (`periods_covered`) |
| M9 | `20260829094000_client_payments_revoke_anon.sql` | grants | DB-07 (va en **W1**, DECISIONS-2) |
| M10 | `20260829094500_client_email_ledger.sql` | tabla | OUTLINE §3.7 + **R4** |
| M11 | `20260829095000_payment_receipts_bucket.sql` | bucket | OUTLINE §3.8 |
| M12 | `20260829095500_platform_flags.sql` | tabla + función | **R14** |
| M13 | `20260829100000_student_billing_consents.sql` | tabla | **R21** |
| M14 | `20260829100500_cobros_rpcs.sql` | 4 funciones | **R13** |
| M15 | `20260829101000_student_billing_allowed.sql` | función (gate) | OUTLINE §3.6 + **R1** + **R3** + **R14** |
| M16 | `20260829101500_student_write_allowed_billing_term.sql` | `create or replace` | OUTLINE §3.6 |

Cada archivo es idempotente (`create table if not exists`, `create index if not exists`,
`drop policy if exists` antes de `create policy`) y aditivo: **nunca** se edita una migración aplicada
(`AGENTS.md:126-141`). El rollback de cada una vive en `supabase/tests/<mismo_nombre>_rollback.sql`
(convención viva: 8 archivos `*_rollback.sql` allí).

**Protocolo de aplicación (por cada migración, sin excepción)**:

```sql
-- 1) Censo previo en LIVE (solo lectura)
select relname, relrowsecurity from pg_class where relname = '<tabla>';
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name='<tabla>' order by 1,2;

-- 2) Ensayo con rollback (patrón supabase/tests/student_gate_equivalence.sql:15-16)
begin;
  \i supabase/migrations/<archivo>.sql
  -- asserts con `set local role authenticated` + request.jwt.claims sintéticos
rollback;

-- 3) Aplicar. 4) get_advisors (security + performance). 5) regenerar apps/web/src/lib/database.types.ts.
```

Regla del owner (`feedback_no_supabase_branches`): **no** usar Supabase Branching; tx + `ROLLBACK` y
advisors contra LIVE.

---

### M1 — `20260829090000_coach_billing_settings.sql`

```sql
-- coach_billing_settings — ajustes del módulo «Cobros» por coach.
--
-- Un registro por coach, creado on-demand cuando abre /coach/cobros y completa el onboarding de 3
-- pasos. `enabled=false` significa «todavía no activó el módulo»: el motor lo ignora entero (ni
-- cuotas, ni correos, ni gate).
--
-- ESCRITURAS: solo service_role (server actions de /coach/cobros). El coach LEE su fila. No hay
-- GRANT UPDATE: `own_payment_link_url` y `transfer_instructions` los edita el coach, pero pasan por
-- server action con validación de host (allowlist). Una columna con grant dejaría escribir
-- cualquier URL sin pasar por el validador.

create table if not exists public.coach_billing_settings (
    coach_id uuid primary key references public.coaches(id) on delete cascade,

    -- Interruptor del módulo para ESTE coach. Falso hasta que completa el onboarding legal.
    enabled boolean not null default false,

    -- Gracia por defecto. La UI ofrece SOLO 0 o 3 (DECISIONS.md D-B); el CHECK llega a 14 para que
    -- soporte no tenga que migrar si el owner cambia de idea.
    default_grace_days smallint not null default 3 check (default_grace_days between 0 and 14),
    reminder_days_before smallint not null default 3 check (reminder_days_before between 0 and 30),

    -- Texto que el alumno ve en la hoja «Ver cómo pagar» (datos de transferencia).
    transfer_instructions text
      check (transfer_instructions is null or char_length(transfer_instructions) <= 600),
    -- Link de cobro PROPIO del coach (el del panel de MP, que NO notifica a EVA — research/s1 §1.7).
    -- Se muestra como texto/botón en el modo manual. Host validado en el servidor contra la
    -- allowlist de OUTLINE §3.4; el CHECK es solo la primera barrera.
    own_payment_link_url text
      check (own_payment_link_url is null or own_payment_link_url ~ '^https://'),

    notify_on_payment boolean not null default true,
    daily_digest boolean not null default true,

    -- Bloque legal/tributario (OUTLINE §11; research/s6). El RUT se guarda para que el coach lo
    -- tenga a mano en sus boletas: EVA no lo usa para nada tributario propio.
    tax_rut text check (tax_rut is null or char_length(tax_rut) <= 16),
    tax_declaration_accepted_at timestamptz,
    terms_version text check (terms_version is null or char_length(terms_version) <= 32),
    terms_accepted_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- El módulo no se enciende sin declaración tributaria ni T&C aceptados (OUTLINE §11).
    constraint coach_billing_settings_enabled_requires_terms
      check (enabled is not true
             or (tax_declaration_accepted_at is not null and terms_accepted_at is not null))
);

comment on table public.coach_billing_settings is
  'Ajustes del módulo Cobros (coach → alumno) por coach. NO es el billing EVA→coach (eso vive en coaches.subscription_*). Escrituras solo service_role: own_payment_link_url pasa por validación de host en el servidor.';
comment on column public.coach_billing_settings.default_grace_days is
  'Gracia por defecto en días (la UI ofrece 0 o 3). client_billing_plans.grace_days la sobreescribe por alumno.';
comment on column public.coach_billing_settings.own_payment_link_url is
  'Link de cobro propio del coach (panel MP, Flow, Khipu…). NO dispara webhooks a EVA: es texto para el alumno. Host validado contra allowlist en el servidor.';

alter table public.coach_billing_settings enable row level security;
revoke all on public.coach_billing_settings from anon, authenticated;
grant select on public.coach_billing_settings to authenticated;
grant all    on public.coach_billing_settings to service_role;

drop policy if exists coach_billing_settings_select_own on public.coach_billing_settings;
create policy coach_billing_settings_select_own on public.coach_billing_settings
  for select to authenticated
  using (coach_id = (select auth.uid()));

-- El ALUMNO necesita ver transfer_instructions / own_payment_link_url de SU coach en /c/<slug>/pagos.
-- NO se le da policy: esos dos campos se sirven por route handler con service-role, para no
-- exponerle enabled / tax_rut / terms_* (§4.3).

drop trigger if exists coach_billing_settings_updated_at on public.coach_billing_settings;
create trigger coach_billing_settings_updated_at
  before update on public.coach_billing_settings
  for each row execute function public.handle_updated_at();
```

`public.handle_updated_at` ya existe (baseline + `20260517120000_security_fixes`, con
`search_path = ''`) y es el helper que reusan `coach_leads` (`20260821030821:77-83`) y
`coach_email_ledger` (`20260822004243:102-105`). No se inventa otro.

**Rollback** `supabase/tests/20260829090000_coach_billing_settings_rollback.sql`:

```sql
drop trigger if exists coach_billing_settings_updated_at on public.coach_billing_settings;
drop policy  if exists coach_billing_settings_select_own on public.coach_billing_settings;
drop table   if exists public.coach_billing_settings;
```

---

### M2 — `20260829090500_client_billing_plans.sql`

```sql
-- client_billing_plans — EL PLAN de cobro del coach a SU alumno. Un plan vivo por alumno.
--
-- Cambios del jefe sobre maps/r7 §4.1 (OUTLINE §3.1):
--   · `rail` → `mode` ('manual' | 'mp_link' | 'mp_subscription')
--   · `grace_days` NULLABLE (null = usar coach_billing_settings.default_grace_days)
--   · SIN `access_state` / `access_cut_at`: el estado es DERIVADO (invariante I-2)
--   · sin org_id / team_id (módulo standalone, I-9)
--
-- `paid_through` es LA FUENTE DE VERDAD del acceso. La escribe solo service_role, dentro de las RPCs
-- de §8: AVANZA por confirmaciones y RETROCEDE solo por deshacer / reembolso / contracargo (I-12, R8).
-- El alumno no tiene GRANT UPDATE sobre nada de esta tabla.

create table if not exists public.client_billing_plans (
    id uuid primary key default gen_random_uuid(),

    client_id uuid not null references public.clients(id) on delete cascade,
    coach_id  uuid not null references public.coaches(id) on delete cascade,

    amount_clp integer not null check (amount_clp between 0 and 100000000),

    -- DESCRIPCIÓN DEL SERVICIO (R21). Obligatoria: es lo que el contrato escrito (E6), el aviso
    -- previo y el ítem de Checkout Pro le dicen al alumno que está comprando («Asesoría online
    -- mensual»). Sin esto, el correo de confirmación de la LPC art. 12 A queda sin objeto.
    description text not null
        check (char_length(btrim(description)) between 1 and 140),

    -- 'monthly' cubre el 95% hoy; el resto está para no volver a migrar. 'one_off' = paquete o
    -- sesión suelta: se cobra una vez y no renueva.
    period_kind text not null default 'monthly'
        check (period_kind in ('monthly','biweekly','quarterly','one_off')),

    -- Modo de cobro. Los tres conviven en el mismo coach (DECISIONS.md D-A).
    --   manual          → el alumno paga por fuera y avisa; el coach confirma.
    --   mp_link         → EVA crea una preference Checkout Pro por ciclo con el token del coach.
    --   mp_subscription → preapproval MP en la cuenta del coach; MP cobra solo.
    mode text not null default 'manual'
        check (mode in ('manual','mp_link','mp_subscription')),

    -- Ancla del acceso: fin del último período PAGADO (día calendario chileno).
    --
    -- INICIALIZACIÓN OBLIGATORIA (R2): al CREAR el plan se escribe `paid_through = first_due_on`, el
    -- «primer vencimiento» que el coach elige en el formulario. La regla es «el acceso vale hasta el
    -- primer vencimiento; después gracia; después corte», así que un plan recién creado nace `ok` y
    -- el alumno tiene el ciclo completo para pagar. Un plan activo NUNCA queda con `paid_through`
    -- null: lo garantiza el CHECK de abajo.
    -- El NULL sigue existiendo como estado legal de planes `paused`/`canceled` importados o
    -- corregidos a mano, y el gate lo lee como 'off' ⇒ FAIL-OPEN, nunca corta (I-3). Es defensa en
    -- profundidad, no el camino normal.
    paid_through date,
    -- Próximo vencimiento. Derivable, pero se materializa para que el cron barra por índice y el
    -- roster pinte el chip sin recalcular.
    next_due_on date,

    -- NULL = heredar coach_billing_settings.default_grace_days. La UI ofrece 0 o 3.
    grace_days smallint check (grace_days is null or grace_days between 0 and 14),
    reminder_days_before smallint default 3
      check (reminder_days_before is null or reminder_days_before between 0 and 30),

    -- ── DESNORMALIZACIÓN DELIBERADA (corrección DB-04b) ──────────────────────────────────────
    -- La gracia efectiva y el interruptor del módulo viven en coach_billing_settings, tabla SIN
    -- policy para el alumno (M1). Sin estas dos columnas, ni el proxy (que lee `clients` como el
    -- alumno) ni `private.student_billing_allowed` pueden resolver el estado sin un lookup extra a
    -- una tabla que el alumno no puede leer. Las escribe SIEMPRE settings.service.ts:
    --   · al guardar coach_billing_settings → UPDATE masivo de los planes vivos del coach
    --   · al crear/editar un plan            → se copian del settings del coach
    -- Así proxy, RLS y motor puro leen LA MISMA columna y no pueden driftar entre sí.
    effective_grace_days smallint not null default 3
      check (effective_grace_days between 0 and 14),
    module_enabled boolean not null default false,

    -- ── DIFERIMIENTO POR CLAIM (R3), TERCERA COLUMNA DESNORMALIZADA ──────────────────────────
    -- El claim «ya pagué» NO reactiva (T-12 sigue en pie): DIFIERE EL CORTE hasta 5 días después
    -- del fin de la gracia. El valor canónico vive en la cuota
    -- (`student_billing_charges.claim_deferral_until`, M3); acá se copia el MÁXIMO vigente del plan
    -- por la misma razón que `effective_grace_days` y `module_enabled` (D-W14): el gate SQL y el
    -- proxy tienen que resolver el estado con UN solo lookup por índice sobre el plan, y el criterio
    -- de paso de §2.1 (≤ 0,15 ms por fila, un Index Scan) no sobrevive a un segundo lateral sobre
    -- cuotas en el camino caliente de `student_write_allowed`.
    -- La escriben SIEMPRE los servicios de claim: `claim.service.ts` al aceptar el aviso y
    -- `reject-claim` / `cobros_confirm_charge` al cerrarlo (vuelve a null).
    claim_deferral_until timestamptz,

    -- ── FRENO DEL MOTOR (corrección B-04 / F-04) ─────────────────────────────────────────────
    -- Se levanta cuando EVA pierde la capacidad de ENTERARSE de los cobros de este plan: conexión
    -- MP revocada, invalid_grant, deauthorized, o desconexión desde EVA. Mientras esté puesto, el
    -- estado del alumno es 'off' (fail-open duro): sin webhook ni token no hay forma de avanzar
    -- paid_through, y el preapproval SIGUE COBRANDO en la cuenta del coach. Cortar a alguien a
    -- quien MP le sigue descontando es el criterio de aborto de la beta.
    engine_hold_at timestamptz,
    engine_hold_reason text
      check (engine_hold_reason is null
             or engine_hold_reason in ('mp_disconnected','mp_deauthorized','mp_invalid_grant','admin')),
    -- La suscripción MP quedó viva y EVA ya no puede cancelarla por API (token muerto): hay que
    -- avisarle al alumno y al coach que la baja se hace desde la app de Mercado Pago (F-04).
    needs_manual_cancel boolean not null default false,

    status text not null default 'active'
        check (status in ('active','paused','canceled')),
    -- Quién dio de baja (el alumno puede cancelar solo — BRIEF §2.2).
    canceled_by text check (canceled_by is null or canceled_by in ('student','coach','provider','eva')),
    canceled_at timestamptz,

    -- Baja SOLO del recordatorio previo (E1). Los demás correos del motor son transaccionales del
    -- contrato alumno↔coach y no se dan de baja (OUTLINE §3.7). Lo escribe una server action del
    -- alumno vía service-role: la columna NO tiene grant. Resuelve el choque G14 de z-completitud
    -- (columna user-editable vs. default-deny) sacándola de `clients`.
    reminder_opt_out_at timestamptz,

    notes text check (notes is null or char_length(notes) <= 500),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- R2: un plan ACTIVO siempre tiene ancla. Si un servicio intenta crear o reactivar un plan sin
    -- `paid_through`, revienta acá y no en producción tres días después, con el alumno cortado o con
    -- el motor inerte. Los `paused`/`canceled` sí pueden tenerlo null.
    constraint client_billing_plans_active_needs_anchor
      check (status <> 'active' or paid_through is not null)
);

-- UN plan vivo por alumno. Los cancelados se conservan (historial) y no cuentan.
create unique index if not exists client_billing_plans_client_live_uidx
    on public.client_billing_plans (client_id)
    where status <> 'canceled';

-- Panel «Cobros del mes» del coach.
create index if not exists client_billing_plans_coach_due_idx
    on public.client_billing_plans (coach_id, next_due_on)
    where status = 'active';

-- Barrido del cron: por fecha, sin filtrar por coach.
create index if not exists client_billing_plans_due_sweep_idx
    on public.client_billing_plans (next_due_on)
    where status = 'active';

-- CAMINO CALIENTE DEL GATE. private.student_billing_allowed (M15) elige UN plan por alumno con un
-- `lateral … order by … limit 1` que incluye los cancelados, así que necesita un índice por
-- client_id SIN el filtro parcial del uidx. Sin esto, el gate hace Seq Scan y el criterio de paso de
-- §2.1 (Index Scan obligatorio) no se cumple.
create index if not exists client_billing_plans_client_any_idx
    on public.client_billing_plans (client_id, created_at desc);

comment on table public.client_billing_plans is
  'Plan de cobro del COACH a SU alumno (motor de los tres modos). paid_through es plata: escritura solo service_role, dentro de las RPCs private.cobros_* (avanza por confirmaciones; retrocede solo por deshacer, reembolso o contracargo — R8). El estado (off/ok/due_soon/due/unpaid/ended) NO se almacena: se deriva con packages/cobros y con private.student_billing_allowed. No confundir con el billing EVA→coach (coaches.subscription_*).';
comment on column public.client_billing_plans.paid_through is
  'Fin del último período pagado, día calendario America/Santiago. Se inicializa = first_due_on al crear el plan (R2) y un plan active nunca lo tiene null (CHECK). NULL = sin ancla ⇒ el gate NO corta (fail-open, opuesto a private.student_write_allowed, que cierra sin ancla).';
comment on column public.client_billing_plans.description is
  'Qué se está cobrando, en palabras del coach y ≤ 140 chars («Asesoría online mensual»). Obligatorio (R21): va en E0/E5/E6, en el aviso previo y en el título del ítem de Checkout Pro.';
comment on column public.client_billing_plans.claim_deferral_until is
  'Copia materializada del diferimiento por claim vivo (student_billing_charges.claim_deferral_until, R3). Mientras now() < este valor el gate NO corta, aunque la gracia esté agotada. Máximo 5 días después del fin de la gracia: el claim compra tiempo, no acceso.';
comment on column public.client_billing_plans.grace_days is
  'NULL = heredar coach_billing_settings.default_grace_days. La UI ofrece 0 o 3 (DECISIONS.md D-B).';
comment on column public.client_billing_plans.effective_grace_days is
  'Copia materializada de grace_days ?? coach_billing_settings.default_grace_days. La escribe settings.service.ts (al guardar ajustes del coach y al crear/editar el plan). Existe para que el proxy y private.student_billing_allowed no tengan que leer coach_billing_settings, tabla sin policy para el alumno.';
comment on column public.client_billing_plans.module_enabled is
  'Copia materializada de coach_billing_settings.enabled. false ⇒ el motor NO aplica a este plan (fail-open). Misma razón que effective_grace_days.';
comment on column public.client_billing_plans.engine_hold_at is
  'Freno del motor: EVA perdió la señal de cobro de este plan (MP desconectado/revocado/deauthorized). Mientras no sea NULL el estado derivado es off y NADIE se corta, porque el preapproval puede seguir cobrando en la cuenta del coach.';

alter table public.client_billing_plans enable row level security;
revoke all on public.client_billing_plans from anon, authenticated;
grant select on public.client_billing_plans to authenticated;
grant all    on public.client_billing_plans to service_role;

-- Coach dueño (standalone) u org-admin. Misma forma que client_payments_workspace_manage
-- (20260525180500:214-260), pero SOLO SELECT: las escrituras van por service-role.
drop policy if exists client_billing_plans_coach_select on public.client_billing_plans;
create policy client_billing_plans_coach_select on public.client_billing_plans
  for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_billing_plans.client_id
        and client_billing_plans.coach_id = (select auth.uid())
        and c.org_id is null
        and c.coach_id = (select auth.uid())
    )
    or exists (
      select 1 from public.clients c
      where c.id = client_billing_plans.client_id
        and c.org_id is not null
        and public.is_org_admin_member(c.org_id)
    )
  );

-- Alumno: ve SU plan. Decisión de producto explícita — /c/<slug>/pagos muestra monto y vencimiento.
-- OJO iOS: la capa de presentación de RN NO renderiza el monto (regla de tiendas). La RLS deja leer;
-- el cliente decide. Ver §4.4 y T-20.
drop policy if exists client_billing_plans_student_select on public.client_billing_plans;
create policy client_billing_plans_student_select on public.client_billing_plans
  for select to authenticated
  using (client_id = (select private.student_self_client_id()));

drop trigger if exists client_billing_plans_updated_at on public.client_billing_plans;
create trigger client_billing_plans_updated_at
  before update on public.client_billing_plans
  for each row execute function public.handle_updated_at();
```

**Decisión del writer (D-W2)**: la policy del alumno usa `private.student_self_client_id()`
(`supabase/migrations/20260805040810_archive_gate_set_based_rls.sql:31`), que devuelve NULL si la ficha
está archivada o pausada. Consecuencia buscada: un alumno archivado **no** ve su plan de cobro,
coherente con las 41 policies `archive_gate_*`.

**Rollback**: `drop policy` ×2, `drop trigger`, y
`drop table if exists public.client_billing_plans cascade;` — el rollback general va en orden inverso
al de aplicación (M16 → M1).

---

### M3 — `20260829091000_student_billing_charges.sql`

```sql
-- student_billing_charges — LA CUOTA. Objeto nuevo del jefe (OUTLINE §3.2).
--
-- Por qué existe: sin cuota no hay dónde colgar el link de pago de ESE ciclo, ni el «ya pagué» del
-- alumno, ni el comprobante, ni el dedupe de correos (dedupe_key = <template>:<charge_id>). Con
-- client_billing_plans sola habría que inventar claves compuestas por período en 6 lugares.
--
-- Ciclo de vida: pending → (claimed) → paid | expired | canceled | refunded | charged_back.
--   pending      = creada por el cron o al confirmar la anterior.
--   claimed      = el alumno avisó «ya pagué». NO reactiva; DIFIERE el corte ≤ 5 días (R3, T-12).
--   paid         = hay un client_payments confirmado; paid_through avanzó a period_end.
--   expired      = el link venció sin pago y el ciclo pasó (solo mp_link).
--   canceled     = el coach canceló/pausó el plan antes de cobrarla.
--   refunded     = el pago que la cerró fue reembolsado (R9): paid_through retrocede.
--   charged_back = contracargo (R9): idem, y el coach recibe C7.
-- «Deshacer confirmación» (R8) NO es un estado: devuelve la cuota a `pending` con `payment_id` null.

create table if not exists public.student_billing_charges (
    id uuid primary key default gen_random_uuid(),

    billing_plan_id uuid not null references public.client_billing_plans(id) on delete cascade,
    client_id uuid not null references public.clients(id) on delete cascade,
    coach_id  uuid not null references public.coaches(id) on delete cascade,

    -- Período que cubre esta cuota (días calendario chilenos).
    period_start date not null,
    period_end   date not null,
    due_on       date not null,
    amount_clp   integer not null check (amount_clp between 0 and 100000000),

    -- Copia del modo al emitir: si el coach cambia de modo a mitad de mes, la cuota viva conserva
    -- el suyo (el link ya emitido sigue siendo válido).
    mode text not null check (mode in ('manual','mp_link','mp_subscription')),

    status text not null default 'pending'
        check (status in ('pending','claimed','paid','expired','canceled','refunded','charged_back')),

    -- mp_link: preference de Checkout Pro creada con el token del coach.
    provider_preference_id text,
    -- URL de checkout hospedada por MP. SE SIRVE SOLO POR API WEB Y POR CORREO. Nunca viaja a la
    -- app nativa (I-6, T-20). Fuera del grant de authenticated (ver abajo).
    checkout_url text,
    checkout_expires_at timestamptz,

    -- ── «YA PAGUÉ» DEL ALUMNO (§8.2) — LAS TRES COLUMNAS DE R3 ───────────────────────────────
    -- Máximo UN claim vivo por cuota: `claimed_at is not null and claim_rejected_at is null`.
    claimed_at timestamptz,
    -- Hasta cuándo se difiere el corte por este claim. Lo calcula el servicio:
    --   min(claimed_at + 5 días, fin_de_gracia + 5 días)  ⇒ NUNCA más de 5 días de regalo.
    -- Forjar claims compra como máximo eso, y el coach lo ve (C2 + recordatorio diario). El claim
    -- NO reactiva: T-12 se mantiene, solo se corre la fecha del corte.
    claim_deferral_until timestamptz,
    -- El coach apretó «Rechazar»: el claim muere, el diferimiento se apaga (plan y cuota vuelven a
    -- null) y el calendario normal sigue su curso desde donde estaba.
    claim_rejected_at timestamptz,
    claim_note text check (claim_note is null or char_length(claim_note) <= 280),
    -- Comprobante en el bucket privado payment-receipts (M11). Path, nunca URL firmada.
    receipt_path text check (receipt_path is null or char_length(receipt_path) <= 400),

    -- El pago que la cerró. **SIN unique** (R16): un pago puede cerrar N cuotas consecutivas
    -- (prepago de N períodos), y entonces N filas comparten el mismo `payment_id`. La cardinalidad
    -- real es «un pago → 1..N cuotas», y el candado del doble cobro es
    -- `student_billing_charges_plan_period_uidx` (una cuota por plan y período), que sigue en pie.
    --
    -- `on delete RESTRICT`, no `set null` (corrección RN-04 / DB-08). Con `set null`, borrar el
    -- client_payments que cerró la cuota dispara un UPDATE que re-evalúa el CHECK de abajo
    -- (`status <> 'paid' or payment_id is not null`) y aborta con **23514**. Y ese DELETE existe
    -- HOY, en la pantalla que este tren revive: apps/mobile/lib/coach-client-detail.ts:1371-1375
    -- (`deleteCoachClientPayment`, PostgREST directo), disparado por el Trash2 de
    -- FacturacionTab.tsx:87-89, que muestra el error crudo en un Alert. Con RESTRICT el borrado
    -- falla con un 23503 legible en vez de un CHECK reventado, y el camino correcto es «Anular
    -- pago» (SPEC §15 caso 13), que revierte cuota + pago en la MISMA transacción.
    payment_id uuid references public.client_payments(id) on delete restrict,

    -- Marca de «ya mandé el correo E4 de corte» (una sola vez por cuota).
    cut_notified_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint student_billing_charges_period_ok check (period_end >= period_start),
    constraint student_billing_charges_paid_needs_payment
      check (status <> 'paid' or payment_id is not null)
);

-- Una cuota por plan y período: candado duro contra el doble cobro del mismo mes.
create unique index if not exists student_billing_charges_plan_period_uidx
    on public.student_billing_charges (billing_plan_id, period_start);

-- Índice NO único sobre el pago (R16): un pago prepagado cierra N cuotas y todas lo apuntan. Sirve
-- para «¿qué cuotas cerró este pago?» al deshacer, reembolsar o revertir (§8.4/§8.5).
create index if not exists student_billing_charges_payment_idx
    on public.student_billing_charges (payment_id)
    where payment_id is not null;

-- Barrido del diferimiento por claim (R3): el sweep tiene que ver los claims vivos y sus recordatorios.
create index if not exists student_billing_charges_claim_open_idx
    on public.student_billing_charges (coach_id, claimed_at)
    where claimed_at is not null and claim_rejected_at is null and status = 'claimed';

create index if not exists student_billing_charges_coach_due_idx
    on public.student_billing_charges (coach_id, due_on desc);

-- Barrido del cron cobros-sweep: solo lo que sigue abierto.
create index if not exists student_billing_charges_due_sweep_idx
    on public.student_billing_charges (due_on)
    where status in ('pending','claimed');

-- Historial de la pill «Pagos» de la ficha.
create index if not exists student_billing_charges_client_idx
    on public.student_billing_charges (client_id, period_start desc);

comment on table public.student_billing_charges is
  'La CUOTA del cobro coach→alumno: período, monto, modo, estado, link de pago (mp_link), aviso «ya pagué» y comprobante. Escritura solo service_role. checkout_url NUNCA se sirve a la app nativa (regla de tiendas).';
comment on column public.student_billing_charges.checkout_url is
  'init_point de MP para esta cuota. Se entrega SOLO por /api/cobros/checkout (web, cookies + chequeo de origen) y por correo. Prohibido en /api/mobile/**: hay un test que lo verifica.';
comment on column public.student_billing_charges.status is
  'pending | claimed | paid | expired | canceled | refunded | charged_back. «claimed» NO otorga acceso: es un aviso del alumno que el coach debe confirmar, y solo DIFIERE el corte hasta claim_deferral_until (R3).';
comment on column public.student_billing_charges.claim_deferral_until is
  'Hasta cuándo el claim difiere el corte: min(claimed_at + 5 días, fin de gracia + 5 días). R3: el «ya pagué» compra tiempo (máx. 5 días, visibles para el coach), nunca acceso.';
comment on column public.student_billing_charges.payment_id is
  'Pago que cerró la cuota. SIN unique (R16): un pago de N períodos cierra N cuotas y todas lo apuntan. on delete restrict: el pago no se borra, se deshace (§8.4).';

alter table public.student_billing_charges enable row level security;
revoke all on public.student_billing_charges from anon, authenticated;

-- GRANT por columna: `checkout_url` fuera del alcance de authenticated. Se obtiene por API, que
-- decide si la superficie puede recibirlo.
grant select (id, billing_plan_id, client_id, coach_id, period_start, period_end, due_on,
              amount_clp, mode, status, provider_preference_id, checkout_expires_at,
              claimed_at, claim_deferral_until, claim_rejected_at, claim_note, receipt_path,
              payment_id, cut_notified_at, created_at, updated_at)
  on public.student_billing_charges to authenticated;
grant all on public.student_billing_charges to service_role;

drop policy if exists student_billing_charges_coach_select on public.student_billing_charges;
create policy student_billing_charges_coach_select on public.student_billing_charges
  for select to authenticated
  using (
    coach_id = (select auth.uid())
    or exists (
      select 1 from public.clients c
      where c.id = student_billing_charges.client_id
        and c.org_id is not null
        and public.is_org_admin_member(c.org_id)
    )
  );

drop policy if exists student_billing_charges_student_select on public.student_billing_charges;
create policy student_billing_charges_student_select on public.student_billing_charges
  for select to authenticated
  using (client_id = (select private.student_self_client_id()));

drop trigger if exists student_billing_charges_updated_at on public.student_billing_charges;
create trigger student_billing_charges_updated_at
  before update on public.student_billing_charges
  for each row execute function public.handle_updated_at();
```

**Trabajo de código que exige el `on delete restrict` (va a W4, no es opcional) — redefinido por R8**:
`FacturacionTab` **pierde el ícono de borrar en toda fila con `charge_id`**. El borrado directo de
`apps/mobile/lib/coach-client-detail.ts:1371-1375` deja de ofrecerse para pagos del motor y se
reemplaza por **«Deshacer confirmación»** (`private.cobros_undo_confirmation`, §8.4) contra una ruta
bearer (`/api/mobile/coach/payments`, patrón de
`apps/web/src/app/api/mobile/coach/payments/route.ts`): solo la **última** confirmación de esa cuota,
**≤ 7 días**, auditada; reabre la cuota (`status='pending'`, `payment_id=null`), deja el pago en
`status='voided'` y **retrocede `paid_through` al valor previo** (I-12). Los pagos **legacy sin
`charge_id`** conservan el borrado actual, que sigue existiendo por la ruta bearer. En la misma ola,
M9 le **revoca `DELETE`** sobre `client_payments` al rol `authenticated` (DB-07), así que el camino
viejo por PostgREST deja de existir en vez de quedar rompiendo con 23503.

---

### M4 — `20260829091500_student_subscriptions.sql`

```sql
-- student_subscriptions — el preapproval MP del ALUMNO hacia la cuenta del COACH (modo
-- mp_subscription). EVA no recauda ni cobra comisión: orquesta y refleja el estado remoto.

create table if not exists public.student_subscriptions (
    id uuid primary key default gen_random_uuid(),

    billing_plan_id uuid not null references public.client_billing_plans(id) on delete cascade,
    client_id uuid not null references public.clients(id) on delete cascade,
    coach_id  uuid not null references public.coaches(id) on delete cascade,

    provider text not null default 'mercadopago' check (provider in ('mercadopago')),
    -- Cuenta VENDEDORA (collector_id del coach en MP). Discrimina de quién es un webhook cuando
    -- todos llegan a la misma URL (marketplace). Id público, no secreto.
    provider_account_id text not null,
    -- preapproval_id. NULL hasta que MP responde el POST ⇒ unique parcial.
    provider_subscription_id text,
    provider_payer_id text,

    amount_clp integer not null check (amount_clp between 0 and 100000000),
    currency text not null default 'CLP' check (currency = 'CLP'),

    status text not null default 'pending'
        check (status in ('pending','authorized','paused','canceled','expired','rejected')),
    provider_status text,

    -- next_payment_date del preapproval, releído tras cada cobro aprobado (patrón de
    -- apps/web/src/lib/payments/providers/mercadopago.ts:348-353).
    next_payment_at timestamptz,
    last_charge_at timestamptz,
    last_charge_status text,
    -- retry_attempt del último authorized_payment: MP reintenta 4 veces en 10 días (research/s8
    -- §3.6). Sirve para el correo E8 y para no cortar por un rechazo transitorio.
    last_retry_attempt smallint,

    cancel_requested_at timestamptz,
    canceled_by text check (canceled_by is null or canceled_by in ('student','coach','provider','eva')),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists student_subscriptions_provider_sub_uidx
    on public.student_subscriptions (provider, provider_subscription_id)
    where provider_subscription_id is not null;

-- Una suscripción VIVA por plan.
create unique index if not exists student_subscriptions_plan_live_uidx
    on public.student_subscriptions (billing_plan_id)
    where status in ('pending','authorized','paused');

create index if not exists student_subscriptions_coach_idx
    on public.student_subscriptions (coach_id, status);
create index if not exists student_subscriptions_account_idx
    on public.student_subscriptions (provider, provider_account_id);
create index if not exists student_subscriptions_client_idx
    on public.student_subscriptions (client_id);

comment on table public.student_subscriptions is
  'Suscripción (preapproval) del ALUMNO hacia la cuenta MP del COACH. status ''canceled'' es TERMINAL en MP: para pausas temporales usar ''paused'' (research/s8 §3.7). Escritura solo service_role (checkout + webhook + reconcile).';

alter table public.student_subscriptions enable row level security;
revoke all on public.student_subscriptions from anon, authenticated;
grant select (id, billing_plan_id, client_id, coach_id, provider, amount_clp, currency, status,
              provider_status, next_payment_at, last_charge_at, last_charge_status,
              cancel_requested_at, canceled_by, created_at, updated_at)
  on public.student_subscriptions to authenticated;
grant all on public.student_subscriptions to service_role;

drop policy if exists student_subscriptions_coach_select on public.student_subscriptions;
create policy student_subscriptions_coach_select on public.student_subscriptions
  for select to authenticated
  using (
    coach_id = (select auth.uid())
    or exists (select 1 from public.clients c
               where c.id = student_subscriptions.client_id
                 and c.org_id is not null
                 and public.is_org_admin_member(c.org_id))
  );

drop policy if exists student_subscriptions_student_select on public.student_subscriptions;
create policy student_subscriptions_student_select on public.student_subscriptions
  for select to authenticated
  using (client_id = (select private.student_self_client_id()));

drop trigger if exists student_subscriptions_updated_at on public.student_subscriptions;
create trigger student_subscriptions_updated_at
  before update on public.student_subscriptions
  for each row execute function public.handle_updated_at();
```

**Decisión del writer (D-W3)**: `provider_subscription_id`, `provider_account_id` y
`provider_payer_id` quedan **fuera** del `grant select` de `authenticated` (r7 §4.6 los dejaba
abiertos, «son ids públicos»). Con el `preapproval_id` en la mano un alumno curioso puede sondear la
API de MP y correlacionar suscripciones. No cuesta nada esconderlos: ninguna pantalla los muestra.

---

### M5 — `20260829092000_student_payment_events.sql`

```sql
-- student_payment_events — bitácora IDEMPOTENTE del motor: webhooks de MP + acciones manuales.
-- El índice único sobre (provider, provider_event_id) es EL candado de replay: el handler hace
-- `insert … on conflict do nothing` ANTES de mutar (§6, T-06).
--
-- CICLO DE VIDA DEL EVENTO (corrección B-01, fijada por R12). El insert-first a secas PIERDE pagos:
-- si el evento se inserta y después falla el re-fetch (502 transitorio de MP), el reintento de MP
-- trae el mismo topic:data.id:action, choca con el unique y sale por «200 deduped» SIN PROCESAR
-- NUNCA el pago. El alumno pagó, la cuota queda pending y el gate lo corta a los 0-3 días. Por eso
-- el evento tiene su propia columna `status` (R12: `status in ('received','applied','failed')`):
--   received → insertado, todavía no aplicado.        (el dedupe NO corta acá: se reprocesa)
--   applied  → el efecto se escribió.                  (el dedupe SÍ corta: fin)
--   failed   → agotó los reintentos; lo levanta el reconcile / se mira a mano. Se REPROCESA.
-- Regla de reproceso del webhook (R12): fila `applied` ⇒ 200 y salir; fila `failed`, o `received`
-- **con más de 2 minutos** ⇒ re-procesar; `received` de hace menos de 2 minutos ⇒ es una entrega
-- concurrente de MP sobre el mismo evento, se responde 200 y se deja trabajar a la primera.
-- El paso a 'applied' ocurre EN LA MISMA TRANSACCIÓN que confirma el pago (§8.1): no hay ventana
-- donde el pago esté escrito y el evento diga 'received', ni al revés.

create table if not exists public.student_payment_events (
    id uuid primary key default gen_random_uuid(),

    -- Nullables: un webhook puede llegar antes de que exista la fila local (o para un recurso
    -- desconocido). Se registra igual y se reconcilia después.
    subscription_id uuid references public.student_subscriptions(id) on delete set null,
    billing_plan_id uuid references public.client_billing_plans(id) on delete set null,
    charge_id uuid references public.student_billing_charges(id) on delete set null,
    client_id uuid references public.clients(id) on delete set null,
    coach_id  uuid references public.coaches(id) on delete cascade,

    provider text not null default 'mercadopago',
    -- IDEMPOTENCIA. Normalizado a minúsculas SIEMPRE (MP minusculiza data.id al firmar:
    -- apps/web/src/lib/payments/webhook-authorization.ts:71-73). Formatos:
    --   webhook : '<topic>:<data.id>:<action>'
    --   manual  : 'manual:<uuid del click>'         (§8.1)
    --   cron    : 'sweep:<charge_id>:<yyyy-mm-dd>'
    provider_event_id text not null,
    provider_payment_id text,
    provider_status text,

    event_kind text not null
      check (event_kind in ('payment','preapproval','authorized_payment','refund','chargeback',
                            'manual_claim','manual_confirm','manual_revert','connection')),
    amount_clp integer check (amount_clp is null or amount_clp between 0 and 100000000),
    occurred_at timestamptz not null default now(),

    -- ── CICLO DE VIDA (B-01) ────────────────────────────────────────────────────────────────
    status text not null default 'received'
      check (status in ('received','applied','failed')),
    attempts smallint not null default 0 check (attempts between 0 and 100),
    applied_at timestamptz,
    last_error text check (last_error is null or char_length(last_error) <= 300),
    -- data.id crudo del recurso, GUARDADO SIEMPRE en el insert-first. Es lo que le permite al
    -- reconcile re-fetchear un evento 'received' sin depender de que MP lo vuelva a mandar.
    provider_resource_id text,
    provider_topic text,

    -- Payload RECORTADO (whitelist de campos, §12.1). NUNCA email/RUT/teléfono/nombre del pagador.
    payload jsonb,
    created_at timestamptz not null default now(),

    constraint student_payment_events_applied_has_ts
      check (status <> 'applied' or applied_at is not null)
);

create unique index if not exists student_payment_events_provider_event_uidx
    on public.student_payment_events (provider, provider_event_id);

-- Barrido del reconcile: lo que entró y nunca se aplicó (B-01, F-02).
create index if not exists student_payment_events_pending_idx
    on public.student_payment_events (created_at)
    where status <> 'applied';

create index if not exists student_payment_events_coach_idx
    on public.student_payment_events (coach_id, occurred_at desc);
create index if not exists student_payment_events_charge_idx
    on public.student_payment_events (charge_id, occurred_at desc);
create index if not exists student_payment_events_client_idx
    on public.student_payment_events (client_id, occurred_at desc);
-- FK sin índice = mordida conocida (20260826010728_index_uncovered_fks_coach_leads_overrides.sql).
create index if not exists student_payment_events_subscription_idx
    on public.student_payment_events (subscription_id);
create index if not exists student_payment_events_plan_idx
    on public.student_payment_events (billing_plan_id);
-- Purga por retención (§12.2).
create index if not exists student_payment_events_created_idx
    on public.student_payment_events (created_at);

comment on table public.student_payment_events is
  'Bitácora idempotente del motor de cobros alumno→coach. (provider, provider_event_id) UNIQUE = candado de replay; el handler inserta ANTES de mutar. status da el ciclo de vida: el dedupe del webhook corta SOLO si la fila ya está en applied; una fila received/failed se REPROCESA (por el reintento de MP o por cobros-mp-reconcile). payload recortado, sin PII del pagador (Ley 19.628 / 21.719).';
comment on column public.student_payment_events.status is
  'received = registrado, sin efecto aplicado · applied = el efecto se escribió (se marca en la MISMA transacción que confirma el pago) · failed = agotó reintentos. NUNCA usar el unique como prueba de «ya procesado»: usar status = applied.';

alter table public.student_payment_events enable row level security;
revoke all on public.student_payment_events from anon, authenticated;
-- payload y provider_event_id FUERA del grant: el payload puede traer contexto y el event id
-- habilita sondeo/replay dirigido. Misma técnica que 20260612140001:37-56 y 20260617033845:19.
-- Las columnas operativas del ciclo de vida (status, attempts, applied_at, last_error,
-- provider_resource_id, provider_topic) TAMPOCO se otorgan: son plomería del motor y
-- provider_resource_id es un id de MP que habilita sondeo. La lista es cerrada a propósito: una
-- columna nueva no entra sola al grant.
grant select (id, subscription_id, billing_plan_id, charge_id, client_id, coach_id, provider,
              provider_payment_id, provider_status, event_kind, amount_clp, occurred_at, created_at)
  on public.student_payment_events to authenticated;
grant all on public.student_payment_events to service_role;

drop policy if exists student_payment_events_coach_select on public.student_payment_events;
create policy student_payment_events_coach_select on public.student_payment_events
  for select to authenticated
  using (coach_id = (select auth.uid()));

drop policy if exists student_payment_events_student_select on public.student_payment_events;
create policy student_payment_events_student_select on public.student_payment_events
  for select to authenticated
  using (client_id = (select private.student_self_client_id()));
```

Sin trigger de `updated_at`: la tabla es append-only por diseño. Y a diferencia de
`subscription_events` (`baseline.sql:3754-3756`, `GRANT ALL` a `anon`/`authenticated`, mina viva
verificada en LIVE por r7 §3.3), esta nace con `revoke all`.

---

### M6 — `20260829092500_coach_payment_connections.sql`

```sql
-- coach_payment_connections — la conexión OAuth del coach con SU MercadoPago. Lo más sensible.
--
-- CERO grants para anon/authenticated + RLS habilitada SIN policies = deny-all doble. El coach NO
-- lee esta tabla ni por PostgREST ni por vista: el estado («Conectado como @nick») lo sirve una API
-- server-side con service-role, patrón de
-- apps/web/src/app/api/payments/subscription-status/route.ts:40.
-- (Se descarta la vista `security_invoker=true` de r7 §4.4: sin grant no puede leer; y la
-- `security_definer` la marcan los advisors de Supabase y el proyecto ya tuvo incidentes por eso.)

create table if not exists public.coach_payment_connections (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches(id) on delete cascade,

    provider text not null default 'mercadopago' check (provider in ('mercadopago')),
    -- Identidad pública del vendedor: user_id de MP = collector_id de los recursos que crea.
    provider_account_id text not null,
    provider_account_nickname text,
    -- site_id de MP. EVA exige MLC (Chile): currency CLP debe ser coherente con la cuenta collector
    -- (research/s8 §2.6).
    provider_site_id text check (provider_site_id is null or char_length(provider_site_id) <= 8),
    live_mode boolean,

    -- ── REFERENCIA PÚBLICA DEL WEBHOOK (corrección R-01) ────────────────────────────────────
    -- El notification_url de cada preference/preapproval se crea DENTRO de la cuenta MP del coach:
    -- cualquier coach conectado puede leerlo con su propio token o desde su panel. Meter
    -- COBROS_WEBHOOK_TOKEN ahí es repartirle un secreto GLOBAL a N terceros. En su lugar la URL
    -- lleva este ref: público, opaco, POR CONEXIÓN. No autoriza nada por sí solo (la firma HMAC
    -- sigue siendo la barrera); sirve para resolver el dueño del evento sin creerle a body.user_id.
    -- Se genera con gen_random_bytes(16) y se puede rotar sin tocar nada más que los recursos vivos.
    webhook_ref text not null default encode(gen_random_bytes(16), 'hex')
      check (webhook_ref ~ '^[0-9a-f]{32}$'),

    -- SECRETOS. Ciphertext AES-256-GCM producido por la app; la DB nunca ve el token en claro.
    -- Formato exacto en §5.4: v<n>.<b64url(iv)>.<b64url(tag)>.<b64url(ciphertext)>
    access_token_enc  text,
    refresh_token_enc text,
    -- Versión de la clave de cifrado, para rotar sin downtime (§5.5).
    enc_key_version smallint not null default 1,
    -- Huella corta NO reversible (sha256 del token en claro, primeros 12 hex) para soporte y para
    -- detectar «reconectó con la misma cuenta» sin descifrar nada.
    access_token_fingerprint text
      check (access_token_fingerprint is null or char_length(access_token_fingerprint) <= 24),

    scope text,
    token_type text,
    expires_at timestamptz,               -- vencimiento del access_token (180 días en MP)
    connected_at timestamptz not null default now(),
    last_refreshed_at timestamptz,
    last_refresh_error text
      check (last_refresh_error is null or char_length(last_refresh_error) <= 200),

    status text not null default 'active'
        check (status in ('active','expired','revoked','error')),
    revoked_at timestamptz,
    revoked_reason text
      check (revoked_reason is null or revoked_reason in ('coach','deauthorized','invalid_grant','admin')),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Una conexión viva por (coach, provider); las revocadas se conservan para auditoría.
create unique index if not exists coach_payment_connections_live_uidx
    on public.coach_payment_connections (coach_id, provider)
    where status in ('active','error');

-- Resolver el dueño de un webhook por cuenta vendedora, en O(1) (T-08).
create unique index if not exists coach_payment_connections_account_uidx
    on public.coach_payment_connections (provider, provider_account_id)
    where status in ('active','error');

-- Resolver el dueño por la URL del webhook, en O(1) (R-01). Unique global: el ref es la identidad.
create unique index if not exists coach_payment_connections_webhook_ref_uidx
    on public.coach_payment_connections (webhook_ref);

-- Cron de refresh: tokens que vencen pronto.
create index if not exists coach_payment_connections_expiring_idx
    on public.coach_payment_connections (expires_at)
    where status = 'active';

comment on table public.coach_payment_connections is
  'Conexión OAuth del coach con MercadoPago (app «EVA Cobros»). access_token_enc/refresh_token_enc son CIFRADOS por la aplicación (AES-256-GCM, clave en env de Vercel): la DB nunca ve el token en claro. NINGÚN rol de cliente tiene grant: se lee SOLO con service_role. El estado para la UI se sirve por API.';
comment on column public.coach_payment_connections.enc_key_version is
  'Versión de COBROS_OAUTH_ENC_KEY_Vn con la que se cifró la fila. Permite rotar sin downtime: se lee con la versión de la fila y se re-cifra en background.';

alter table public.coach_payment_connections enable row level security;
revoke all on public.coach_payment_connections from anon, authenticated;
grant all on public.coach_payment_connections to service_role;
-- RLS habilitada y CERO policies ⇒ deny-all para cualquier rol no-bypass, incluso si alguien
-- devolviera los grants por error. Defensa en profundidad deliberada (T-10).

drop trigger if exists coach_payment_connections_updated_at on public.coach_payment_connections;
create trigger coach_payment_connections_updated_at
  before update on public.coach_payment_connections
  for each row execute function public.handle_updated_at();

-- Verificación in-migration (patrón de 20260617033845:40-46): si el grant queda abierto, fallar.
do $$
begin
  if has_table_privilege('authenticated', 'public.coach_payment_connections', 'SELECT') then
    raise exception 'coach_payment_connections: authenticated conserva SELECT — abortando';
  end if;
  if has_table_privilege('anon', 'public.coach_payment_connections', 'SELECT') then
    raise exception 'coach_payment_connections: anon conserva SELECT — abortando';
  end if;
end $$;
```

---

### M7 — `20260829093000_coach_payment_connection_events.sql`

```sql
-- Bitácora de la conexión: quién conectó/desconectó, desde dónde y por qué. Sin esto, una
-- desvinculación silenciosa (mp-connect) es indistinguible de un bug nuestro.

create table if not exists public.coach_payment_connection_events (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches(id) on delete cascade,
    provider text not null default 'mercadopago',
    action text not null
      check (action in ('connect','refresh','refresh_failed','revoke','deauthorized','expire','error')),
    -- IP y UA para investigar un secuestro de callback (T-14). Retención 180 días (§12.2).
    ip_address text check (ip_address is null or char_length(ip_address) <= 64),
    user_agent text check (user_agent is null or char_length(user_agent) <= 300),
    detail jsonb,
    created_at timestamptz not null default now()
);

create index if not exists coach_payment_connection_events_idx
  on public.coach_payment_connection_events (coach_id, created_at desc);
create index if not exists coach_payment_connection_events_created_idx
  on public.coach_payment_connection_events (created_at);

comment on table public.coach_payment_connection_events is
  'Auditoría de la conexión OAuth del coach con MP: connect/refresh/revoke/deauthorized. `detail` NUNCA contiene tokens ni ciphertext (solo códigos de error y el provider_account_id).';

alter table public.coach_payment_connection_events enable row level security;
revoke all on public.coach_payment_connection_events from anon, authenticated;
grant all on public.coach_payment_connection_events to service_role;
```

---

### M8 — `20260829093500_client_payments_cobros_columns.sql`

```sql
-- Columnas nuevas en client_payments (aditivas). client_payments sigue siendo LA tabla del pago
-- confirmado: el motor no crea una tabla paralela (el coach ya la ve en dashboard y en RN).
-- Deuda que se cierra de paso: apps/mobile/lib/coach-client-detail.ts:802 pide `receipt_url` en su
-- primer intento y cae al fallback de :803 porque la columna no existe desde el baseline. Acá la
-- columna se llama `receipt_path` (path de Storage privado, no URL): RN deberá actualizar su primer
-- intento, o seguirá cayendo al fallback sin romperse.

alter table public.client_payments
  add column if not exists billing_plan_id uuid
      references public.client_billing_plans(id) on delete set null,
  add column if not exists charge_id uuid
      references public.student_billing_charges(id) on delete set null,
  add column if not exists source text not null default 'manual'
      check (source in ('manual','student_claim','mp_link','mp_subscription')),
  add column if not exists provider_payment_id text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists receipt_path text,
  add column if not exists confirmed_by uuid references public.coaches(id) on delete set null,
  add column if not exists confirmed_at timestamptz,
  -- R16 — PREPAGO: cuántos períodos consecutivos cierra este pago. 1 = el caso normal. Con N > 1,
  -- N cuotas comparten este payment_id (por eso R16 saca el unique de charges.payment_id) y
  -- paid_through va al period_end de la última.
  add column if not exists periods_covered smallint not null default 1
      check (periods_covered between 1 and 24);

-- IDEMPOTENCIA del riel automático: un pago de MP entra UNA vez, pase lo que pase con los reintentos.
create unique index if not exists client_payments_provider_payment_uidx
  on public.client_payments (provider_payment_id)
  where provider_payment_id is not null;

-- IDEMPOTENCIA de la confirmación manual: un PAGO VIVO por cuota (el doble tap del coach en móvil no
-- suma dos meses de acceso — r7 §5.3). Es el sentido contrario al de R16: R16 dice que un pago puede
-- cubrir N cuotas; esto dice que una cuota no puede tener dos pagos vivos. Las dos cosas conviven.
-- Parcial por `status = 'paid'` a propósito: deshacer (§8.4) deja el pago en 'voided' con charge_id
-- null, y un reembolso lo deja en 'refunded' — en ambos casos la cuota queda libre para volver a
-- confirmarse sin chocar con el índice.
create unique index if not exists client_payments_charge_uidx
  on public.client_payments (charge_id)
  where charge_id is not null and status = 'paid';

create index if not exists client_payments_plan_idx
  on public.client_payments (billing_plan_id, payment_date desc);

comment on column public.client_payments.source is
  'manual = el coach lo registró a mano · student_claim = el alumno avisó y el coach confirmó · mp_link = pago de una preference Checkout Pro del coach · mp_subscription = cuota de un preapproval. Default manual: las 11 filas históricas quedan como manual.';
comment on column public.client_payments.provider_payment_id is
  'ID del pago en el gateway. UNIQUE parcial = candado de replay del webhook.';
comment on column public.client_payments.receipt_path is
  'Path en el bucket privado payment-receipts. NUNCA una URL firmada persistida (las firmas caducan y no deben quedar en la DB).';
comment on column public.client_payments.periods_covered is
  'R16: cuántos períodos consecutivos cierra este pago (prepago). 1 = normal. Las N cuotas cubiertas comparten este payment_id, y paid_through va al period_end de la última.';
comment on column public.client_payments.status is
  'Vocabulario del motor de cobros (la columna es text libre desde el baseline, sin CHECK): paid = vigente · voided = confirmación DESHECHA por el coach (R8) · refunded / charged_back = plata devuelta o desconocida (R9) · duplicate = segundo pago aprobado sobre una cuota ya pagada, con charge_id null (R9). Las 11 filas históricas siguen en ''paid''.';

-- NO se emiten GRANT UPDATE de estas columnas: client_payments arrastra GRANT ALL del baseline
-- (00000000000001_baseline.sql:3592-3594) y el candado real hoy es la RLS. El REVOKE va en M9,
-- migración propia con su censo.
```

**Decisión del writer (D-W4)**: `client_payments.amount` sigue siendo `numeric(10,2)`. Cambiar el
tipo de una columna con 11 filas históricas y lectores en web
(`apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts:438`), RN
(`apps/mobile/lib/coach-dashboard.ts:913`) y enterprise congelada
(`apps/web/src/infrastructure/db/org.repository.ts:557`) es riesgo sin premio. Las tablas nuevas usan
`integer` CLP (I-8) y el servicio convierte al escribir.

---

### M9 — `20260829094000_client_payments_revoke_anon.sql`

> **Ampliada por la corrección DB-07.** El REVOKE de `anon` no alcanzaba: `authenticated` conserva
> el `GRANT ALL` del baseline (verificado: `00000000000001_baseline.sql:3590-3592`,
> `GRANT ALL ON TABLE "public"."client_payments" TO "anon"|"authenticated"`) y la policy
> `client_payments_workspace_manage` es `FOR ALL`. O sea: **el coach puede escribir por PostgREST las
> columnas nuevas de M8**. Dos abusos concretos, ninguno hipotético: (a) insertar a mano un
> `provider_payment_id` que MP va a mandar después ⇒ cuando llegue el webhook real choca con
> `client_payments_provider_payment_uidx`, sale por `already_confirmed` y **`paid_through` no avanza
> nunca**; (b) ocupar el `charge_id` de una cuota abierta y bloquear su confirmación. El motor
> escribe siempre con service-role, así que quitarle la escritura a `authenticated` no le saca nada
> a nadie — salvo al `delete` de RN, que se migra a ruta bearer (ver M3).

```sql
-- REVOKE del GRANT ALL heredado del baseline sobre client_payments (hallazgo 🔴 de r3 §1.4 y
-- r7 §1.3; verificado en LIVE: has_table_privilege('anon','public.client_payments','SELECT') = true,
-- baseline.sql:3592-3594).
--
-- CENSO PREVIO OBLIGATORIO (correr ANTES, en LIVE, y pegar el resultado en el PR):
--   -- 1) Grants actuales
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema='public' and table_name='client_payments' order by 1,2;
--   -- 2) Lectores conocidos, TODOS con rol `authenticated` o service-role:
--   --    apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts:438   (coach, authenticated)
--   --    apps/web/src/services/client/client.service.ts:48, :89            (service-role vía action)
--   --    apps/mobile/lib/coach-client-detail.ts:802-803, :1372             (coach, PostgREST)
--   --    apps/mobile/lib/coach-dashboard.ts:913                             (coach, PostgREST)
--   --    apps/web/src/app/api/mobile/coach/payments/route.ts                (bearer → service-role)
--   --    apps/web/src/app/org/[slug]/payments/*                             (enterprise CONGELADA)
--   -- Ninguno corre como `anon`. El árbol público /c/[coach_slug] pre-login NO toca esta tabla
--   -- (el proxy solo lee `coaches` de branding, apps/web/src/proxy.ts:329).
--   -- 3) Ensayo: begin; <revoke>; set local role anon; select … ; rollback;

revoke all on public.client_payments from anon;

-- `authenticated` pierde la ESCRITURA y conserva solo la lectura que la RLS ya filtra (coach dueño
-- y team pool). Sin esto, las columnas nuevas de M8 son escribibles por el coach desde PostgREST y
-- se puede envenenar la idempotencia del riel MP (DB-07).
revoke insert, update, delete, truncate on public.client_payments from authenticated;
grant select on public.client_payments to authenticated;

-- CENSO DE ESCRITORES QUE SE ROMPEN A PROPÓSITO (verificado; migrar en la MISMA ola, W4 — sin esto,
-- M9 es una regresión, no un endurecimiento):
--   1. apps/mobile/lib/coach-client-detail.ts:1371-1375  deleteCoachClientPayment: DELETE por
--      PostgREST como `authenticated`, disparado por el Trash2 de FacturacionTab.tsx:87-89.
--      → pasa a POST /api/mobile/coach/payments (acción «Deshacer confirmación», R8 / SPEC §15 caso 13).
--   2. apps/web/src/services/client/client-detail.service.ts:701-709 `deletePayment` y :690-698
--      `addPayment`: crean el cliente con createClient() (cookies ⇒ rol `authenticated`) y se lo
--      pasan a deletePaymentForCoach / addPaymentForCoach (client.service.ts:46, :64).
--      → cambiar SOLO el cliente inyectado por el admin de service-role. El guard de pertenencia
--        ya vive en el servicio (assertCoachCanManageClient, client.service.ts:27-45), así que no
--        se pierde ninguna barrera: se cambia el gate de RLS por el guard explícito, que es el
--        patrón que ya usa la ruta bearer de RN.
--   3. apps/web/src/app/api/mobile/coach/payments/route.ts: bearer → service-role. No se toca.
-- Lecturas (dashboard.queries.ts:438, coach-dashboard.ts:913, coach-client-detail.ts:802-803):
-- intactas, `authenticated` conserva SELECT.

do $$
begin
  if has_table_privilege('anon', 'public.client_payments', 'SELECT')
     or has_table_privilege('anon', 'public.client_payments', 'INSERT')
     or has_table_privilege('anon', 'public.client_payments', 'UPDATE')
     or has_table_privilege('anon', 'public.client_payments', 'DELETE') then
    raise exception 'client_payments: anon conserva privilegios tras el REVOKE — abortando';
  end if;
  if has_table_privilege('authenticated', 'public.client_payments', 'INSERT')
     or has_table_privilege('authenticated', 'public.client_payments', 'UPDATE')
     or has_table_privilege('authenticated', 'public.client_payments', 'DELETE') then
    raise exception 'client_payments: authenticated conserva escritura tras el REVOKE — abortando';
  end if;
  if not has_table_privilege('authenticated', 'public.client_payments', 'SELECT') then
    raise exception 'client_payments: authenticated perdió SELECT — el coach dejaría de ver sus pagos';
  end if;
end $$;

comment on table public.client_payments is
  'Pagos del alumno al coach. Desde 2026-08-29 el rol anon NO tiene privilegios (el GRANT ALL era herencia del default de Supabase, baseline:3592). Escrituras del motor: service_role con guard de pertenencia.';
```

**Rollback** (solo si algo rompe): `grant all on public.client_payments to anon;` — y abrir incidente,
porque significa que hay un camino `anon` que el censo no encontró.

---

### M10 — `20260829094500_client_email_ledger.sql`

```sql
-- client_email_ledger — espejo de coach_email_ledger (20260822004243) para los correos al ALUMNO.
-- Hoy los correos al alumno salen fire-and-forget, sin dedupe ni traza (maps/r4-emails.md §0.3).
--
-- TRAMPA QUE NO SE REPITE: el dedupe de coach_email_ledger es
-- `unique (coach_id, template_key) where status <> 'failed'` (20260822005701:11-13) ⇒ UNA fila viva
-- por key PARA SIEMPRE; un recordatorio mensual con key fija se mandaría una sola vez en la vida
-- (lo advierte coach-email-ledger.service.ts:66-67). Acá el dedupe es por `dedupe_key` explícito,
-- que SIEMPRE incluye el charge_id:
--   'cobro_recordatorio:<charge_id>' · 'cobro_vencido:<charge_id>' · 'cobro_cortado:<charge_id>'

create table if not exists public.client_email_ledger (
    id uuid primary key default gen_random_uuid(),

    client_id uuid not null references public.clients(id) on delete cascade,
    coach_id  uuid not null references public.coaches(id) on delete cascade,
    charge_id uuid references public.student_billing_charges(id) on delete set null,

    -- Identidad lógica: cobro_recordatorio | cobro_link | cobro_vencido | cobro_corte_manana |
    -- cobro_cortado | cobro_confirmado | cobro_sub_activada | cobro_sub_cancelada |
    -- cobro_rechazado | cobro_plan_cambiado | cobro_reactivado
    template_key text not null,
    -- Clave de dedupe COMPLETA (incluye charge_id o período). Unique parcial abajo.
    dedupe_key text not null,

    -- OJO (corrección DB-03): el vocabulario es el de EMAILS.md §1.1:79 —
    -- 'cron' | 'coach_action' | 'webhook' | 'transactional', que es el que usa el parámetro
    -- `trigger` de sendCobrosEmailOnce en sus 13 llamadas (EMAILS.md:221, 272, 312, 358, 396, 439,
    -- 484, 590, 633). La versión anterior de este CHECK decía ('sweep','event','transactional'):
    -- tres de cada cuatro escrituras habrían reventado con 23514 y, como el cron es FAIL-CLOSED
    -- ante un ledger ilegible (EMAILS §1.1 inv. 3, calcado de api/cron/cap-nudge/route.ts:42-47),
    -- el motor no habría mandado UN SOLO correo, en silencio. Si mañana cambia el vocabulario,
    -- cambia en los dos lados EN EL MISMO PR.
    trigger text not null check (trigger in ('cron','coach_action','webhook','transactional')),
    -- Los 8 retornos de sendCobrosEmailOnce son 'sent' | 'skipped_*' (×6) | 'failed'. Los
    -- `skipped_*` NO dejan fila (se cortan antes de escribir), así que acá solo entran 'sent' y
    -- 'failed' desde el servicio; el resto de los valores los escribe el webhook de Resend
    -- (delivered/bounced/complained) o el propio cron ('scheduled'/'cancelled').
    -- CONSECUENCIA A MIRAR (queda como pregunta, ver §15.6): la exclusión «última fila bounced /
    -- complained» de EMAILS §1.1 inv. 6 depende de que el webhook de Resend efectivamente escriba
    -- esos estados. Si no se cablea, esa exclusión nunca se cumple y es letra muerta.
    status text not null
      check (status in ('scheduled','sent','delivered','bounced','complained','cancelled','failed')),
    provider_message_id text unique,

    sent_at timestamptz,
    delivered_at timestamptz,
    error text check (error is null or char_length(error) <= 300),

    -- Contexto de auditoría SIN PII: nunca el correo del alumno, nunca el cuerpo, nunca el monto.
    -- Se guarda { template, charge_id, period_end, mode }.
    payload jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Dedupe atómico: el segundo INSERT falla con 23505 y el service lo trata como `deduped` (misma
-- mecánica que coach-email-ledger.service.ts:92). `failed` fuera: un correo que nunca salió debe
-- poder reintentarse.
create unique index if not exists client_email_ledger_dedupe_uidx
    on public.client_email_ledger (dedupe_key)
    where status <> 'failed';

create index if not exists client_email_ledger_client_idx
    on public.client_email_ledger (client_id, created_at desc);
create index if not exists client_email_ledger_coach_idx
    on public.client_email_ledger (coach_id, created_at desc);
create index if not exists client_email_ledger_charge_idx
    on public.client_email_ledger (charge_id);
create index if not exists client_email_ledger_created_idx
    on public.client_email_ledger (created_at);

comment on table public.client_email_ledger is
  'Libro mayor de correos que EVA le manda al ALUMNO por el motor de cobros. dedupe_key SIEMPRE incluye charge_id o período (la trampa de coach_email_ledger: una fila viva por key para siempre). payload sin PII.';

alter table public.client_email_ledger enable row level security;
revoke all on public.client_email_ledger from anon, authenticated;
-- El coach ve qué se le mandó a su alumno (soporte: «¿le llegó el recordatorio?»).
grant select (id, client_id, coach_id, charge_id, template_key, trigger, status,
              sent_at, delivered_at, created_at)
  on public.client_email_ledger to authenticated;
grant all on public.client_email_ledger to service_role;

drop policy if exists client_email_ledger_coach_select on public.client_email_ledger;
create policy client_email_ledger_coach_select on public.client_email_ledger
  for select to authenticated
  using (coach_id = (select auth.uid()));

drop trigger if exists client_email_ledger_updated_at on public.client_email_ledger;
create trigger client_email_ledger_updated_at
  before update on public.client_email_ledger
  for each row execute function public.handle_updated_at();
```

**Decisión del writer (D-W5)**: el alumno **no** tiene policy de lectura sobre su propio ledger. No
hay pantalla que lo muestre y expone el ritmo del dunning. Si mañana se quiere, es una policy de una
línea.

---

### M11 — `20260829095000_payment_receipts_bucket.sql`

```sql
-- Bucket privado para los comprobantes de transferencia que sube el ALUMNO desde la web.
-- Path canónico: <coach_id>/<client_id>/<charge_id>.<ext>
--   · El primer segmento es el COACH porque quien tiene que leer siempre es él; el alumno escribe
--     dentro de su propia subcarpeta. Las policies lo resuelven con un join a clients.
--   · Privado: nada de URLs públicas. La descarga va por signed URL de 60 s generada server-side.
-- Gotcha vivo (memoria del owner): el WAF de Cloudflare ya rompió uploads de fotos (check-in HEIC,
-- logos). El upload usa el mismo cliente y content-type que el de check-ins.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 5242880,
        array['image/jpeg','image/jpg','image/png','image/webp','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- INSERT del alumno: solo dentro de <coach_id de SU coach>/<su propio client_id>/…
drop policy if exists "payment_receipts_student_insert" on storage.objects;
create policy "payment_receipts_student_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[2] = (select private.student_self_client_id())::text
  and exists (
    select 1 from public.clients c
    where c.id = (select private.student_self_client_id())
      and c.coach_id::text = (storage.foldername(name))[1]
  )
);

-- SELECT del alumno: su propia carpeta.
drop policy if exists "payment_receipts_student_select" on storage.objects;
create policy "payment_receipts_student_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[2] = (select private.student_self_client_id())::text
);

-- SELECT del coach: toda su carpeta.
drop policy if exists "payment_receipts_coach_select" on storage.objects;
create policy "payment_receipts_coach_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- DELETE: solo el coach dueño (el alumno no borra evidencia de pago; si se equivocó sube otra y el
-- charge apunta al último receipt_path).
drop policy if exists "payment_receipts_coach_delete" on storage.objects;
create policy "payment_receipts_coach_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Sin policy de UPDATE: un comprobante no se sobreescribe, se reemplaza con otro nombre.
```

Forma copiada de `supabase/migrations/20260525181500_storage_workspace_policies.sql:117-155`
(`(storage.foldername(name))[1] = auth.uid()::text`). El bucket nace **privado** desde el día 1: no
repetimos el flip posterior de `checkins`
(`supabase/migrations/_POST_DEPLOY_20260608200100_checkins_bucket_private.sql:12`).

---

### M12 — `20260829095500_platform_flags.sql`  (**R14**)

```sql
-- platform_flags — interruptores de plataforma que la BASE DE DATOS tiene que poder leer.
--
-- Por qué existe (R14): el kill-switch de cobros vivía SOLO en Edge Config, y la RLS no puede leer
-- Edge Config. O sea: apagar el módulo desde el panel dejaba el gate DB cortando gente igual, y la
-- única salida era re-aplicar el rollback de M16 (una migración, a mano, de madrugada). Con esta
-- tabla el gate tiene su propio interruptor y el kill-switch apaga LAS DOS COSAS en un click.
--
-- Tabla service-role-only: ningún rol de cliente la lee ni la escribe. La función que la consulta es
-- `security definer`, así que el gate la ve sin darle grants a nadie.

create table if not exists public.platform_flags (
    key text primary key,
    enabled boolean not null default true,
    note text check (note is null or char_length(note) <= 300),
    updated_by uuid,
    updated_at timestamptz not null default now()
);

comment on table public.platform_flags is
  'Interruptores de plataforma legibles DESDE LA BASE (a diferencia de Edge Config). Service-role-only. Hoy: key=''cobros_gate'' (R14). Fila ausente = encendido (fail-open del interruptor, igual que el kill-switch de cobros: un flag que no se pudo leer no puede apagarle el cobro a nadie).';

alter table public.platform_flags enable row level security;
revoke all on public.platform_flags from anon, authenticated;
grant all on public.platform_flags to service_role;
-- RLS on + CERO policies = deny-all doble, igual que coach_payment_connections (M6).

-- Semilla explícita: el gate nace ENCENDIDO. Idempotente.
insert into public.platform_flags (key, enabled, note)
values ('cobros_gate', true, 'Gate DB del alumno moroso (private.student_billing_allowed). false = el gate deja pasar a todos.')
on conflict (key) do nothing;

-- ── La función que lee el flag desde el camino caliente ──────────────────────────────────────
-- STABLE: dentro de una misma sentencia se evalúa una vez, así que el costo por fila del gate no
-- cambia (criterio de paso de §2.1). `security definer` para que no haga falta grant sobre la tabla.
create or replace function private.cobros_gate_enabled()
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  -- Fila ausente ⇒ TRUE. Un flag que alguien borró por error no puede apagar el gate en silencio…
  -- y, al revés, un `false` explícito lo apaga entero. Es la misma polaridad que D-W12.
  select coalesce((select f.enabled from public.platform_flags f where f.key = 'cobros_gate'), true);
$fn$;

comment on function private.cobros_gate_enabled() is
  'Interruptor DB del gate de cobros (R14). false ⇒ private.student_billing_allowed devuelve true para todos. Fila ausente ⇒ true (encendido). Lo apaga el endpoint admin del kill-switch, que escribe ESTA fila y Edge Config en el mismo click.';

revoke all on function private.cobros_gate_enabled() from public, anon;
grant execute on function private.cobros_gate_enabled() to authenticated;
```

**Rollback** `supabase/tests/20260829095500_platform_flags_rollback.sql`:

```sql
drop function if exists private.cobros_gate_enabled();
drop table if exists public.platform_flags;
```

> El rollback **no** se corre mientras M15 exista: M15 invoca la función. Orden inverso siempre
> (M16 → M15 → M14 → M13 → M12 → …).

---

### M13 — `20260829100000_student_billing_consents.sql`  (**R21**)

```sql
-- student_billing_consents — LA EVIDENCIA de que el alumno aceptó un cobro recurrente.
--
-- R21: hay aviso previo en el PRIMER checkout de mp_link (versión corta) y en la suscripción
-- (versión completa). Sin una fila por consentimiento, ante un contracargo o un reclamo del SERNAC
-- no hay nada que mostrar salvo un log. Es la pieza legal del módulo, no telemetría.
--
-- NO guarda la IP en claro: `ip_hash` = sha256(ip || pepper de servidor), suficiente para «¿fue la
-- misma máquina?» sin persistir un dato personal directo (Ley 19.628 / 21.719).

create table if not exists public.student_billing_consents (
    id uuid primary key default gen_random_uuid(),

    client_id uuid not null references public.clients(id) on delete cascade,
    plan_id   uuid not null references public.client_billing_plans(id) on delete cascade,

    -- 'subscription'    = aviso previo COMPLETO antes del preapproval (mp_subscription).
    -- 'first_checkout'  = aviso previo CORTO antes del primer pago de mp_link.
    kind text not null check (kind in ('subscription','first_checkout')),

    -- Versión del texto que se le mostró. Sin esto, la evidencia no dice QUÉ aceptó.
    terms_version text not null check (char_length(terms_version) between 1 and 32),
    consented_at timestamptz not null default now(),

    ip_hash text check (ip_hash is null or char_length(ip_hash) <= 64),
    user_agent text check (user_agent is null or char_length(user_agent) <= 300),

    created_at timestamptz not null default now()
);

create index if not exists student_billing_consents_client_idx
    on public.student_billing_consents (client_id, consented_at desc);
create index if not exists student_billing_consents_plan_idx
    on public.student_billing_consents (plan_id, consented_at desc);
-- Purga/retención: 24 meses (§12.2). Índice por fecha para el censo, no para borrar automático.
create index if not exists student_billing_consents_created_idx
    on public.student_billing_consents (created_at);

comment on table public.student_billing_consents is
  'Consentimiento del ALUMNO al cobro recurrente (R21): aviso previo completo antes del preapproval y corto antes del primer checkout de mp_link. Evidencia legal ante contracargo o reclamo. Retención 24 meses y EXCLUIDA de purge-data (§12.2). ip_hash, nunca la IP en claro.';

alter table public.student_billing_consents enable row level security;
revoke all on public.student_billing_consents from anon, authenticated;
grant all on public.student_billing_consents to service_role;
-- Sin grants ni policies para clientes: la evidencia se exporta desde admin (CSV), no se navega.
```

**Rollback**: `drop table if exists public.student_billing_consents;`

---

### M14 — `20260829100500_cobros_rpcs.sql`  (**R13**)

Las **cuatro** funciones de plata del riel, todas `security definer` en el schema **`private`**, todas
con `select … for update` sobre el plan, todas **sin grant a `authenticated`** (se invocan con
service-role desde el servidor):

| Función | Qué hace | Cuerpo completo |
|---|---|---|
| `private.cobros_confirm_charge(...)` | Confirma una cuota (las cuatro fuentes) y avanza `paid_through`. | §8.1 |
| `private.cobros_apply_provider_payment(...)` | Aplica un pago de MP resolviendo la cuota **por período** (R10) y delega en la anterior. | §8.3 |
| `private.cobros_undo_confirmation(...)` | Deshace la ÚLTIMA confirmación de una cuota (≤ 7 días) y **retrocede** `paid_through` (R8). | §8.4 |
| `private.cobros_revert_charge(...)` | Reembolso / contracargo: cuota + pago + retroceso de `paid_through` (R9). | §8.5 |

Más los dos helpers puros que usan: `private.cobros_charge_description(charge)` y
`private.cobros_next_due_on(charge, plan_id)`.

```sql
-- El archivo M14 contiene, en este orden y con el DDL literal de §8:
--   1. private.cobros_charge_description(public.student_billing_charges) → text     (immutable)
--   2. private.cobros_next_due_on(public.student_billing_charges, uuid)  → date     (stable)
--   3. private.cobros_confirm_charge(...)        → jsonb   (§8.1)
--   4. private.cobros_apply_provider_payment(...)→ jsonb   (§8.3)
--   5. private.cobros_undo_confirmation(...)     → jsonb   (§8.4)
--   6. private.cobros_revert_charge(...)         → jsonb   (§8.5)
--   7. private.cobros_claim_charge(...)          → jsonb   (§8.2: claim + diferimiento, R3)
--   8. private.cobros_reject_claim(...)          → jsonb   (§8.2: apaga el diferimiento, R3)
--   9. private.cobros_cancel_subscription_local(...) → void  (§5.8: espejo local de la baja en MP)
--  10-13. Las de conexión (§5.6): cobros_lock_connection, cobros_apply_refresh,
--         cobros_revoke_connection, cobros_note_refresh_error.
--  Y los dos helpers de período que usa §8.3: cobros_period_start_for / cobros_period_end_for.
--
-- Y, al final, el candado de grants que hace de esto una barrera y no una decoración:

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname like 'cobros\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Verificación in-migration (patrón de M6): si alguna quedó ejecutable por el rol del alumno, abortar.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname like 'cobros\_%'
       and p.proname <> 'cobros_gate_enabled'   -- esa SÍ la ejecuta authenticated (la llama el gate)
  loop
    if has_function_privilege('authenticated', f.sig, 'EXECUTE') then
      raise exception 'R13: % es ejecutable por authenticated — abortando', f.sig;
    end if;
  end loop;
end $$;
```

**Por qué `private` y no `public`** (R13): una función `security definer` en `public` es visible en
PostgREST y basta un `grant execute` accidental —o un `alter default privileges` heredado— para que el
alumno pueda invocar «confirmame el pago». En `private` no hay ruta PostgREST posible: el schema no
está expuesto. Es la misma decisión que ya toman `private.student_write_allowed` y
`private.student_self_client_id`.

**Rollback** `supabase/tests/20260829100500_cobros_rpcs_rollback.sql`: `drop function if exists` de las
seis, en orden inverso. Sin datos que migrar.

---

### M15 — `20260829101000_student_billing_allowed.sql`

```sql
-- private.student_billing_allowed — gate DB del alumno MOROSO. Espejo SQL de
-- packages/cobros/state.ts (resolveStudentBillingState).
--
-- *** CONTRATO: ESTA FUNCION FALLA ABIERTO. *** Es lo contrario de private.student_write_allowed
-- (que cierra sin ancla, NUT-033). Motivos, escritos para que nadie lo "arregle":
--   1. El alumno le paga al COACH, no a EVA. Un bug nuestro no puede cortarle el entrenamiento a
--      alguien que pagó (T-15).
--   2. Sin plan, sin ancla (paid_through null), con el módulo apagado, con el gate apagado
--      (private.cobros_gate_enabled = false, R14) o con el coach fuera de Pro efectivo ⇒ NO SE CORTA.
--   3. El corte que ve el usuario lo aplica el proxy / RN; esta función es la barrera de datos para
--      quien habla PostgREST directo.
--
-- R1 — LO QUE **SÍ** CORTA, y es la única lista: un plan `active` cuyo paid_through + gracia venció
-- (estado 'unpaid'), y un plan `canceled` cuyo paid_through venció (estado 'ended', sin gracia). Un
-- `canceled` DENTRO de paid_through sigue abierto («tu plan termina el X»). Solo `paused`, coach no
-- Pro, módulo apagado o `paid_through null` dan 'off'.
--
-- R3 — DIFERIMIENTO POR CLAIM: si hay un «ya pagué» vivo, `claim_deferral_until` corre la fecha del
-- corte hasta 5 días. No reactiva a nadie: mientras tanto el alumno sigue viéndose vencido.
--
-- FIRMA CON 3 ARGUMENTOS a propósito: la llama private.student_write_allowed, que ya tiene la fila
-- del coach en su left join ⇒ cero lookups extra sobre `coaches` en el camino caliente.

create or replace function private.student_billing_allowed(
  p_client_id    uuid,
  p_coach_tier   text,
  p_coach_status text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  select coalesce((
    select
      -- INTERRUPTOR DB DEL GATE (R14). Es lo primero: si el kill-switch apagó la fila
      -- platform_flags.cobros_gate, esta función deja pasar a TODOS sin mirar nada más. Antes de
      -- R14 el kill-switch solo vivía en Edge Config, que la RLS no puede leer, y apagar el módulo
      -- desde el panel dejaba el gate DB cortando gente igual.
      not private.cobros_gate_enabled()
      -- El módulo es solo Pro (BRIEF §2.3). Coach sin Pro efectivo ⇒ motor en pausa ⇒ NO cortar.
      -- Espejo de packages/tiers: los tiers que incluyen Cobros.
      or coalesce(p_coach_tier, '') not in ('pro','elite','growth','scale')
      or not private.coach_has_effective_access(p_coach_status, null)
      -- Sin plan vivo o sin ancla ⇒ 'off'. (R2: un plan `active` nunca tiene paid_through null; esta
      -- rama cubre planes paused/canceled sin ancla y datos corregidos a mano.)
      or bp.id is null
      or bp.paid_through is null
      -- MÓDULO APAGADO ⇒ 'off'. (Corrección B-02 / DB-01: antes esto vivía SOLO en el `on` del left
      -- join, así que con el módulo apagado ninguna rama abría y la función SEGUÍA CORTANDO — al
      -- revés del espejo TS de §3.2, que devuelve 'off', y al revés del propio test de §2.2.)
      or bp.module_enabled is not true
      -- FRENO DEL MOTOR (corrección B-04): EVA perdió la señal de cobro (MP desconectado, revocado,
      -- deauthorized). El preapproval puede seguir cobrando en la cuenta del coach y nada puede
      -- avanzar paid_through ⇒ NO se corta a nadie hasta que se reconecte.
      or bp.engine_hold_at is not null
      -- Plan pausado ⇒ 'off' (decisión del COACH). `canceled` NO abre acá: sigue evaluándose contra
      -- paid_through y, pasado ese día, cae a 'ended' (R1) — cancelar no es acceso gratis.
      or bp.status = 'paused'
      -- EXCLUSIONES DEL MOTOR, espejo EXACTO de las del cron (§9.1) y de EMAILS §1.1 inv. 6. Si el
      -- cron no le cobra, el gate no puede cortarlo.
      or cl.is_demo is true
      or cl.is_archived is true
      or cl.is_active is false
      or cl.org_id is not null
      or cl.team_id is not null
      -- Dentro del período pagado + gracia (fin del día chileno del último día cubierto).
      -- R1: el plan CANCELADO no tiene gracia — conserva exactamente lo que ya pagó, ni un día más;
      -- pasado eso es 'ended' y esta rama NO abre (la función devuelve false, igual que 'unpaid':
      -- para la barrera de datos cortar es cortar; la diferencia entre 'unpaid' y 'ended' es de
      -- COPY y la resuelve el espejo TS de §3.2).
      or now() < (
           ((bp.paid_through + 1)::timestamp at time zone 'America/Santiago')
           + make_interval(days => case when bp.status = 'canceled' then 0
                                        else coalesce(bp.effective_grace_days, 3) end)
         )
      -- R3: DIFERIMIENTO POR CLAIM. Un «ya pagué» vivo corre el corte hasta 5 días. Se lee de la
      -- copia desnormalizada del plan (M2) para no meter un segundo lateral sobre cuotas en el
      -- camino caliente; el valor canónico está en la cuota y lo escribe el mismo servicio.
      or (bp.claim_deferral_until is not null and now() < bp.claim_deferral_until)
    from public.clients cl
    -- UN plan por alumno, elegido determinísticamente: el vivo si existe (el índice único parcial
    -- client_billing_plans_client_live_uidx garantiza que hay a lo sumo uno con status <> canceled)
    -- y, si no, el último cancelado — que todavía manda hasta su paid_through. `lateral … limit 1`
    -- porque los cancelados se conservan como historial y pueden ser varios: un left join liso
    -- devolvería N filas y la subconsulta reventaría con «more than one row returned».
    left join lateral (
      select bp2.id, bp2.status, bp2.paid_through, bp2.effective_grace_days,
             bp2.module_enabled, bp2.engine_hold_at, bp2.claim_deferral_until
        from public.client_billing_plans bp2
       where bp2.client_id = cl.id
       order by (bp2.status <> 'canceled') desc, bp2.canceled_at desc nulls last, bp2.created_at desc
       limit 1
    ) bp on true
    where cl.id = p_client_id
  ), true);
$fn$;

comment on function private.student_billing_allowed(uuid, text, text) is
  'Gate DB del alumno moroso (cobro coach→alumno). FALLA ABIERTO por diseño: con el gate apagado (private.cobros_gate_enabled false, R14), sin plan, sin ancla (paid_through null), con el coach fuera de Pro, con el módulo apagado (module_enabled false), con el motor frenado (engine_hold_at), con el plan pausado, con un claim vivo dentro de claim_deferral_until (R3), o con un alumno excluido del motor (demo / archivado / inactivo / org / team) devuelve TRUE. Solo cierra cuando hay un plan active con paid_through + gracia vencidos (estado unpaid) o un plan canceled con paid_through vencido (estado ended, sin gracia — R1). Espejo TS: packages/cobros/state.ts. NO convertirla en fail-closed.';

revoke all on function private.student_billing_allowed(uuid, text, text) from public, anon;
grant execute on function private.student_billing_allowed(uuid, text, text) to authenticated;
```

Detalles que importan:

- `private.coach_has_effective_access(p_status, null)` es el helper de
  `supabase/migrations/20260718120000_student_access_grace_gate.sql:72`. Con `p_period_end = null`,
  los estados `canceled/trialing/paused/past_due` caen a `false` (`:84-85`): coach en dunning ⇒ motor
  en pausa ⇒ el alumno **no** se corta. Es exactamente la regla del `OUTLINE §2.2`.
- `(bp.paid_through + 1)::timestamp at time zone 'America/Santiago'` = medianoche del día **siguiente**
  al último día pagado, en hora chilena, convertida a `timestamptz`. Con `grace_days = 0` el corte cae
  a las 00:00 CL del día después del vencimiento; con 3, tres días más tarde. DST-safe: Postgres
  resuelve el offset con la zona, no con un número fijo.
- **La función NO lee `coach_billing_settings`** (corrección B-02 / DB-01 / DB-04b). La versión
  anterior lo hacía con un `left join … on s.enabled is true` y ahí estaba el agujero: con el módulo
  apagado, `s` quedaba NULL, el `coalesce` de la gracia tomaba 3 y **ninguna rama abría**, así que la
  función seguía cortando (plan `active` + `paid_through` vencido) mientras el espejo TS de §3.2
  devolvía `'off'` y el test de §2.2 exigía `true`. Consecuencia real: escrituras del alumno
  rebotando 42501 en las 8 policies RESTRICTIVE de `20260718120000:140-244` con el copy equivocado
  «la cuenta de tu coach está en pausa». Ahora el interruptor y la gracia se leen de
  `client_billing_plans.module_enabled` / `.effective_grace_days`, columnas que **escribe
  `settings.service.ts`** y que ven igual el proxy, la RLS y el motor puro. Menos joins en el camino
  caliente y una sola fuente por plan.
- **Las exclusiones del motor están repetidas acá a propósito.** `is_demo`, `is_archived`,
  `is_active = false`, `org_id`/`team_id` no nulos son las mismas del cron (§9.1) y de EMAILS §1.1
  inv. 6. Un alumno al que el motor **no le cobra** no puede ser cortado por el motor: si divergen,
  aparece el peor bug posible (cortado sin que nadie le haya mandado un solo correo).
- **`canceled` no abre el gate — R1.** El plan cancelado sigue evaluándose contra `paid_through`, con
  gracia 0, y después cae a **`ended`** (que para esta función es `false`, igual que `unpaid`; el copy
  distinto lo pone el espejo TS). Si `canceled` abriera —como decía la versión anterior, **D-W7, hoy
  REEMPLAZADA POR R1**— cualquier alumno cancelaría desde el botón de autoservicio (que existe también
  en modo manual, `OUTLINE §2.2`) y entrenaría gratis para siempre hasta que el coach lo notara a
  mano. `SPEC §5.2 T14` promete «conserva acceso hasta `paid_through`»: esto es lo que cumple esa
  promesa, y ni un día más.
- **El diferimiento por claim es la única rama que se mueve con el tiempo hacia ADELANTE** (R3).
  Todo lo demás es una foto del plan. Por eso `claim_deferral_until` es un `timestamptz` y no un
  contador de días: el gate compara con `now()` y no tiene que saber nada del calendario del claim.
- **El interruptor de R14 va primero** por costo, no por elegancia: `private.cobros_gate_enabled()` es
  `stable` y se evalúa una vez por sentencia, así que apagar el gate en un incidente no cuesta ni un
  lookup extra por fila.
- **Sin plan, `bp.id` es NULL** ⇒ `bp.id is null` ⇒ true. Ese es el 100 % de los alumnos el día
  del deploy: el gate es inerte hasta que un coach cree el primer plan.

---

### M16 — `20260829101500_student_write_allowed_billing_term.sql`

```sql
-- ============================================================================
-- EVA — Cobros coach→alumno: `private.student_write_allowed` suma el término de MOROSIDAD
-- ----------------------------------------------------------------------------
-- ADITIVA: `create or replace` con la MISMA firma. Las 8 policies RESTRICTIVAS de
-- workout_logs / check_ins / daily_nutrition_logs / nutrition_meal_logs (20260718120000:140-244) y
-- los guards de record_/correct_/void_nutrition_intake_v2 la invocan sin cambios.
--
-- *** EL CONTRATO NUT-033 SE PRESERVA TEXTUALMENTE: ***
--   *** SIN ANCLA DE BILLING CONOCIDA, ESTA FUNCION CIERRA. ***
-- El `coalesce(<expr billing del coach>, false)` de 20260728125000:84-94, el `left join` de :96 y el
-- `coalesce((select ...), true)` externo de :81/:98 quedan LETRA POR LETRA. Lo único que se agrega es
-- un TERCER término conjuntivo, `private.student_billing_allowed(...)`, que es FAIL-OPEN: devuelve
-- true cuando no sabe. Los dos gates no se mezclan:
--   · gate del COACH que no le paga a EVA     → fail-CLOSED (NUT-033, 7 días)
--   · gate del ALUMNO que no le paga al coach → fail-OPEN (este, 0 o 3 días)
--
-- RENDIMIENTO: el término nuevo agrega, por fila, UN solo lookup por índice
-- (client_billing_plans_client_any_idx, `lateral … limit 1`). No toca coach_billing_settings: la
-- gracia y el interruptor viven desnormalizados en el plan (DB-04b). Medición obligatoria
-- antes/después con EXPLAIN (ANALYZE) — §2.1 del SDD, exigida por 20260728125000:68-69.
--
-- ROLLBACK (una pasada): re-aplicar 20260728125000:74-105 textual.
--   supabase/tests/20260829101500_student_write_allowed_billing_term_rollback.sql
-- ============================================================================

create or replace function private.student_write_allowed(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  select coalesce((
    select
      (cl.is_archived is not true and cl.is_active is not false)
      and coalesce(
        -- Coach ausente (alumno org-managed, coach_id null): no hay gate de billing de
        -- coach que aplicar. El candado de archivado/pausado de arriba SI aplica.
        (co.id is null)
        or private.coach_has_effective_access(co.subscription_status, co.current_period_end)
        or (
          coalesce(co.paid_access_ended_at, co.current_period_end) is not null
          and now() < coalesce(co.paid_access_ended_at, co.current_period_end) + interval '7 days'
        ),
        false   -- sin ancla conocida => CIERRA (espejo de student-access.ts:109)
      )
      -- TERMINO NUEVO (cobros coach->alumno, 2026-08-29). FAIL-OPEN: devuelve true cuando no hay
      -- plan, no hay ancla, el modulo esta apagado o el coach no es Pro efectivo. Es una
      -- conjuncion: nunca vuelve MAS PERMISIVO el gate de arriba.
      and private.student_billing_allowed(cl.id, co.subscription_tier, co.subscription_status)
    from public.clients cl
    left join public.coaches co on co.id = cl.coach_id
    where cl.id = p_client_id
  ), true);
$fn$;

comment on function private.student_write_allowed(uuid) is
  'Gate de escritura del alumno. Cierra si la ficha esta archivada/pausada, y cierra '
  'tambien cuando el coach no tiene acceso efectivo NI ancla de billing conocida '
  '(fail-closed, espejo de apps/web/src/lib/student-access.ts). Alumno sin coach '
  '(org-managed) solo pasa el candado de ficha. NUT-033 — no revertir a fail-open. '
  'Desde 2026-08-29 suma el termino private.student_billing_allowed (cobro coach->alumno, '
  'FAIL-OPEN, gracia 0-3 dias) — ver 20260829101500.';
```

El comentario original (`20260728125000:101-105`) se conserva palabra por palabra y solo se le agrega
una frase final. Un `create or replace` futuro que borre el texto de NUT-033 debe fallar la revisión.

**Rollback** `supabase/tests/20260829101500_student_write_allowed_billing_term_rollback.sql`: copia
literal del cuerpo de `20260728125000:74-99` más su `comment on function` de `:101-105`, sin el
término nuevo. Una pasada, sin datos que migrar.

---

## 2. El gate: medición, equivalencia y qué no se toca

### 2.1 Bloque `EXPLAIN (ANALYZE)` a correr ANTES y DESPUÉS de M16

Exigido literalmente por la migración vigente (`20260728125000:68-69`). Se corre en LIVE, siempre
dentro de `begin … rollback`, con un alumno real activo (id parametrizado, nunca transcrito acá).

```sql
-- ── ANTES (función vigente) ──────────────────────────────────────────────────
begin;
set local role postgres;

-- (a) Costo de la función sola, 1000 evaluaciones.
explain (analyze, buffers, timing)
select count(*) from generate_series(1, 1000) g
where private.student_write_allowed(:'client_id'::uuid);

-- (b) Camino caliente REAL: insert como el alumno, con la RESTRICTIVE puesta.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'client_id')::text, true);

explain (analyze, buffers, timing)
insert into public.workout_logs (client_id /*, … columnas mínimas … */)
select :'client_id'::uuid /*, … */ from generate_series(1, 200);

-- (c) El otro camino: la RPC SECURITY DEFINER (la RESTRICTIVE no la cubre — r2 §5.3).
explain (analyze, buffers)
select public.record_nutrition_intake_v2(/* … args mínimos … */);

rollback;

-- ── DESPUÉS: idéntico, con M12 + M15 + M16 aplicadas dentro de la misma transacción ─
-- (M12 primero: M15 invoca private.cobros_gate_enabled y sin la función el create falla.)
begin;
  \i supabase/migrations/20260829095500_platform_flags.sql
  \i supabase/migrations/20260829101000_student_billing_allowed.sql
  \i supabase/migrations/20260829101500_student_write_allowed_billing_term.sql
  -- repetir (a), (b), (c)
rollback;
```

**Criterio de paso (se pega en el PR)**:

| Métrica | Umbral |
|---|---|
| `Execution Time` del insert de 200 filas | delta ≤ **+15 %** contra el ANTES |
| Costo por fila del término nuevo | ≤ **0,15 ms** (un lookup por índice) |
| Plan del término nuevo | **Index Scan** sobre `client_billing_plans_client_any_idx`, nunca `Seq Scan` |
| `Buffers: shared hit` extra por fila | ≤ 8 |
| Lookups extra por fila | **exactamente 1** (el lateral del plan). `private.cobros_gate_enabled()` es `stable` ⇒ una evaluación por sentencia; el diferimiento por claim se lee de la copia del plan, no de `student_billing_charges`. Si el plan de ejecución muestra un segundo Index Scan por fila, es que alguien deshizo la desnormalización de R3/D-W14. |

Si no pasa: **no se aplica M16**. El corte queda solo en proxy/API (capa cosmética) y se abre una ola
de medición aparte. El motor sigue funcionando: la barrera de datos es un endurecimiento, no un
requisito del producto.

### 2.2 Test de equivalencia SQL — `supabase/tests/cobros_gate_equivalence.sql`

Espejo del criterio explícito de `supabase/tests/student_gate_equivalence.sql:8-12`. Verifica que M16
**no cambió una sola respuesta** del gate viejo en ausencia de planes de cobro:

```sql
begin;
create temp table gate_before as
  select cl.id,
         -- reimplementación literal del cuerpo de 20260728125000:74-99
         coalesce((
           select (c2.is_archived is not true and c2.is_active is not false)
             and coalesce(
               (co.id is null)
               or private.coach_has_effective_access(co.subscription_status, co.current_period_end)
               or (coalesce(co.paid_access_ended_at, co.current_period_end) is not null
                   and now() < coalesce(co.paid_access_ended_at, co.current_period_end) + interval '7 days'),
               false)
           from public.clients c2
           left join public.coaches co on co.id = c2.coach_id
           where c2.id = cl.id
         ), true) as allowed
  from public.clients cl;

\i supabase/migrations/20260829095500_platform_flags.sql
\i supabase/migrations/20260829101000_student_billing_allowed.sql
\i supabase/migrations/20260829101500_student_write_allowed_billing_term.sql

do $$
declare n int;
begin
  select count(*) into n
  from gate_before b
  join public.clients cl on cl.id = b.id
  where b.allowed is distinct from private.student_write_allowed(cl.id);
  if n <> 0 then
    raise exception 'Gate divergente en % clients SIN planes de cobro — M16 rompio NUT-033', n;
  end if;
end $$;
rollback;
```

Contraparte positiva (el gate **sí** cierra cuando debe), con fixtures sintéticos dentro de la misma
transacción: coach Pro activo + `module_enabled` + plan activo con `paid_through` vencido hace 5
días y `effective_grace_days = 3` ⇒ `student_write_allowed = false`.

**Casos BLOQUEANTES de fail-open** (todos deben devolver **true**; los tres primeros son los que
cazaron el bug B-02 / DB-01 y por eso no son opcionales):

| # | Fixture | Esperado | Por qué es bloqueante |
|---|---|---|---|
| E-01 | plan `active`, `paid_through` vencido hace 5 días, **`module_enabled = false`** | `true` | El coach apagó Cobros. La versión anterior de M15 devolvía `false` acá: escrituras rebotando 42501 con copy de «cuenta del coach en pausa». |
| E-02 | ídem con **`engine_hold_at` puesto** | `true` | MP desconectado: EVA no puede enterarse del pago y el preapproval puede seguir cobrando (B-04). |
| E-03 | ídem con **`clients.is_demo = true`** (y con `is_archived`, `is_active=false`, `org_id`, `team_id`) | `true` | Alumno excluido del motor: si el cron no le cobra, el gate no lo corta. |
| E-04 | `paid_through` null | `true` | Sin ancla no se corta (I-3). |
| E-05 | plan `paused` | `true` | El coach pausó el cobro. |
| E-06 | coach tier `free` · coach `subscription_status='expired'` | `true` | Downgrade del coach: nunca castigar al alumno. |
| E-07 | vencido hace 2 días con gracia 3 | `true` | Todavía en gracia. |
| E-08 | ídem E-01 pero con **`platform_flags.cobros_gate = false`** (y también con la fila borrada ⇒ `true` por otra razón) | `true` | **R14**: el kill-switch tiene que poder apagar el gate DB, no solo el de la app. Es el caso que antes obligaba a re-aplicar el rollback de M16 a mano. |
| E-09 | plan `active` vencido hace 5 días, gracia 3, **`claim_deferral_until = now() + 2 días`** | `true` | **R3**: hay un «ya pagué» vivo. El corte se difiere, no se cancela. |
| E-10 | ídem con `claim_deferral_until` **ya pasado** | `false` | El diferimiento expiró: el claim compró 5 días, no impunidad. |

**Casos que deben devolver `false`**: vencido hace 1 día con `effective_grace_days = 0` · plan
**`canceled`** con `paid_through` vencido hace 1 día (**R1**: el estado derivado es `ended` y la
barrera de datos cierra igual que con `unpaid`) · plan `canceled` con `paid_through` vencido hace 5
días y `effective_grace_days = 3` (el cancelado **no** tiene gracia) · plan `active` con
`claim_rejected_at` puesto y `claim_deferral_until` vuelto a null (el coach rechazó el claim ⇒
calendario normal, R3).

Y el borde de convivencia de los dos planes: alumno con un plan `canceled` viejo **y** uno `active`
nuevo ⇒ manda el `active` (el `order by (status <> 'canceled') desc` del lateral).

### 2.3 Qué NO se toca

- `private.nutrition_v2_can_read_client` (`20260728123000:39-58`): el moroso conserva **lectura**.
  Corta escritura, no ciega (`maps/r2-gate-alumno.md §8.3`).
- Las 41 policies `archive_gate_*` sobre 38 tablas: intactas.
- `clients.is_active` / `clients.is_archived`: el motor **jamás** los escribe. Un moroso no está
  baneado en GoTrue y puede loguear para ver la pantalla que le explica — indispensable, porque en
  iOS el único camino permitido es «habla con tu coach».
- `clients` no recibe columnas nuevas (`OUTLINE §3.10`).
- El error de las 3 RPC sigue siendo `coach_account_paused` (`errcode 42501`,
  `20260718120000_student_access_grace_gate.sql:291` y `:497`). **Decisión del writer (D-W6)**: no se
  agrega `private.student_block_reason` en este tren (tocaría el camino caliente de nutrición), pero
  la corrección RN-07 obliga a **dos mitigaciones del lado cliente, que sí entran en W4**:
  1. **Copy**: `apps/mobile/lib/student-access-copy.ts:22` traduce ese rebote a «La cuenta de tu
     coach está en pausa…» — causa equivocada para un moroso. El cliente ya sabe la verdad por
     `studentAccess.reason` (`'unpaid' | 'ended'`, R7) y por `studentBilling.state` (§4.4): cuando
     hay motivo de cobro, el copy del rebote se elige por **ahí**, no por el código de error, y habla
     del cobro del coach (`unpaid`) o del fin del plan (`ended`).
  2. **Cola offline (lo caro)**: `apps/mobile/lib/offline-cache.ts:164-185` mapea 23505 → `ok`,
     23503 → `discard` y **todo lo demás, incluido 42501, → `retry`**. Un alumno cortado acumularía
     series en la cola para siempre, sin explicación y sin poder vaciarla. Fix: **pausar el flush**
     mientras `studentBilling.state` sea `'unpaid'` o `'ended'` y mostrar el motivo, en vez de
     reintentar contra una policy que nunca va a ceder.
  **Pregunta para el jefe**: el crítico RN-07 propone además policies RESTRICTIVE y un
  `raise 'student_billing_unpaid'` **propios** para cobros, en vez de meter el término dentro de
  `student_write_allowed`. Eso contradice `OUTLINE §3.6` (que manda el `create or replace` con el
  término agregado), así que **no se aplicó**. Si el jefe prefiere el error tipado propio, es un
  cambio de arquitectura del gate, no una corrección.

---

## 3. `packages/cobros` — la función pura `resolveStudentBillingState`

Paquete nuevo `@eva/cobros` (`OUTLINE §15`): TS puro, sin Next, sin Supabase, sin React/RN — igual que
`packages/tiers` (`packages/tiers/index.ts:1-11`). Web lo re-exporta desde
`apps/web/src/lib/cobros/state.ts`; RN lo importa directo.

### 3.1 Tipos y contrato

```ts
// packages/cobros/state.ts
//
// Espejo TS de private.student_billing_allowed (supabase/migrations/20260829101000). Si cambia uno,
// cambia el otro EN EL MISMO PR — el par student-access.ts / student_write_allowed ya pagó el precio
// de driftar (NUT-033, ver 20260728125000:39-45).
//
// FAIL-OPEN por diseño: ante la duda, 'off'. Nunca cortamos a alguien por un dato que no tenemos.

export type StudentBillingState =
  | 'off'       // el motor no aplica a este alumno (sin plan, sin ancla, coach no Pro, módulo off,
                //  plan pausado, o gate apagado)
  | 'ok'        // al día
  | 'due_soon'  // al día, pero vence dentro de `reminderDaysBefore`
  | 'due'       // vencido, dentro de la gracia (o del diferimiento por claim): acceso NORMAL + aviso
  | 'unpaid'    // gracia agotada en un plan VIVO: corte reversible («ponte al día y vuelves»)
  | 'ended'     // plan CANCELADO pasado su paid_through: corte terminal (R1). No hay nada que pagar:
                //  el vínculo terminó. Copy web «Tu plan con {coach} terminó»; app «Tu acceso está
                //  en pausa». Es un estado DISTINTO de 'unpaid' porque la salida es distinta:
                //  'unpaid' se arregla pagando, 'ended' se arregla con un plan nuevo del coach.

export interface StudentBillingPlanRow {
  status: 'active' | 'paused' | 'canceled'
  /**
   * date 'YYYY-MM-DD' (día calendario chileno). R2: se inicializa = `first_due_on` al crear el plan
   * y un plan `active` nunca lo tiene null. null (planes paused/canceled sin ancla) ⇒ 'off'.
   */
  paidThrough: string | null
  /**
   * Gracia EFECTIVA, ya resuelta (client_billing_plans.effective_grace_days). Corrección DB-04b:
   * antes esto se resolvía en el caller leyendo coach_billing_settings, tabla que el proxy no puede
   * leer con la sesión del alumno. Ahora viaja en la misma fila del plan y el espejo SQL lee la
   * misma columna: imposible que driften.
   */
  effectiveGraceDays: number
  /** null = usar el default (3). Vive en el plan. */
  reminderDaysBefore: number | null
  /** Interruptor del módulo, desnormalizado en el plan (client_billing_plans.module_enabled). */
  moduleEnabled: boolean
  /** Freno del motor: EVA perdió la señal de cobro (MP desconectado). ISO o null. */
  engineHoldAt: string | null
  /**
   * R3 — diferimiento por claim «ya pagué» vivo, ISO o null. Corre la fecha del corte hasta 5 días
   * después del fin de la gracia. NO reactiva: el alumno sigue viéndose vencido (`due`), el coach ve
   * el aviso y decide. Espejo de `client_billing_plans.claim_deferral_until` (M2).
   */
  claimDeferralUntil: string | null
  mode: 'manual' | 'mp_link' | 'mp_subscription'
}

export interface StudentBillingInput {
  plan: StudentBillingPlanRow | null
  /** ¿El coach es Pro con acceso efectivo? Lo resuelve el caller con @eva/tiers + hasEffectiveAccess. */
  coachIsPro: boolean
  /**
   * Exclusiones duras del motor, espejo de las del cron (§9.1) y de M15: si el motor no le cobra,
   * el motor no lo corta. El caller las arma con la fila de `clients` que ya tiene en la mano.
   */
  clientExcluded: boolean
  /**
   * R14 — ¿el gate está encendido? El caller lo resuelve con Edge Config (`COBROS_KILL_SWITCH`) y,
   * del lado DB, con `private.cobros_gate_enabled()`. `false` ⇒ 'off' para todos, sin mirar nada más.
   * Default de los callers: `true` (un flag ilegible no puede apagarle el cobro a nadie, D-W12).
   */
  gateEnabled: boolean
  /** Instante de evaluación. Inyectable: toda la cadena es determinista. */
  now?: number
}

export interface StudentBillingResult {
  state: StudentBillingState
  /** Fin del período pagado, ISO 'YYYY-MM-DD'. null si 'off'. */
  paidThrough: string | null
  /**
   * Instante exacto del corte (ISO), YA con el diferimiento por claim aplicado (R3). null si 'off' o
   * si no hay ancla. Es la fecha que muestran los copys y la que usa el cron para el aviso previo:
   * prometer un corte y aplicarlo otro día es el bug que R3 evita.
   */
  cutsAt: string | null
  /** Días de gracia efectivos (plan ?? coach). 0 en un plan `canceled` (R1). */
  graceDays: number
  /** true si `cutsAt` viene corrido por un claim vivo (R3). Lo usa el copy del coach, no el del alumno. */
  deferredByClaim: boolean
  // NOTA (§0.1): `canClaim` NO vive acá — depende de las cuotas, no del plan. Lo agrega el caller
  // de /api/mobile/config sobre este resultado. Y el campo del corte se llama `cutsAt` en los seis
  // documentos: `dueUntil` está derogado.
}
```

### 3.2 Implementación

```ts
const SANTIAGO_TZ = 'America/Santiago'

/**
 * Instante UTC de la medianoche que ABRE el día `isoYmd` en Santiago.
 * Se calcula con Intl.formatToParts, igual que apps/web/src/lib/date-utils.ts:112-132
 * (getSantiagoUtcBoundsForDay). PROHIBIDO `new Date(x.toLocaleString(...))`: usa la TZ del host y
 * ya borró registros de 20:00-24:00 en un host chileno (date-utils.ts:105-111).
 */
export function santiagoDayStartUtcMs(isoYmd: string): number {
  const [y, m, d] = isoYmd.split('-').map(Number)
  // Primera aproximación en UTC, luego se corrige con el offset real de esa fecha.
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SANTIAGO_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  const offsetMs = asUtc - guess           // +/- 3 o 4 horas según DST
  return guess - offsetMs
}

/** Suma `n` días de calendario a un 'YYYY-MM-DD' (sin horas: inmune a DST). */
export function addDaysIso(isoYmd: string, n: number): string {
  const [y, m, d] = isoYmd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** R3: el claim nunca puede correr el corte más de 5 días desde el fin de la gracia. */
export const MAX_CLAIM_DEFERRAL_DAYS = 5

export function resolveStudentBillingState(input: StudentBillingInput): StudentBillingResult {
  const now = input.now ?? Date.now()
  const off: StudentBillingResult = {
    state: 'off', paidThrough: null, cutsAt: null, graceDays: 0, deferredByClaim: false,
  }

  // ── Ramas fail-open, en el mismo orden que el SQL de M15 ──────────────────
  // R1: SOLO estas seis dan 'off'. Un plan `canceled` NO está acá.
  if (!input.gateEnabled) return off           // R14: kill-switch (Edge Config + platform_flags)
  if (!input.coachIsPro) return off            // downgrade del coach: nunca castigar al alumno
  if (input.clientExcluded) return off         // demo / archivado / inactivo / org / team
  const plan = input.plan
  if (!plan) return off                        // sin plan
  if (!plan.moduleEnabled) return off          // el coach apagó Cobros
  if (plan.engineHoldAt) return off            // MP desconectado: no podemos enterarnos del pago
  if (plan.status === 'paused') return off     // el coach pausó el cobro — decisión del COACH
  if (!plan.paidThrough) return off            // sin ancla (R2: imposible en un plan `active`)
  // OJO: `canceled` NO abre (R1). Sigue evaluándose contra paidThrough y después cae a 'ended'.
  // Si abriera, cancelar sería acceso gratis indefinido.

  const isCanceled = plan.status === 'canceled'
  // R1: el plan cancelado conserva EXACTAMENTE lo pagado, sin gracia y sin diferimiento por claim
  // (no hay nada que reclamar: el vínculo terminó).
  const graceDays = isCanceled ? 0 : clampGrace(plan.effectiveGraceDays)
  const reminderDays = clampReminder(plan.reminderDaysBefore ?? 3)

  // Fin del período pagado = medianoche que ABRE el día siguiente a paidThrough, hora de Santiago.
  const dueAtMs = santiagoDayStartUtcMs(addDaysIso(plan.paidThrough, 1))
  const graceEndMs = santiagoDayStartUtcMs(addDaysIso(plan.paidThrough, 1 + graceDays))

  // ── R3: DIFERIMIENTO POR CLAIM ────────────────────────────────────────────
  // Solo puede EMPUJAR el corte, nunca adelantarlo, y con tope duro de 5 días desde el fin de la
  // gracia — aunque la columna traiga basura o un valor viejo mal calculado.
  const deferralCapMs = graceEndMs + MAX_CLAIM_DEFERRAL_DAYS * 86_400_000
  const rawDeferralMs = !isCanceled && plan.claimDeferralUntil
    ? Date.parse(plan.claimDeferralUntil)
    : NaN
  const deferralMs = Number.isFinite(rawDeferralMs)
    ? Math.min(rawDeferralMs, deferralCapMs)
    : NaN
  const deferredByClaim = Number.isFinite(deferralMs) && deferralMs > graceEndMs
  const cutsAtMs = deferredByClaim ? (deferralMs as number) : graceEndMs
  const cutsAt = new Date(cutsAtMs).toISOString()

  if (now < dueAtMs) {
    const remindFromMs = santiagoDayStartUtcMs(addDaysIso(plan.paidThrough, 1 - reminderDays))
    return {
      state: now >= remindFromMs ? 'due_soon' : 'ok',
      paidThrough: plan.paidThrough, cutsAt, graceDays, deferredByClaim,
    }
  }
  if (now < cutsAtMs) {
    // Vencido pero todavía no cortado: gracia, o claim vivo. En los dos casos el acceso es NORMAL.
    return { state: 'due', paidThrough: plan.paidThrough, cutsAt, graceDays, deferredByClaim }
  }
  // R1: el corte. Cuál de los dos depende de si el plan sigue vivo.
  return {
    state: isCanceled ? 'ended' : 'unpaid',
    paidThrough: plan.paidThrough, cutsAt, graceDays, deferredByClaim,
  }
}

function clampGrace(n: number): number {
  // Ante un valor corrupto, la gracia MÁS LARGA que permite el CHECK: fail-open también acá.
  return Number.isFinite(n) && n >= 0 && n <= 14 ? Math.trunc(n) : 14
}
function clampReminder(n: number): number {
  return Number.isFinite(n) && n >= 0 && n <= 30 ? Math.trunc(n) : 3
}
```

**Nota sobre `graceDays = 0`**: `cutsAtMs === dueAtMs`, así que **no existe estado `due`** en ese
plan: pasa de `ok`/`due_soon` a `unpaid` en el mismo instante (00:00 CL del día siguiente al
vencimiento). Es exactamente lo que pidió el owner («o el mismo día si gracia = 0», DECISIONS.md D-B).

### 3.3 Tabla de casos de borde (fija los tests de §3.4)

Todos con `paidThrough = '2026-09-05'`, coach Pro, módulo encendido, `reminderDaysBefore = 3`. Hora
de Santiago = UTC−4 en septiembre (horario de invierno CL).

| # | `now` (CL) | `graceDays` | Estado esperado | Por qué |
|---|---|---|---|---|
| B-01 | 01-09 10:00 | 3 | `ok` | faltan 4 días > reminder 3 |
| B-02 | 02-09 00:00 | 3 | `due_soon` | entra la ventana del recordatorio (T−3) |
| B-03 | 05-09 23:59 | 3 | `due_soon` | **último instante del día pagado**: sigue al día |
| B-04 | 06-09 00:00 | 3 | `due` | primer instante vencido; acceso normal + aviso |
| B-05 | 08-09 23:59 | 3 | `due` | último instante de la gracia |
| B-06 | 09-09 00:00 | 3 | `unpaid` | **el corte**: T+3 exacto |
| B-07 | 05-09 23:59 | 0 | `due_soon` | gracia 0 no cambia el día pagado |
| B-08 | 06-09 00:00 | 0 | `unpaid` | gracia 0 ⇒ nunca hay `due` |
| B-09 | cualquiera | 3, `paidThrough=null` | `off` | sin ancla no se corta (I-3) |
| B-10 | cualquiera | 3, `plan=null` | `off` | alumno sin plan |
| B-11 | cualquiera | 3, `plan.status='paused'` | `off` | el coach pausó el cobro |
| B-12 | 05-09 23:59 | 3, `plan.status='canceled'` | `due_soon` | el alumno canceló: **conserva lo que pagó**, y el gate lo sigue evaluando. Copy: «tu plan termina el 5 de septiembre» (R1) |
| B-12b | 06-09 00:00 | 3, `plan.status='canceled'` | **`ended`** | **R1**: el cancelado NO tiene gracia y cae al vencer, pero a `ended`, no a `unpaid`: no hay nada que pagar. Antes esta rama devolvía `off` ⇒ acceso gratis indefinido para cualquiera que apretara «cancelar» |
| B-12c | 09-09 00:00 | 3, `canceled` + `claimDeferralUntil` en el futuro | **`ended`** | **R1+R3**: en un plan cancelado el claim no difiere nada — el vínculo terminó, no hay cuota que reclamar |
| B-13 | 09-09 00:00 | 3, `coachIsPro=false` | `off` | downgrade del coach: **nunca** corta al alumno |
| B-14 | 09-09 00:00 | 3, `plan.moduleEnabled=false` | `off` | el coach apagó Cobros (**corrección B-02**: el SQL de M15 tiene que coincidir; era la divergencia SQL↔TS) |
| B-14b | 09-09 00:00 | 3, `plan.engineHoldAt` puesto | `off` | **corrección B-04**: MP desconectado. El preapproval puede seguir cobrando en la cuenta del coach; cortar sería castigar a quien paga |
| B-14c | 09-09 00:00 | 3, `clientExcluded=true` | `off` | demo / archivado / inactivo / org / team: el motor no le cobra, el motor no lo corta |
| B-14d | 09-09 00:00 | 3, `gateEnabled=false` | `off` | **R14**: kill-switch. Espejo TS de `private.cobros_gate_enabled() = false` |
| B-14e | 09-09 00:00 | 3, `claimDeferralUntil = 10-09 00:00` | `due` | **R3**: claim vivo ⇒ el corte se corre; el alumno sigue con acceso normal y aviso |
| B-14f | 20-09 00:00 | 3, `claimDeferralUntil = 30-09` (valor pasado de rosca) | `unpaid` | **R3, tope duro**: el diferimiento se recorta a fin de gracia + 5 días (14-09). Forjar claims compra 5 días, no un mes |
| B-14g | 09-09 00:00 | 3, `claimDeferralUntil` **ya pasado** | `unpaid` | el claim expiró sin que el coach confirmara: sigue el calendario normal |
| B-15 | 09-09 00:00 | `graceDays=NaN` | `due` | `clampGrace` → 14 ⇒ fail-open |
| B-16 | 06-09 00:00 UTC (= 05-09 20:00 CL) | 3 | `due_soon` | **el borde que rompe todo si se compara en UTC**: en Chile todavía es día 5 |
| B-17 | 05-04-2026 (cambio de DST CL) | 3 | según tabla | `santiagoDayStartUtcMs` usa `formatToParts`: el offset lo resuelve Intl, no una constante |
| B-18 | `paidThrough='2026-02-29'` | 3 | `off` + log | fecha inválida: `addDaysIso` la normaliza, pero el servicio nunca escribe una así (viene de una columna `date`) |

**~~Decisión del writer (D-W7)~~ — REEMPLAZADA POR R1.** Las dos versiones anteriores de esta decisión
quedan muertas y se dejan escritas solo para que nadie las reviva:

- **D-W7 original**: un plan `canceled` apagaba el gate (`off`). Falso pasado el período: **el alumno
  cancela solo** (botón de autoservicio, también en modo manual — `OUTLINE §2.2`, `SPEC §5.2 T14`),
  así que cualquiera apretaba «cancelar» y entrenaba **gratis para siempre**.
- **D-W7-bis** (corrección B-01): `canceled` caía a `unpaid`. Mejor, pero mentía en el copy: le decía
  «ponte al día» a alguien que ya no tiene nada que pagar, con un botón de pago que no corresponde.

**R1 (vigente, manda sobre las dos)**: un plan `canceled` sigue derivando estado —
`now ≤ paid_through` ⇒ **`ok`** (copy «tu plan termina el X»); después ⇒ **`ended`** (corte; web «Tu
plan con {coach} terminó», app «Tu acceso está en pausa»). **Sin gracia y sin diferimiento por claim.**
Solo `paused` (decisión del coach), coach no Pro, módulo apagado, gate apagado o `paid_through null`
dan `off`. Estados finales: **`off | ok | due_soon | due | unpaid | ended`**. Vale igual en la función
pura (§3.2), en `private.student_billing_allowed` (M15 — donde `ended` y `unpaid` colapsan en el mismo
`false`, porque la barrera de datos no tiene copy) y en el test SQL↔TS de §3.4.

**Cabo suelto de copy que va a EMAILS/SPEC, no acá**: en modo `manual` el botón no cancela ningún
cobro remoto —no hay nada que cancelar— así que se llama **«Dar de baja mi plan»** y dispara un correo
al coach avisándole. Con la numeración de DECISIONS-2 (C1…C8), **C6 ya está tomada** («bajaste a
Free»), así que esa plantilla es una **C9** nueva o un asunto propio de C2: queda como pregunta para
el jefe en §15.

### 3.4 Tests exigidos — `packages/cobros/state.test.ts`

Patrón de oro: `apps/web/src/lib/payments/paid-expiry.test.ts` (tabla exhaustiva, cero mocks,
`now` inyectado). Un caso por fila de §3.3 (**27** con R1/R3/R14), más:

```ts
it.each(BORDES)('%s → %s', (caso, esperado) => {
  expect(resolveStudentBillingState(caso.input).state).toBe(esperado)
})

it('nunca devuelve unpaid sin ancla, con cualquier combinación', () => {
  fc.assert(fc.property(arbInput({ paidThrough: fc.constant(null) }),
    (i) => resolveStudentBillingState(i).state === 'off'))
})

it('es monotónico en el tiempo: ok → due_soon → due → unpaid|ended, sin retrocesos', () => { /* … */ })

it('un plan canceled nunca devuelve unpaid, y uno active nunca devuelve ended (R1)', () => { /* … */ })

it('el claim jamás corre el corte más de 5 días desde el fin de la gracia (R3)', () => { /* … */ })
```

Y el test de espejo SQL↔TS, que corre en el gate de CI de DB (no en vitest): para 200 combinaciones
generadas, `private.student_billing_allowed(...)` debe ser `true` **si y solo si**
`!['unpaid', 'ended'].includes(resolveStudentBillingState(...).state)`. Los dos estados de corte de R1
colapsan en el mismo `false` del SQL: la barrera de datos no distingue motivos, la UI sí.
**El generador tiene que cubrir sí o sí** `module_enabled = false`, `engine_hold_at` puesto,
`status = 'canceled'` (dentro y fuera de `paid_through`), `claim_deferral_until` (vivo, vencido y
pasado de rosca), `cobros_gate_enabled() = false` y las cinco exclusiones de `clients`: son
exactamente los ejes donde el par ya divergió o donde R1/R3/R14 acaban de mover la regla. Contra el
DDL de la versión anterior de M15, este test fallaba.

---

## 4. Precedencia de gates: `proxy.ts` y `/api/mobile/config`

### 4.1 La regla, en una línea

```
readonly (el COACH no le paga a EVA)  >  archived/paused (ficha)  >  ended (el plan terminó)  >  unpaid (el ALUMNO no le paga al coach)  >  due (aviso)
```

Razón del orden (`OUTLINE §6.6`): «tu coach cerró su cuenta» y «tu coach te archivó» son estados más
terminales y no los arregla pagar. El moroso, en cambio, se reactiva con un toque del coach. **`ended`
va antes que `unpaid`** (R1) porque también es terminal desde el lado del alumno: no hay nada que
pagar, el plan se acabó; ofrecerle un botón de pago sería mentirle. Los dos cortan igual — cambia el
copy y la salida.

### 4.2 Dónde se inserta en `apps/web/src/proxy.ts`

**R15 fija esta sección tal como está**: el plan **NO se embebe** en el SELECT de identidad (un 42501
dejaría al alumno fuera de todo `/c`); es una **segunda consulta service-role, solo para clientes
standalone**, dentro de `try/catch` **fail-open**, y reusa los datos del coach (tier/estado) que el
proxy ya trae. Costo declarado y aceptado: **1 query extra por request de alumno** con 110 alumnos
vivos. **Obligación de la beta**: medir el **p75** de esa query y dejarlo en el runbook.

El SELECT del alumno (`apps/web/src/proxy.ts:1228-1230`) hoy trae
`id, coach_id, org_id, team_id, force_password_change, onboarding_completed, is_active, is_archived, is_demo, full_name`.
**No se le agregan columnas** (`clients` no recibe columnas nuevas, `OUTLINE §3.10`) y —corrección
DB-04a— **tampoco se le agrega el embed del plan**. Ese SELECT es el de **identidad**: si un 42501 o
un error de embed lo hace fallar, `rawClientData` queda `null` y el alumno se queda afuera de **todo**
`/c`, que es exactamente lo contrario del fail-open I-3. El patrón correcto ya vive dos bloques más
arriba, en `proxy.ts:1217-1221`: una **promesa hermana** con `.catch(() => null)`, lanzada junto a la
del gate del coach para no pagar un round-trip serial.

```ts
// apps/web/src/proxy.ts — el .select de :1229 queda INTACTO.
// Junto al studentAccessPromise de :1217-1221, una promesa hermana con el mismo fail-open:
// R15: SOLO para clientes standalone (org/team no tienen módulo de cobros, I-9) y con el cliente
// SERVICE-ROLE, no con la sesión del alumno: la fila del plan tiene policy propia, pero el
// try/catch fail-open no puede depender de que la RLS del alumno esté sana.
const billingPlanPromise = cobrosGateEnabled && !rawClientOrgId && !rawClientTeamId
    ? admin
        .from('client_billing_plans')
        .select('status, paid_through, effective_grace_days, module_enabled, engine_hold_at, ' +
                'claim_deferral_until, reminder_days_before, mode')
        .eq('client_id', user.id)
        // El plan vivo o, si no hay, el último cancelado: MISMO criterio que el lateral de M15
        // (canceled_at null = plan vivo ⇒ va primero).
        .order('canceled_at', { ascending: false, nullsFirst: true })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(r => r.data ?? null)
        .catch(() => null)                        // ← fail-OPEN: cualquier fallo ⇒ 'off'
    : Promise.resolve(null)
```

Dos cosas que esto compra y el embed no: (a) un fallo de la lectura del plan **no puede** dejar al
alumno sin identidad; (b) las columnas que el gate necesita
(`effective_grace_days`, `module_enabled`, `claim_deferral_until`) **existen en la fila del plan**
gracias a la desnormalización DB-04b/R3 — con el diseño anterior había que leer
`coach_billing_settings`, tabla a la que M1 **no le da policy al alumno**, así que el proxy
simplemente no podía resolver el estado.

**Medición obligatoria en la beta (R15)**: contador de duración de `billingPlanPromise` y **p75** en
el panel de operación. Si el p75 sube de ~15 ms con 110 alumnos, la salida es cachear por isolate el
plan por `client_id` con TTL corto (mismo patrón que `proxyClaimsFlagCache`, `proxy.ts:357-375`), no
volver al embed.

El bloque de decisión va **después** del gate del coach (que termina en `:1374`) y **después** del
`isBlocked` de `:1377-1383`, para respetar la precedencia:

```ts
// apps/web/src/proxy.ts — después del redirect de isBlocked (:1383)
//
// Gate de COBROS del alumno (cobro coach→alumno). Precedencia:
//   readonly (coach) > archived/paused > ended > unpaid > due.
// Los dos primeros ya se resolvieron arriba con `return`, así que llegar acá significa que el
// alumno pasó ambos. Fail-OPEN en todas las ramas: cualquier fallo de lectura ⇒ 'off'.
const billing = resolveStudentBillingForProxy({
    clientRow: rawClientData,            // is_demo / is_archived / is_active / org_id / team_id
    plan: await billingPlanPromise,      // ya lanzada arriba; null ⇒ 'off'
    coachTier: studentAccess?.coachTier ?? null,     // D-W8: sin round-trip extra
    coachStatus: studentAccess?.coachStatus ?? null,
    gateEnabled: cobrosGateEnabled,      // Edge Config COBROS_KILL_SWITCH (§10)
})

// R1: los DOS estados de corte mandan al mismo lugar con `reason` distinto. La página
// /c/<slug>/suspended elige el copy: 'unpaid' ofrece pagar; 'ended' dice «Tu plan con {coach}
// terminó» y NO muestra botón de pago (no hay cuota abierta que pagar).
if (billing.state === 'unpaid' || billing.state === 'ended') {
    // Rutas que el cortado SÍ puede ver (o el redirect loopea y no puede pagar nunca).
    const allowed = ['/suspended', '/pagos', '/login', '/change-password']
    if (!allowed.some(p => pathname.includes(p))) {
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = `/c/${coachSlug}/suspended`
        redirectUrl.searchParams.set('reason', billing.state)   // 'unpaid' | 'ended'
        const redirect = NextResponse.redirect(redirectUrl)
        supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
        return redirect
    }
    // Ya estamos en una ruta permitida: marcamos bloqueado para que el forced-password flow de
    // :1387 no intente sacarlo de acá (misma razón que el `studentBlocked` de :1365-1368).
    studentBlocked = true
}
if (billing.state === 'due' || billing.state === 'due_soon') {
    requestHeaders.set(STUDENT_BILLING_STATE_HEADER, billing.state)     // 'x-student-billing-state'
    if (billing.paidThrough) requestHeaders.set(STUDENT_BILLING_UNTIL_HEADER, billing.paidThrough)
    if (billing.cutsAt) requestHeaders.set(STUDENT_BILLING_CUTS_AT_HEADER, billing.cutsAt)
}
```

Notas de implementación:

- `studentBlocked` ya existe como `let` en `:1345`; el bloque nuevo solo lo setea.
- Los branches `/e` (enterprise) y `/t` (pool) **no se tocan**: el módulo es Pro standalone. Dejarlo
  escrito en el comentario, como pide `maps/r2-gate-alumno.md §8.3`.
- `resolveStudentBillingForProxy` es **puro** (no hace I/O: recibe la fila del plan ya resuelta) y
  vive en `apps/web/src/lib/cobros/state.server.ts`. Lee las columnas
  del coach (`subscription_tier`, `subscription_status`) que el proxy **ya** tiene en `coach`
  (`proxy.ts:527` las selecciona para el árbol `/coach`; para el árbol `/c` hay que sumarlas al SELECT
  de branding **no**: se reusa el `studentAccessPromise` de `:1217-1221`, que ya lee la fila del
  coach). **Decisión del writer (D-W8)**: extender `resolveStudentAccessForCoach` para que devuelva
  también `{ tier, status }` y así el gate de cobros no agrega **ni un round-trip**. Firma nueva:
  `resolveStudentAccessForCoach(db, coachId, opts): Promise<StudentAccessResult & { coachTier: string | null; coachStatus: string | null }>`.

### 4.3 Superficies del alumno que necesitan datos del coach

`/c/[slug]/pagos` muestra `transfer_instructions` y `own_payment_link_url`, que viven en
`coach_billing_settings` — tabla sin policy para el alumno (M1). Se sirven por route handler
server-side con service-role, devolviendo **solo esos dos campos**:

```ts
// apps/web/src/app/api/cobros/student/how-to-pay/route.ts (GET, cookies del alumno)
// Devuelve { transferInstructions, ownPaymentLinkUrl } del coach del alumno autenticado.
// NUNCA enabled, tax_rut, terms_*: no son asunto del alumno.
```

### 4.4 `/api/mobile/config` — shape JSON exacto

Hoy (`apps/web/src/app/api/mobile/config/route.ts:235-250`):

```jsonc
{
  "enabledModules": ["..."],
  "disabledModules": ["..."],
  "featurePrefs": { "nutritionEnabled": true, "sections": { "<key>": true } },
  "featurePrefsEnabled": false,
  "studentAccess": { "state": "ok" | "grace" | "readonly", "graceEndsAt": "ISO" | null }
}
```

Después:

```jsonc
{
  "enabledModules": ["..."],
  "disabledModules": ["..."],
  "featurePrefs": { "nutritionEnabled": true, "sections": { "<key>": true } },
  "featurePrefsEnabled": false,

  // R7 — EL MOROSO SÍ SE CORTA EN RN, con `state:'blocked'` + `reason`.
  // Verificado en el código vivo (apps/mobile/lib/entitlements-core.ts:105-113, `toStudentAccess`):
  // el normalizador **ya acepta `'blocked'`** (`raw === 'blocked' || raw === 'readonly' → 'blocked'`)
  // y descarta `reason`. O sea, en los binarios 1.1.0/1.1.1/1.1.2 ya instalados, emitir
  // `state:'blocked'` monta StudentAccessBlocked con el copy GENÉRICO de pausa
  // (student-access-copy.ts:31-36: «Tu cuenta está en pausa»). Eso es lo que R7 llama «la pausa
  // genérica (segura)»: corta de verdad y no dice ninguna falsedad verificable sobre quién debe.
  // El OTA de W4 agrega `reason` al normalizador y elige el copy exacto ('unpaid' vs 'ended').
  // `reason` es aditivo: los binarios viejos lo ignoran sin romperse.
  "studentAccess": {
    "state": "blocked",           // 'ok' | 'grace' | 'readonly' | 'blocked'
    "graceEndsAt": null,
    "reason": "unpaid"            // 'coach' | 'unpaid' | 'ended' | null
  },

  // Campo hermano, NUEVO. Los binarios viejos lo ignoran entero.
  // PROHIBIDO agregar acá: monto, moneda, checkoutUrl, initPoint, instrucciones de pago,
  // nombre de plan, o cualquier texto que insinúe dónde pagar (regla de tiendas, I-6, T-20).
  "studentBilling": {
    "state": "due",               // 'off' | 'ok' | 'due_soon' | 'due' | 'unpaid' | 'ended'
    "paidThrough": "2026-09-05",  // date, para «Al día hasta el 5 de septiembre»
    "cutsAt": "2026-09-09T04:00:00.000Z",
    "canClaim": true              // ¿hay una cuota pending sin claim vivo? (habilita «Avisar a mi coach»)
  }
}
```

Regla de traducción, en el servidor (`route.ts`, junto al `studentAccess` de `:247-249`):

```ts
const billing = scope.clientId ? await resolveStudentBillingForClient(admin, scope.clientId) : null

// R7. Precedencia (§4.1): readonly (coach) > ended > unpaid. El gate del COACH manda: si el coach no
// le paga a EVA, ese es el motivo y ese es el estado, pase lo que pase con el cobro del alumno.
const coachState = studentAccess?.state ?? 'ok'
const billingBlocks = billing?.state === 'unpaid' || billing?.state === 'ended'

const state: 'ok' | 'grace' | 'readonly' | 'blocked' =
    coachState === 'readonly' ? 'readonly'
  : billingBlocks            ? 'blocked'     // ← R7: el moroso/terminado SÍ se bloquea en nativo
  : coachState                                // 'ok' | 'grace'

const reason: 'coach' | 'unpaid' | 'ended' | null =
    coachState === 'readonly'   ? 'coach'
  : billing?.state === 'ended'  ? 'ended'
  : billing?.state === 'unpaid' ? 'unpaid'
  : null

return NextResponse.json({
    /* … lo existente … */
    studentAccess: { state, graceEndsAt: studentAccess?.graceEndsAt ?? null, reason },
    studentBilling: billing
        ? { state: billing.state, paidThrough: billing.paidThrough, cutsAt: billing.cutsAt, canClaim: billing.canClaim }
        : { state: 'off', paidThrough: null, cutsAt: null, canClaim: false },
})
```

**Consecuencia declarada, y aceptada (R7)**: en los binarios **1.1.0 / 1.1.1 / 1.1.2 ya en la calle**
el alumno cortado ve la **pantalla de pausa genérica** con el copy del coach
(`STUDENT_ACCESS_COPY.blockScreen`), que es impreciso pero **seguro**: corta, no muestra montos ni
links (regla de tiendas), y ofrece el único CTA permitido en iOS, «Escribir a mi coach». Con el OTA de
W4, `toStudentAccess` conserva `reason` y la pantalla dice lo que es —«Tu acceso está en pausa» para
`unpaid`, y el copy de plan terminado para `ended`— sin reusar una línea del vocabulario del coach
moroso. **La barrera de datos (M15/M16) aplica desde el día 1 en todos los binarios**, así que ni
siquiera un binario que ignorara todo esto podría escribir.

**Esto reemplaza a D-W13** (`x-eva-client-caps: student-billing`): ese header existía para no emitir
un corte que los binarios viejos interpretaran con el copy equivocado. R7 decide que el corte vale más
que la precisión del copy, y el hecho verificado —`toStudentAccess` ya entiende `'blocked'`— hace que
el corte funcione sin contrato nuevo. Si igual se quiere el copy fino sin esperar al OTA, es una
decisión de producto, no un requisito técnico.

`PLAN §4` decía «los binarios viejos lo ignoran, fail-open» sobre `studentAccess`: eso era **falso**
(los binarios viejos **sí** bloquean con `'blocked'`/`'readonly'`) y hay que corregirlo allá — ahora en
la dirección contraria: **bloquean, y es lo que R7 quiere**.

Los binarios **nuevos** (OTA de W4) montan pantalla y copy **propios**, elegidos por `reason`, y no
reusan una sola línea de `STUDENT_ACCESS_COPY`: el corte por deuda con el coach dice lo que es
(`OUTLINE §7`: «Tu acceso está en pausa» · «Escríbele a tu coach para reactivarlo» · «Tu progreso está
guardado y te espera», sin monto, sin link, sin «paga en la web»).

**~~Decisión del writer (D-W13)~~ — REEMPLAZADA POR R7.** Decía que el corte nativo por deuda solo se
emitiría a clientes que se identificaran con `x-eva-client-caps: student-billing`. R7 resuelve el
problema por el otro lado: se emite `state:'blocked'` **siempre**, los binarios viejos muestran la
pausa genérica (segura) y el OTA agrega el copy por `reason`. El header **no se implementa**: era una
mitigación para un riesgo que el owner decidió aceptar, y agregarlo ahora sería un contrato nuevo
entre RN y `/api/mobile/config` sin nadie que lo necesite.

`/api/mobile/auth/account-status` **no cambia**: el moroso no está baneado ni pausado, así que sigue
devolviendo `access: 'active'` y RN no lo desloguea (`maps/r2-gate-alumno.md §6.2`). Ampliar el
validador de `apps/mobile/lib/student-account-status.ts:23` primero en un binario y recién después
emitir desde el server, o el objeto entero se descarta.

`toStudentAccess` (`apps/mobile/lib/entitlements-core.ts:105-113`) **hoy descarta `reason` entero** y
mapea `'blocked' | 'readonly' → 'blocked'`, `'ok'`/desconocido → fail-open `'active'`. El OTA de W4
agrega `reason` al normalizador con **fail-open a `'coach'`** (un valor desconocido no inventa un
motivo nuevo) y `StudentAccessBlocked` elige el copy por ese campo:
`'coach'` → `STUDENT_ACCESS_COPY.blockScreen` (el de siempre) · `'unpaid'` → «Tu acceso está en
pausa» + «Escríbele a tu coach para reactivarlo» · `'ended'` → el copy de plan terminado (R1). Guard
de W4: un test que falle si `STUDENT_ACCESS_COPY.blockScreen` se renderiza con `reason` `'unpaid'` o
`'ended'`, y otro que fije que el normalizador **acepta** `state:'blocked'` (si alguien lo endurece a
un union más chico, el corte de R7 se apaga en silencio).

### 4.5 Precedencia en las rutas API de coach

Toda ruta nueva bajo `/api/cobros/**` y `/api/mobile/coach/cobros*` compone el mismo guard, en este
orden y con estos códigos:

```ts
// apps/web/src/lib/cobros/guard.ts
export async function resolveCobrosAccess(db, coachId): Promise<
  | { ok: true; settings: CoachBillingSettings }
  | { ok: false; code: 'COBROS_DISABLED' | 'COBROS_NOT_IN_BETA' | 'COBROS_TIER' | 'COACH_NO_ACCESS' | 'COBROS_NOT_ENABLED' }
> {
  if (process.env.COBROS_ENABLED !== 'true') return { ok: false, code: 'COBROS_DISABLED' }   // fail-closed
  if (await isCobrosKillSwitchOn()) return { ok: false, code: 'COBROS_DISABLED' }            // Edge Config
  const coach = await readCoach(db, coachId)                                                 // tier + status
  if (!hasEffectiveAccess(coach.subscription_status, coach.current_period_end))
    return { ok: false, code: 'COACH_NO_ACCESS' }
  if (!isCobrosAllowed(coach.subscription_tier)) return { ok: false, code: 'COBROS_TIER' }   // @eva/tiers
  if (!(await isCoachInCobrosBeta(coachId))) return { ok: false, code: 'COBROS_NOT_IN_BETA' }
  const settings = await readSettings(db, coachId)
  if (!settings?.enabled) return { ok: false, code: 'COBROS_NOT_ENABLED' }
  return { ok: true, settings }
}
```

Los cinco códigos se mapean a **404** en las rutas del alumno (no revelar que existe el módulo) y a
**403 con código** en las del coach (la UI necesita distinguir «no sos Pro» de «no estás en la beta»).

#### La excepción de la cancelación (corrección B-04 producto / F-04) — **no es negociable**

**R5 cambia el punto de partida**: dos de esos tres caminos **ahora sí cancelan** los preapprovals
(coach baja a Free y desconexión desde EVA — §5.8), y el kill-switch **a propósito no lo hace** (es
temporal: solo apaga gate, cron y webhook). Pero la rama de supervivencia sigue siendo obligatoria,
porque queda un caso que EVA no puede cancelar: la **desautorización desde el panel de MP**, donde el
token ya está muerto. Ahí el alumno vería «Tu coach no tiene cobros activados por acá» mientras le
cobran, y **perdería el botón «Cancelar mi suscripción»** si `/c/<slug>/pagos` devolviera 404. Eso es
un cobro recurrente que el consumidor no puede detener: rompe el **invariante 10 del propio SPEC**, la
**Ley 21.398** (E11 de TESTING-LEGAL, bloqueante) e **I-13**.

```ts
// apps/web/src/lib/cobros/guard.ts — rama de supervivencia del alumno.
// SI existe una student_subscriptions del alumno en ('pending','authorized'), las DOS superficies
// mínimas siguen vivas aunque el módulo esté apagado por CUALQUIER motivo:
//   · GET  /c/<slug>/pagos            → modo mínimo: estado de la suscripción + botón de baja
//   · POST /c/<slug>/pagos (cancelar) → PUT /preapproval/{id} {status:'cancelled'}
// Nada más: ni links nuevos, ni cuotas nuevas, ni cobros. Solo mirar y darse de baja.
export async function resolveCobrosAccessForStudent(db, clientId): Promise<
  | { ok: true; mode: 'full' | 'cancel_only' }
  | { ok: false }
>
```

Y cuando ya **no queda token** para llamar a MP (deauthorized, `invalid_grant`): el plan se marca
`needs_manual_cancel = true` (M2), se le manda correo **al alumno y al coach** con el paso a paso para
darse de baja **desde la app de Mercado Pago**, y `/pagos` muestra esa instrucción en vez de un botón
que no funciona. `SPEC §5.2 T18` tiene que decir eso, no «los planes pasan a manual sin cortar a
nadie».


---

## 5. OAuth MercadoPago — conectar la cuenta del coach

Aplicación **«EVA Cobros»**, distinta de la de billing EVA↔coach (AppID `539042216877374`). Permisos
`read write offline_access`, PKCE **habilitado**, redirect URI estática por entorno (I-7,
`research/s8 §2.10`). Dos apps: producción y «EVA Cobros (test)» para preview.

### 5.1 Secuencia completa

```
1. Coach → GET /api/cobros/mp/connect            (sesión de coach, cookies)
     ├─ resolveCobrosAccess(coach) → si no, 403
     ├─ rateLimitCobrosOauth(coachId) → 5/hora
     ├─ genera state (32 bytes) + code_verifier (64 bytes base64url, 43-128 chars)
     ├─ setea cookie httpOnly firmada `cobros_oauth` { state, verifier, coachId, exp: +10 min }
     └─ 302 → https://auth.mercadopago.com/authorization
                ?client_id=<COBROS_MP_CLIENT_ID>
                &response_type=code
                &platform_id=mp
                &state=<state>
                &redirect_uri=<COBROS_MP_REDIRECT_URI>     ← ESTÁTICA, sin query dinámica
                &code_challenge=<base64url(sha256(verifier))>
                &code_challenge_method=S256
                &scope=offline_access%20read%20write

2. Coach autoriza en MP → 302 a COBROS_MP_REDIRECT_URI?code=TG-…&state=…

3. GET /api/cobros/mp/callback
     ├─ rateLimitCobrosOauth(ip) → 10/hora  (el callback es público)
     ├─ lee y BORRA la cookie `cobros_oauth`; verifica firma HMAC y exp
     ├─ re-verifica la SESIÓN del coach: cookie.coachId === session.user.id  ← T-14
     ├─ compara `state` de la query con el de la cookie, timing-safe
     ├─ POST https://api.mercadopago.com/oauth/token  (§5.2)
     ├─ GET https://api.mercadopago.com/users/me  con el token del coach (§5.3)
     ├─ valida site_id === 'MLC' y live_mode === true en prod
     ├─ rechaza si ese provider_account_id ya está activo en OTRO coach  ← T-16b
     ├─ cifra tokens (§5.4) → upsert coach_payment_connections + evento 'connect'
     └─ 302 → /coach/cobros?conectado=1
```

**El `code` dura 10 minutos y es de un solo uso** (`research/s8 §2.3`): si el canje falla, no se
reintenta — se muestra «No pudimos conectar. Intenta de nuevo» y el coach reinicia el flujo.

### 5.2 Cookie firmada, state y PKCE

```ts
// apps/web/src/lib/cobros/oauth.ts
import 'server-only'
import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto'

const COOKIE = 'cobros_oauth'
const TTL_MS = 10 * 60 * 1000          // igual que la vida del `code` en MP

interface OauthCookiePayload { state: string; verifier: string; coachId: string; exp: number }

function sign(raw: string): string {
  const secret = process.env.COBROS_MP_CLIENT_SECRET  // reusa el secret de la app; nunca sale del server
  if (!secret) throw new Error('Missing COBROS_MP_CLIENT_SECRET')
  return createHmac('sha256', secret).update(raw).digest('base64url')
}

export function buildOauthCookie(coachId: string): { value: string; payload: OauthCookiePayload } {
  const payload: OauthCookiePayload = {
    state: randomBytes(32).toString('base64url'),        // ≥128 bits de entropía
    verifier: randomBytes(64).toString('base64url'),     // 86 chars: dentro del rango 43-128 de MP
    coachId,
    exp: Date.now() + TTL_MS,
  }
  const raw = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { value: `${raw}.${sign(raw)}`, payload }
}

export function readOauthCookie(value: string | undefined): OauthCookiePayload | null {
  if (!value) return null
  const [raw, sig] = value.split('.')
  if (!raw || !sig) return null
  const expected = sign(raw)
  // timing-safe: la comparación de la firma no puede filtrar el secret por early-exit.
  const a = Buffer.from(sig, 'utf8'), b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as OauthCookiePayload
    return p.exp > Date.now() ? p : null
  } catch { return null }
}

export function codeChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}
```

Atributos de la cookie: `httpOnly: true, secure: true, sameSite: 'lax', path: '/api/cobros/mp',
maxAge: 600`. `lax` (no `strict`) porque el retorno de MP es una navegación top-level cross-site; con
`strict` la cookie no viajaría y el callback fallaría siempre.

**Por qué cookie y no tabla de `state`** (r7 §6 T-14 proponía fila en DB): la cookie firmada con TTL
corto da las mismas garantías (ligada al `coach_id`, no falsificable, de un solo uso porque se borra
al leerla) sin una tabla, sin un cron de limpieza y sin escrituras en el camino. Además obliga a que
el callback llegue **en el mismo navegador** que inició el flujo, que es justo lo que T-14 quiere.
**Decisión del writer (D-W9)**, contra la propuesta de r7.

### 5.3 Canje del `code` y `/users/me`

Cliente HTTP **propio**, no `buildMpHeaders` (`apps/web/src/lib/payments/providers/mercadopago.ts:98`)
— ese agrega `Authorization` y a veces `X-scope: stage`, y `/oauth/token` **rechaza headers y params
extra** (`research/s8 §2.9`, best-practices oficial).

```ts
// apps/web/src/lib/cobros/oauth.ts (cont.)
const MP = 'https://api.mercadopago.com'

async function oauthPost(body: Record<string, string | boolean>) {
  const res = await fetch(`${MP}/oauth/token`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' }, // SOLO estos dos
    body: JSON.stringify(body),                                                   // SOLO las claves del flujo
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    // `error` ∈ invalid_client | invalid_grant | invalid_scope | invalid_request |
    //            unsupported_grant_type | forbidden | unauthorized_client | local_rate_limited
    throw new MpOauthError(String(json.error ?? res.status), res.status)
  }
  return json as {
    access_token: string; refresh_token: string; token_type: string
    expires_in: number; scope: string; user_id: number; public_key: string; live_mode: boolean
  }
}

export async function exchangeCode(code: string, verifier: string) {
  return oauthPost({
    client_id: process.env.COBROS_MP_CLIENT_ID!,
    client_secret: process.env.COBROS_MP_CLIENT_SECRET!,
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.COBROS_MP_REDIRECT_URI!,
    code_verifier: verifier,
    // Solo en preview, para credenciales de sandbox (research/s8 §2.3).
    ...(process.env.VERCEL_ENV !== 'production' ? { test_token: true } : {}),
  })
}

export async function fetchMpUser(accessToken: string) {
  const res = await fetch(`${MP}/users/me`, {
    headers: { accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new MpOauthError('users_me_failed', res.status)
  // [GAP research/s8 §11.1] la lista exacta de campos no está en doc oficial accesible. Se leen
  // defensivamente: si falta `site_id`, se usa el `user_id` del token y se registra el gap.
  return (await res.json()) as { id: number; nickname?: string; site_id?: string; country_id?: string }
}
```

Validaciones del callback antes de persistir:

| Chequeo | Falla ⇒ |
|---|---|
| `token.live_mode === true` en producción | 400 «Conectaste una cuenta de prueba» + evento `error` |
| `user.site_id === 'MLC'` (o `country_id === 'CL'`) | 400 «Tu cuenta de MP debe ser de Chile» (el `currency_id: CLP` del preapproval exige coherencia con el collector, `research/s8 §2.6`) |
| `token.scope` incluye `offline_access` | 400 + aviso: sin él no hay refresh y la conexión muere a los 180 días |
| Ese `provider_account_id` ya está `active` en otro coach | 409 «Esa cuenta de MercadoPago ya está conectada a otra cuenta de EVA» (lo garantiza además `coach_payment_connections_account_uidx`) |

### 5.4 `token-crypto.ts` — formato, AAD, y por qué AES-256-GCM

Opción A de `maps/r7-db-seguridad.md §7`: cifrado a nivel aplicación, clave en env de Vercel marcada
**Sensitive**. Saca el secreto del blast radius de la DB (dump, backup, snapshot, log de query) sin
extensiones nuevas — `pgsodium` **no está instalado** (LIVE: `installed_version: null`) y está
deprecado; `supabase_vault` 0.3.1 sí está, pero cualquiera con service-role lee
`vault.decrypted_secrets`, o sea el mismo blast radius con más acoplamiento.

```ts
// apps/web/src/lib/cobros/token-crypto.ts
import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

/**
 * Formato del ciphertext (string único, guardado en coach_payment_connections.*_enc):
 *
 *     v<version>.<base64url(iv, 12 bytes)>.<base64url(tag, 16 bytes)>.<base64url(ciphertext)>
 *
 * · `v<version>` duplica `enc_key_version` DENTRO del blob: si alguien mueve la fila entre entornos
 *   o restaura un backup viejo, el blob sigue diciendo con qué clave se cifró.
 * · IV de 12 bytes ALEATORIO por operación (nunca reutilizado: con GCM, repetir IV con la misma
 *   clave rompe la confidencialidad).
 * · AAD = `${coachId}|${provider}|${kind}` con kind ∈ 'access'|'refresh'. Ata el ciphertext a su
 *   fila y a su columna: mover el refresh_token de un coach a otro, o pegarlo en la columna del
 *   access_token, hace fallar el tag. Es la defensa contra un atacante con INSERT en la DB.
 */
const VERSIONS: Record<number, string | undefined> = {
  1: process.env.COBROS_OAUTH_ENC_KEY_V1,
  2: process.env.COBROS_OAUTH_ENC_KEY_V2,   // vacío hasta la primera rotación
}
export const CURRENT_ENC_KEY_VERSION = Number(process.env.COBROS_OAUTH_ENC_KEY_CURRENT) || 1

function keyFor(version: number): Buffer {
  const raw = VERSIONS[version]
  if (!raw) throw new Error(`Missing COBROS_OAUTH_ENC_KEY_V${version}`)
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error(`COBROS_OAUTH_ENC_KEY_V${version} debe ser 32 bytes en base64`)
  return key
}

export type TokenKind = 'access' | 'refresh'
const aad = (coachId: string, provider: string, kind: TokenKind) =>
  Buffer.from(`${coachId}|${provider}|${kind}`, 'utf8')

export function encryptToken(
  plaintext: string, coachId: string, provider: string, kind: TokenKind,
  version = CURRENT_ENC_KEY_VERSION,
): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', keyFor(version), iv)
  c.setAAD(aad(coachId, provider, kind))
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return `v${version}.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`
}

export function decryptToken(
  blob: string, coachId: string, provider: string, kind: TokenKind,
): string {
  const [v, ivB, tagB, ctB] = blob.split('.')
  if (!v?.startsWith('v') || !ivB || !tagB || !ctB) throw new Error('cobros: ciphertext malformado')
  const d = createDecipheriv('aes-256-gcm', keyFor(Number(v.slice(1))), Buffer.from(ivB, 'base64url'))
  d.setAAD(aad(coachId, provider, kind))
  d.setAuthTag(Buffer.from(tagB, 'base64url'))
  // Si el tag no valida (blob manipulado, AAD distinta, clave equivocada) `final()` LANZA. Nunca
  // devolvemos texto sin autenticar.
  return Buffer.concat([d.update(Buffer.from(ctB, 'base64url')), d.final()]).toString('utf8')
}

/** Huella NO reversible para soporte y logs. Jamás el token. */
export function tokenFingerprint(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex').slice(0, 12)
}
```

Tests obligatorios (`apps/web/src/lib/cobros/token-crypto.test.ts`): round-trip; tag inválido lanza;
AAD de otro coach lanza; AAD de la otra columna (`access` vs `refresh`) lanza; blob de v1 se descifra
con `CURRENT = 2`; clave de largo distinto de 32 lanza al arrancar; el `iv` nunca se repite en 10 000
cifrados del mismo texto.

### 5.5 Rotación por `enc_key_version`

1. Se agrega `COBROS_OAUTH_ENC_KEY_V2` (32 bytes base64, Vercel **Sensitive**), sin tocar V1.
2. Se sube `COBROS_OAUTH_ENC_KEY_CURRENT=2`. Desde ese deploy, todo lo que se escribe va con v2; lo
   que se lee usa la versión del blob.
3. El cron `cobros-mp-reconcile` re-cifra en background hasta 20 filas por corrida:
   `select … where enc_key_version < 2 for update skip locked` → descifra con la versión de la fila,
   cifra con la actual, `update … set access_token_enc, refresh_token_enc, enc_key_version = 2`.
4. Cuando `count(*) where enc_key_version = 1` llega a 0, se borra V1 del entorno.

Nunca se borra V1 antes del paso 4: una fila con blob v1 y sin clave v1 es un token perdido y el coach
tendría que reconectar.

### 5.6 Refresh con `select … for update` y rotación del `refresh_token`

MP renueva **también el `refresh_token`** en cada refresh y hay que volver a guardarlo
(`research/s8 §2.4`, cita literal de la doc). El access dura 180 días. Dos corridas simultáneas del
cron podrían canjear el mismo refresh y dejar la conexión muerta ⇒ candado de fila.

```ts
// apps/web/src/services/cobros/connection.service.ts
// R13/D-W15: acá NO hay `withTransaction` — no existe sobre PostgREST. El TS orquesta el HTTP
// contra MP (que no puede ser transaccional de ninguna manera) y cada grupo de escrituras que tiene
// que caer junto va en UNA RPC plpgsql `security definer` del schema `private`.
export async function refreshConnection(admin: Db, connectionId: string): Promise<RefreshOutcome> {
  // 1. Tomar la conexión y descifrar el refresh. `private.cobros_lock_connection` hace el
  //    `select … for update` (skip locked en el barrido del cron) y devuelve la fila.
  const { data: conn } = await admin.rpc('cobros_lock_connection', { p_id: connectionId })
  if (!conn || conn.status !== 'active') return { kind: 'skipped' }

  const refresh = decryptToken(conn.refresh_token_enc, conn.coach_id, conn.provider, 'refresh')

  // 2. HTTP contra MP. Fuera de toda transacción, a propósito.
  let token
  try {
    token = await oauthPost({
      client_id: process.env.COBROS_MP_CLIENT_ID!,
      client_secret: process.env.COBROS_MP_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    })
  } catch (e) {
    const code = e instanceof MpOauthError ? e.code : 'unknown'
    if (code === 'invalid_grant' || code === 'unauthorized_client' || code === 'forbidden') {
      // Revocación real: el coach desvinculó EVA desde su panel de MP. UNA sola RPC deja la
      // conexión revocada, FRENA el motor de todos sus planes mp_* (engine_hold_at, corrección
      // B-04) y escribe el evento — las tres cosas o ninguna. Sin conexión no hay webhook ni
      // token: nada puede avanzar paid_through y el preapproval SIGUE COBRANDO en la cuenta del
      // coach; cortar ahí sería castigar a quien paga. Es el criterio de aborto de la beta.
      await admin.rpc('cobros_revoke_connection', {
        p_id: connectionId, p_reason: 'invalid_grant', p_error: code,
      })
      return { kind: 'revoked' }   // → C5 al coach; los planes NO se cortan (§5.7); R5 no puede
                                   //   cancelar por API (token muerto) ⇒ needs_manual_cancel
    }
    // Transitorio (429 local_rate_limited, 5xx, timeout): NO tocar el status. Reintenta mañana.
    await admin.rpc('cobros_note_refresh_error', { p_id: connectionId, p_error: code })
    return { kind: 'transient' }
  }

  // 3. Persistencia de los dos tokens + el nuevo refresh + el evento, en UNA RPC. Si falla, el
  //    refresh viejo sigue en la fila (puede que MP ya lo haya rotado: el próximo intento dará
  //    invalid_grant y el coach reconecta — degradación conocida y aceptada).
  await admin.rpc('cobros_apply_refresh', {
    p_id: connectionId,
    p_access_enc:  encryptToken(token.access_token,  conn.coach_id, conn.provider, 'access'),
    p_refresh_enc: encryptToken(token.refresh_token, conn.coach_id, conn.provider, 'refresh'),
    p_enc_key_version: CURRENT_ENC_KEY_VERSION,
    p_fingerprint: tokenFingerprint(token.access_token),
    p_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    p_scope: token.scope, p_token_type: token.token_type,
  })
  return { kind: 'refreshed' }
}
```

**🔴 `withTransaction` NO EXISTE sobre PostgREST (corrección DB-02, elevada a regla por R13).** Cada
`tx.from()` de supabase-js es **su propia transacción HTTP**: no hay `BEGIN`, y un `for update` **se
libera apenas la RPC retorna**. Por eso en este documento **no queda un solo `withTransaction`**: donde
había uno, hay una RPC. Regla para todo el riel:

> Cuando dos escrituras **tienen** que caer juntas o no caer, van en **una sola función plpgsql
> `security definer` del schema `private`**, invocada con **un** `rpc()` y con service-role. Las
> cuatro de plata están en M14 (§8.1, §8.3, §8.4, §8.5); las de conexión —`cobros_lock_connection`,
> `cobros_apply_refresh`, `cobros_revoke_connection`, `cobros_note_refresh_error`— viven en el mismo
> archivo y con el mismo candado de grants.

Umbral del cron: `expires_at < now() + interval '30 days'`. Con 180 días de vida y un cron diario, hay
150 días de colchón antes del vencimiento real.

### 5.7 Desautorización: `mp-connect` y desconexión desde EVA

**Desde MP (el coach desvincula la app)**: llega el topic `mp-connect`, acción
`application.deauthorized`, con `user_id` = el coach en MP (`research/s1 §2.3`). **[GAP research/s8
§11.2]**: el payload exacto no está documentado. Por eso:

1. El handler acepta el topic, registra el evento crudo **recortado** en `student_payment_events`
   (`event_kind='connection'`) y en `coach_payment_connection_events` (`action='deauthorized'`).
2. Resuelve la conexión por `provider_account_id = String(body.user_id)`.
3. `status='revoked'`, `revoked_reason='deauthorized'`, `revoked_at=now()`.
4. Los planes `mp_link` / `mp_subscription` de ese coach pasan a `mode='manual'`, **con
   `engine_hold_at = now()` y `engine_hold_reason = 'mp_deauthorized'`** (corrección B-04), sin tocar
   `paid_through`. «Pasan a manual sin cortar a nadie» (`OUTLINE §2.2`) es cierto **solo en el
   instante**: el estado es DERIVADO de `paid_through`, y sin conexión nada puede avanzarlo —no hay
   webhook, no hay token para re-fetchear, y el alumno no avisa porque le cobran solo. A los 0-3 días
   el gate lo cortaría **mientras MP le sigue descontando**. El freno es lo que lo impide.
5. **Suscripciones vivas** (`pending`/`authorized`): se marcan `needs_manual_cancel = true` y sale
   correo **a los dos** —al coach (C5) y al alumno—, porque el token ya está muerto y EVA **no puede**
   cancelarlas por API. El correo al alumno explica la baja desde la app de Mercado Pago; `/pagos`
   sigue sirviéndose en modo mínimo (§4.5) con esa instrucción. **Es el único camino de R5 en el que
   EVA no cancela**: la conexión queda `revoked`, los planes `mp_*` pasan a `manual` y C5 lleva las
   instrucciones para cancelar en el panel de MP.
6. La primera vez que llegue, se copia el payload real a la spec: es la única forma de documentarlo.

**Desde EVA (`POST /api/cobros/mp/disconnect`)**: no hay endpoint de revocación programática
documentado en MP (`research/s8 §11.3`). Y acá está el agujero que corrige **F-04**: la versión
anterior desconectaba primero y avisaba después, dejando N suscripciones cobrando sin botón de baja
—porque cancelar necesita `PUT /preapproval/{id}` **con el token del coach**, que se acaba de matar.

**R5: se cancelan TODAS las suscripciones vivas ANTES de revocar los tokens, y el diálogo lo dice.**
La versión anterior ofrecía un «desconectar igual» (`force`) que dejaba N cobros vivos sin botón de
baja; R5 lo elimina. La desconexión **se bloquea** mientras haya suscripciones vivas y el único camino
es cancelarlas primero — que además es la única ventana en que EVA técnicamente puede, porque cancelar
necesita `PUT /preapproval/{id}` **con el token del coach**.

```ts
// POST /api/cobros/mp/disconnect  { confirm?: 'cancel_all' }
const live = await countLiveSubscriptions(admin, coachId)   // status in ('pending','authorized')

// 409 con la cuenta: la UI muestra el diálogo de R5 — «Tienes N alumnos con suscripción activa.
// Al desconectar, EVA las va a cancelar en Mercado Pago para que no se les siga cobrando.»
// No hay opción de saltárselo.
if (live > 0 && body.confirm !== 'cancel_all') {
  return NextResponse.json(
    { ok: false, code: 'COBROS_LIVE_SUBSCRIPTIONS', count: live }, { status: 409 })
}

// (1) Cancelar TODAS, con el servicio compartido de §5.8 (reintentos + alerta).
const results = await cancelSubscriptionsForCoach(admin, coachId, { reason: 'coach_disconnect' })

// (2) Si alguna NO se pudo cancelar tras los reintentos, NO se revocan los tokens todavía: el
//     token vivo es lo único que puede cerrar esa suscripción, y tirarlo es cerrar la puerta desde
//     adentro. Se responde 502 con la lista, se alerta a ADMIN_EMAILS y el coach puede reintentar.
if (results.failed.length > 0) {
  await alertAdmins('cobros.cancel_all.partial', { coachId, failed: results.failed })
  return NextResponse.json(
    { ok: false, code: 'COBROS_CANCEL_FAILED', failed: results.failed.length }, { status: 502 })
}

// (3) Recién ahora: borrar los secretos de nuestro lado (no dejarlos "por si acaso").
await admin.from('coach_payment_connections').update({
  access_token_enc: null, refresh_token_enc: null, access_token_fingerprint: null,
  status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: 'coach',
}).eq('coach_id', coachId).eq('provider', 'mercadopago')

// (4) Y el FRENO del motor sobre los planes automáticos (B-04): degradar a manual NO alcanza, porque
//     sin señal nadie puede avanzar paid_through y el gate cortaría a quien MP le sigue cobrando.
await admin.from('client_billing_plans').update({
  mode: 'manual',
  engine_hold_at: new Date().toISOString(),
  engine_hold_reason: 'mp_disconnected',
}).eq('coach_id', coachId).in('mode', ['mp_link','mp_subscription'])
```

**Lo que dice el diálogo, literal en la UI** (y en C5): desconectar **cancela** las suscripciones de
tus alumnos en Mercado Pago —dejan de cobrarse desde hoy— y tus planes pasan a cobro manual. Si alguna
no se puede cancelar, te avisamos y no desconectamos hasta resolverlo.

### 5.8 Cancelar preapprovals: el servicio único de R5

**I-13: nadie sigue cobrando a quien perdió el acceso.** Un solo servicio concentra la baja remota, y
**todos** los caminos que apagan un cobro pasan por él. Sin esto, cada camino inventaba su versión y
tres de los cinco no cancelaban nada.

```ts
// apps/web/src/services/cobros/cancel-subscription.service.ts
export type CancelReason =
  | 'plan_canceled'      // el plan se canceló (lo pidió el alumno o el coach)
  | 'client_archived'    // el alumno se archivó o se eliminó
  | 'coach_disconnect'   // el coach desconectó MP desde EVA (§5.7)
  | 'coach_downgrade'    // el coach bajó a Free
  | 'admin'

/**
 * PUT /preapproval/{id} { status: 'cancelled' } con el token DEL COACH.
 * · Reintentos: 3 intentos con backoff (1 s / 5 s / 30 s) ante 5xx y timeout.
 * · 404 de MP  ⇒ ya no existe: se trata como éxito y se espeja el estado local.
 * · 401/403    ⇒ token muerto: NO es reintentable. `needs_manual_cancel = true`, C5 al coach y
 *                correo al alumno con el paso a paso desde su app de Mercado Pago.
 * · Falla tras los reintentos ⇒ `needs_manual_cancel = true` + **alerta a ADMIN_EMAILS**
 *                ('cobros.cancel_subscription.failed') + la fila queda en la cola que revisa
 *                `cobros-mp-reconcile` en la corrida siguiente. Un cobro vivo que nadie mira es
 *                exactamente lo que R5 prohíbe.
 * · El espejo local (status='canceled', canceled_by, cancel_requested_at) lo escribe
 *   `private.cobros_cancel_subscription_local(...)` (M14): una RPC, no tres updates sueltos.
 */
export async function cancelSubscription(
  admin: Db, subscriptionId: string, reason: CancelReason,
): Promise<{ ok: true } | { ok: false; retryable: boolean }>

/** Cancela TODAS las vivas de un coach. Devuelve `{ canceled, failed }` para la UI y la alerta. */
export async function cancelSubscriptionsForCoach(
  admin: Db, coachId: string, opts: { reason: CancelReason },
): Promise<{ canceled: string[]; failed: string[] }>
```

**Los cinco hooks obligatorios** (si falta uno, alguien sigue pagando por nada):

| # | Disparador | Qué hace | Dónde se cablea |
|---|---|---|---|
| H-1 | **El plan se cancela** (alumno con su botón, o coach) | `cancelSubscription(reason:'plan_canceled')` **antes** de escribir `status='canceled'` en el plan. El acceso se conserva hasta `paid_through` y después es `ended` (R1). | `plan.service.ts` + la server action del alumno |
| H-2 | **El alumno se archiva o se elimina** | `cancelSubscription(reason:'client_archived')` para la suscripción viva de ese cliente. Archivar deja de ser solo un flag de UI: apaga la plata. | `client.service.ts` (archivar/eliminar) |
| H-3 | **El coach desconecta MP desde EVA** | `cancelSubscriptionsForCoach` **antes** de revocar tokens; sin éxito total no se desconecta (§5.7). Diálogo obligatorio. | `POST /api/cobros/mp/disconnect` |
| H-4 | **El coach baja a Free** | Correo **C6** + `cancelSubscriptionsForCoach(reason:'coach_downgrade')` + **todos sus planes pasan a `paused`** (no `canceled`: si vuelve a Pro, los reactiva sin recrearlos, y `paused` ⇒ estado `off` ⇒ nadie se corta). | el webhook/servicio de downgrade del billing EVA↔coach |
| H-5 | **Desautorización desde MP** (`mp-connect`) | **EVA ya no puede llamar a la API.** Conexión `revoked`, planes `mp_*` → `manual` + `engine_hold_at`, `needs_manual_cancel = true`, **C5** al coach con las instrucciones para cancelar en su panel de MP y correo al alumno (§5.7). | handler del topic `mp-connect` |

**El kill-switch global NO cancela suscripciones** (R5). Es una palanca **temporal**: apaga gate, cron
y aplicación del webhook, y se vuelve a encender. Cancelar N preapprovals es irreversible —MP no tiene
«descancelar»— y obligaría a cada alumno a suscribirse de nuevo. Va en negrita en el runbook.

---

## 6. Webhook `POST /api/cobros/mp/webhook`

Ruta propia, secretos propios, pipeline propio. **No** se reusa `runWebhookPipeline`
(`apps/web/src/lib/payments/webhook-pipeline.ts:100`): es money-safety del billing EVA↔coach y un bug
del riel nuevo no puede tener camino a mutar `coaches.subscription_*` (`research/s8 §4.5`).

### 6.1 Pseudocódigo paso a paso

```
POST /api/cobros/mp/webhook/<webhook_ref>?token=<token derivado>
headers: x-signature: ts=…,v1=… · x-request-id: … · content-type: application/json

 (R-01 + R22) LA URL LLEVA UN TOKEN **DERIVADO**, NUNCA EL SECRETO GLOBAL.
    R22 pide que el webhook acepte `?token=` mientras X1 no confirme qué secret firma. R-01 prohíbe
    repartir COBROS_WEBHOOK_TOKEN dentro de N cuentas MP ajenas (el notification_url vive en recursos
    creados en la cuenta del coach: él lo lee con su propio token o desde su panel). Las dos cosas se
    cumplen con la variante derivada que ya proponía este documento:
        token = HMAC_SHA256(COBROS_WEBHOOK_TOKEN, webhook_ref)  (hex, 64 chars)
    · Es un `?token=` real, verificable con `constantTimeEquals`, que no depende de la firma.
    · Filtrar el de un coach NO filtra el de los demás y no revela la clave madre.
    · <webhook_ref> = coach_payment_connections.webhook_ref (M6) sigue identificando la conexión.
    Rotar = regenerar `webhook_ref` (y con él el token) y re-emitir los recursos vivos.
    La URL completa del webhook se suma a la lista de «prohibido loguear» de §12.3.

 0. KILL-SWITCH — SE APAGA LA MUTACIÓN, NO LA RECEPCIÓN (corrección LEG-08). Con el switch
    encendido, el handler igual corre los pasos 1-4: valida y **registra el evento** con
    status='received' … y responde **503**, no 200. Razones:
      · MP no reintenta tras un 200. Un 200 acá = evento descartado para siempre = el alumno pagó,
        paid_through no avanza, no sale E5 (la única constancia del pago, §6.4 la declaró intocable)
        y encima puede quedar cortado. Cobro sin comprobante: eso es lo que mira la Ley 21.398.
      · Con 503 MP reintenta cada 15 min y, apenas se reencienda, el evento se aplica solo.
      · El reconcile que «lo recuperaba» estaba apagado por el MISMO switch y era alert-only para
        suscripciones. No era una red: era una promesa.
    Lo que el kill-switch SÍ apaga: el corte (gate) y las mutaciones. Ver §10.3.

 1. RATE LIMIT SUAVE por IP: rateLimitCobrosWebhook(ip) = 300/min. Excedido → 429 (MP reintenta).
    Fail-open sin Redis (rate-limit.ts:8-11): aceptado, la firma es la barrera real.

 2. AUTH (R22 — dos barreras, una obligatoria hoy y la otra cuando X1 la confirme):
      a. webhook_ref: resolver la conexión por coach_payment_connections.webhook_ref (índice único,
         O(1)). Ref desconocido → 404 + log. No revela nada: es opaco.
      a2. TOKEN DERIVADO de la URL: constantTimeEquals(query.token,
          hmacHex(COBROS_WEBHOOK_TOKEN, connection.webhook_ref)). No calza → 401.
          Esta es la barrera **vigente** mientras X1 no cierre.
      b. FIRMA — gobernada por el flag `COBROS_WEBHOOK_REQUIRE_SIGNATURE` (R22; DECISIONS-2 la
         llamó `COBROS_WEBHOOK_SIGNATURE_ENFORCE`: es el MISMO flag, manda el nombre de R22):
           · flag ausente/false (default hasta que X1 confirme): si viene `x-signature`, se verifica
             con verifyMercadoPagoSignature(request, dataId, COBROS_WEBHOOK_SIGNING_SECRET) y una
             firma INVÁLIDA es 401 igual; si NO viene, se procesa y se deja una alerta
             ('cobros.webhook.unsigned') — el token derivado + el re-fetch con el token del coach +
             el chequeo de collector_id son la autoridad mientras tanto.
           · flag true (se sube apenas X1 confirme qué secret firma, nivel C con la primera
             notificación real): la firma pasa a **obligatoria** — ausente o inválida → 401, y sin
             COBROS_WEBHOOK_SIGNING_SECRET en prod → 401.
         DIFERENCIA CON LA RUTA VIEJA: allá «si no hay secret, pasa» es permanente
         (webhook-authorization.ts:57-58); acá es una ventana con fecha de cierre y con un flag que
         la cierra sin deploy. El helper se refactoriza para recibir el secret por parámetro (T-07).
         Firma inválida → 401 SIEMPRE, con flag o sin flag. NUNCA 200: un 200 apaga el reintento
         legítimo si el bug es nuestro (research/s8 §4.2).
      b2. X1 (el experimento que cierra esto): con la PRIMERA notificación real se loguea el
          `x-signature` **crudo** y se verifica contra el secret de la app «EVA Cobros». Confirmado
          ⇒ se sube el flag en prod y se borra esta rama. Es la única forma de saberlo: la doc de MP
          no dice qué secret firma un recurso creado con token OAuth de vendedor.
      c. TIMESTAMP: **NUNCA 401 solo por el `ts`** (corrección F-07). La versión anterior ponía
         |now - ts| > 5 min → 401: una regla nueva, fail-closed, sin contrato de MP detrás — el
         código vivo (webhook-authorization.ts:55-82) ni siquiera valida `ts`. Un skew de reloj, un
         retraso de la cola de MP, un deploy lento o una re-entrega que reuse el `ts` original
         harían que **todos** los reintentos den 401, y con la política «NUNCA 200» cada 401 es un
         cobro real que EVA no ve nunca. Regla: ventana **amplia (24 h)** o directamente log-only
         con alerta en Sentry ('cobros.webhook.stale_ts'). El anti-replay REAL es el insert-first
         con unique (provider, provider_event_id) del paso 4, que no depende del reloj de nadie.

 3. EXTRACCIÓN:
      body = await request.json()   (si no parsea → 400)
      dataId = extractMercadoPagoNotificationId(request, body)   ← reusar tal cual
               (webhook-authorization.ts:19-29; MP manda id en query O en body)
      topic  = body.type ?? url.searchParams.get('topic')
      action = body.action ?? null
      eventId = `${topic}:${dataId}:${action ?? 'na'}`.toLowerCase()
               ← lowercase SIEMPRE: MP minusculiza data.id al firmar (webhook-authorization.ts:71-73)
      Si !dataId o !topic → 200 {"ok":true,"ignored":"no_id"} (no reintentar algo que no entendemos).

 4. INSERT-FIRST CON CICLO DE VIDA (el candado, T-06 — corregido por B-01):
      insert into student_payment_events
        (provider, provider_event_id, event_kind, provider_topic, provider_resource_id,
         payload, occurred_at, status, attempts)
      values ('mercadopago', eventId, kindOf(topic), topic, dataId,
              trimPayload(body), now(), 'received', 0)
      on conflict (provider, provider_event_id) do update
        set attempts = student_payment_events.attempts + 1
      returning id, status, created_at
      REGLA DE REPROCESO (R12), en este orden exacto:
      → status = 'applied'                          → 200 {"ok":true,"deduped":true}. FIN.
      → status = 'failed'                           → SE REPROCESA.
      → status = 'received' y created_at < now()-2min → SE REPROCESA (el intento anterior murió).
      → status = 'received' y created_at ≥ now()-2min → 200 {"ok":true,"inflight":true}: es una
        entrega CONCURRENTE del mismo evento (MP a veces manda el par payment/merchant_order casi
        simultáneo, y nuestros reintentos se pisan). Dos ejecuciones en paralelo del mismo camino no
        rompen nada —la RPC de §8.1 es idempotente— pero gastan dos re-fetch y ensucian las alertas.
        Si el que está en vuelo falla, MP reintenta a los 15 min y ahí ya pasaron los 2 minutos.

      🔴 POR QUÉ NO ALCANZA EL `on conflict do nothing` (el bug que esto corrige): con el insert
      pelado, un 502 transitorio de MP en el paso 6 dejaba la fila escrita y el efecto sin aplicar.
      El reintento de MP trae el MISMO topic:data.id:action, choca con el unique, y sale por
      «200 deduped» **sin procesar nunca el pago**. El alumno pagó, la cuota queda pending y el gate
      lo corta a los 0-3 días — y el reconcile solo rescataba mp_link (§9.2), no suscripciones.
      El dedupe tiene que preguntar «¿ya surtió efecto?», no «¿ya lo vi?».

      El paso a 'applied' ocurre DENTRO de la RPC que confirma el pago (§8.1), no acá: si el pago se
      escribe, el evento queda 'applied' en la misma transacción, y si no, no.
      Igual se invierte el orden del pipeline viejo (check-then-act, webhook-pipeline.ts:108-118),
      que deja una ventana de doble procesamiento bajo reintentos simultáneos de MP.

 5. RESOLUCIÓN DEL DUEÑO — LOCAL PRIMERO (corrección F-08):
      a. Por el **webhook_ref de la URL** (paso 2a): ya tenemos la conexión y su coach. Este es el
         camino normal desde que existe R-01.
      b. Por **dataId contra nuestras propias tablas** (no depende de que MP nos diga nada):
           subscription_preapproval        → student_subscriptions.provider_subscription_id = dataId
           subscription_authorized_payment → student_subscriptions por el preapproval del recurso
           payment con preference_id       → student_billing_charges.provider_preference_id
           payment ya visto                → client_payments.provider_payment_id
      c. Recién entonces body.user_id → coach_payment_connections.provider_account_id
         (índice coach_payment_connections_account_uidx, O(1)).
      d. external_reference: **NO es un camino de resolución** — es un hint que se verifica DESPUÉS
         del re-fetch (paso 7). La versión anterior lo ponía primero y era circular: el recurso
         todavía no se re-fetcheó y el body de MP no trae el ref, así que todo colgaba de
         `body.user_id`, cuyo contenido para recursos creados con token de vendedor **no está
         documentado** (research/s8 lo marca como inferencia). Si trae el id de la aplicación en vez
         del vendedor, TODO evento salía por «sin dueño ⇒ 200 + log» y el riel no hacía nada, en
         silencio y sin alerta.
      Sin dueño resoluble → 200 + **alerta a Sentry** ('cobros.webhook.owner_unresolved'), no un
      console.log: con umbral de 3/hora manda correo a ADMIN_EMAILS. El evento queda 'received' y el
      reconcile lo levanta. Conexión revoked → 200 + log; no se opera con un token muerto.
      **R12 — recurso AJENO o desconocido** (el re-fetch dice que el collector es otro, o el recurso
      no es de ninguna de nuestras tablas): el evento se cierra en **'applied' con nota** en
      `last_error` («recurso ajeno: <motivo>») y se responde **200**. Es la única familia de casos en
      que 'applied' no significa «mutamos algo»: significa «lo miramos, no es nuestro, no lo vuelvas
      a mandar». Dejarlo en 'received' haría que el reconcile lo re-fetcheara para siempre.
      **X13 (experimento nuevo, se cierra gratis en el nivel C)**: capturar el body REAL de un
      webhook de recurso creado con token OAuth de vendedor y documentar qué trae `user_id`.

 6. RE-FETCH CON EL TOKEN DEL COACH (I-5, T-07). Nunca se lee el monto del body.
      payment                        → GET /v1/payments/{dataId}
      subscription_preapproval       → GET /preapproval/{dataId}
      subscription_authorized_payment→ GET /authorized_payments/{dataId}
      mp-connect                     → sin fetch (§5.7)
      Token: decryptToken(connection.access_token_enc, …, 'access').
      401/403 del fetch → marcar conexión 'error', correo C5, y responder 200 (reintentar no ayuda).
      404 → 200 + evento 'applied' con nota (recurso ajeno o borrado, R12).
      5xx/timeout → **evento 'failed' con last_error + 502** (R12): MP reintenta cada 15 min y el
      reconcile lo levanta igual. 'failed' y no 'received' porque este intento SÍ terminó, y mal:
      así el reconcile no tiene que adivinar si hay alguien todavía trabajando en él.

 7. VERIFICACIÓN, ANTES de aplicar nada. Son CUATRO chequeos, no uno:
      a. QUIÉN COBRÓ (T-08):
         resource.collector_id (o resource.preapproval.collector_id) === connection.provider_account_id
         → si no calza: 200 + Sentry warning 'cobros.webhook.collector_mismatch'. NO se aplica.
         El external_reference es un HINT, jamás la autoridad: es un campo que MP copia sin validar.
      b. A QUIÉN: el clientId del external_reference debe pertenecer al coach dueño
         (select 1 from clients where id = clientId and coach_id = connection.coach_id).
      c. EN QUÉ MONEDA Y EN QUÉ ESTADO (corrección R-02):
         resource.currency_id === 'CLP'  y  resource.status === 'approved'
         con status_detail === 'accredited'. Cualquier otra cosa: se registra, no se aplica.
      d. CUÁNTO (corrección R-02 — el chequeo que faltaba y es el más caro):
         resource.transaction_amount >= charge.amount_clp
         Sin esto, un pago 'approved' con el external_reference correcto marcaba la cuota `paid` y
         avanzaba paid_through **un período completo aunque fueran CLP 1**, o una moneda distinta.
         Caminos reales, ninguno hipotético: el coach crea a mano un pago con ese
         external_reference; un pago parcial; un preapproval cuyo transaction_amount se cambió por
         PUT sin que EVA se entere.
         → Si el monto es MENOR: **no se avanza paid_through**. Se registra el client_payments (la
           plata entró y tiene que verse), se deja la cuota como **pago parcial** (`status` sigue
           'claimed'/'pending' con el pago colgado) y sale aviso al COACH para que decida. Es
           coherente con BRIEF §2.4: el coach es 100 % responsable, EVA no arbitra montos.

 8. APLICACIÓN, por topic/action:
      ── payment ────────────────────────────────────────────────────────────
      status 'approved'  → private.cobros_apply_provider_payment({ … , providerEventId: eventId })
                           (§8.3) ← resuelve la cuota (por chargeId del ref en mp_link, POR PERÍODO
                           en mp_subscription — R10), delega en cobros_confirm_charge y deja el
                           evento 'applied' en la MISMA transacción que el pago (B-01).
                           Idempotente por client_payments.provider_payment_id UNIQUE + el greatest.
                           **Pago DUPLICADO (R9)**: si la cuota resuelta ya está `paid` y este
                           provider_payment_id es otro, NO se avanza paid_through dos veces: se
                           inserta un client_payments con `charge_id = null` y `status='duplicate'`
                           y sale **C8** al coach para que lo devuelva desde MP. La plata entró y
                           tiene que verse; el acceso no se regala dos veces.
      status 'refunded' / 'charged_back'   ← R9, UNA sola regla, automática
                         → private.cobros_revert_charge(...) (§8.5): cuota → 'refunded' |
                           'charged_back'; client_payments.status idem; **paid_through RETROCEDE**
                           al period_end de la cuota anterior pagada (o a null si no hay ninguna);
                           el estado derivado se recalcula solo y puede quedar 'unpaid'.
                           Correos: **E11** al alumno («tu pago fue reembolsado/desconocido; tu
                           acceso queda en pausa el X») y **C7** al coach.
                           Esto reemplaza la versión anterior («no se revierte automáticamente, que
                           decida el coach»): con plata devuelta, mantener el acceso es EVA
                           regalando el servicio del coach. El coach sigue siendo 100 % responsable
                           del reembolso ante MP (BRIEF §2.4); lo que EVA no hace es fingir que el
                           período sigue pagado. Está cubierto por I-12: es un retroceso auditado.
      otros status       → solo se registra.

      ── subscription_preapproval ───────────────────────────────────────────
      resource.status 'authorized' → student_subscriptions.status='authorized' + plan.mode confirmado
                                     + correo E6 (confirmación escrita: monto, periodicidad, día de
                                     cobro, cómo cancelar, quién responde — LPC art. 12 A)
      'paused' / 'cancelled'       → status espejo + canceled_by='provider' si no había pedido local
                                     + correo E7. NO corta: el corte lo decide el motor por fecha.
      'pending'                    → solo se registra (todavía no pagó).

      ── subscription_authorized_payment ────────────────────────────────────
      resource.payment.status 'approved'
          → R10: LA CUOTA SE RESUELVE **POR PERÍODO**, nunca por el chargeId del external_reference.
            El ref de un preapproval es `cobro|coachId|clientId|planId` y es INMUTABLE, mientras la
            suscripción vive N cuotas: leer un chargeId de ahí sería cerrar siempre la primera.
            Se busca la cuota del plan cuyo [period_start, period_end] contiene la fecha de cobro
            (date_created del authorized_payment, en día chileno); si no existe, SE CREA.
          → materializar/cerrar esa cuota (§8.3) con providerPaymentId = payment.id
          → re-GET /preapproval/{preapproval_id} para next_payment_date fresco
            (patrón mercadopago.ts:348-353) → student_subscriptions.next_payment_at
          → si el alumno estaba cortado, se reactiva SOLO (derivado). Esto cubre el choque de
            relojes: EVA corta al día 3, MP reintenta hasta el día 10 (research/s8 §3.6).
      rechazada (retry_attempt avanza)
          → last_charge_status + last_retry_attempt; correo E8 (una vez por cuota, ledger)
          → NO se corta por esto: el corte lo decide la fecha, no el rechazo.

      ── mp-connect (application.deauthorized) ──────────────────────────────
      → §5.7 pasos 2-4.

 9. RESPUESTA:
      200 → procesado (evento 'applied'), deduped ('applied' previo), ignorado, o no-nuestro.
      401 → firma inválida (o secret ausente en prod).
      404 → webhook_ref desconocido.
      400 → body ilegible.
      429 → rate limit.
      502 → fallo TRANSITORIO de la API de MP. El evento queda 'received' con attempts+1.
      503 → kill-switch encendido: el evento QUEDA REGISTRADO y MP reintenta (paso 0, LEG-08).
      REGLA DURA: solo se responde 200 cuando el evento está en 'applied' o cuando se decidió, con
      información, que no hay nada que aplicar. Un 200 con el evento en 'received' es un pago
      perdido. Nunca 500 sin capturar: un 500 no controlado hace que MP reintente cada 15 min para
      siempre.
      Presupuesto: responder en < 22 s (research/s8 §4.2). Todo el camino es corto (2 fetches
      máximo); no hay trabajo diferido.
```

### 6.2 `external-reference.ts`

```ts
// apps/web/src/lib/cobros/external-reference.ts
//
// R10 — DOS FORMATOS, uno por modo. Misma forma, último segmento distinto (5 + 3*36 + 3 = 116 chars):
//   preferences  (mp_link)         → cobro|<coachId>|<clientId>|<chargeId>
//   preapprovals (mp_subscription) → cobro|<coachId>|<clientId>|<planId>
// Por qué: una preference es de UNA cuota, pero un preapproval **vive N cuotas** y su ref es
// INMUTABLE. Meter un chargeId ahí hace que todos los cobros del año apunten a la cuota del primer
// mes. Por eso la cuota de un authorized_payment se resuelve POR PERÍODO (§6.1 paso 8), y el ref
// solo sirve para verificar coach + alumno + plan.
// El prefijo literal `cobro` es la barrera de forma contra el billing EVA↔coach, cuyo ref empieza
// con un UUID (buildCheckoutExternalReference, mercadopago.ts:159-169). Colisión imposible.
// PROHIBIDO meter email, nombre o monto: el ref viaja en webhooks y se ve en el panel del coach.

const RE = /^cobro\|([0-9a-f-]{36})\|([0-9a-f-]{36})\|([0-9a-f-]{36})$/i

/** mp_link: el ref apunta a LA CUOTA. */
export function buildChargeExternalReference(coachId: string, clientId: string, chargeId: string) {
  return `cobro|${coachId}|${clientId}|${chargeId}`
}
/** mp_subscription: el ref apunta AL PLAN, y es inmutable por toda la vida del preapproval. */
export function buildPlanExternalReference(coachId: string, clientId: string, planId: string) {
  return `cobro|${coachId}|${clientId}|${planId}`
}

/**
 * El parse devuelve el tercer uuid como `targetId` SIN interpretarlo: quién lo llama sabe qué modo
 * está procesando. Devolverlo como `chargeId` a secas fue el origen del bug de R10 — el nombre del
 * campo invitaba a usarlo como cuota también en suscripciones.
 */
export function parseCobrosExternalReference(raw: string | null | undefined) {
  const m = RE.exec((raw ?? '').trim())
  return m ? { coachId: m[1], clientId: m[2], targetId: m[3] } : null
}
```

**Defensa en profundidad en la ruta VIEJA** (`OUTLINE §0.1`, `maps/r1 §6.1`), en su propia migración
de código, sin cambiar comportamiento:

```ts
// apps/web/src/lib/payments/checkout-external-reference.ts — parseCheckoutExternalReference
if (raw.startsWith('cobro|')) return null          // early-return: no es del billing EVA↔coach
if (!UUID_RE.test(coachId)) return null            // validar el UUID, hoy solo se chequea no-vacío
```

Y en el pipeline viejo: no escribir `subscription_mp_id` sin plan resuelto. Los tests existentes
(`apps/web/src/app/api/payments/webhook/route.test.ts`) deben seguir verdes sin tocarlos.

### 6.3 `trimPayload` — qué se guarda del body

```ts
// Whitelist CERRADA. Todo lo demás se descarta (§12.1, T-16).
function trimPayload(body: any) {
  return {
    type: body?.type ?? null,
    action: body?.action ?? null,
    data_id: body?.data?.id != null ? String(body.data.id).toLowerCase() : null,
    user_id: body?.user_id ?? null,
    live_mode: body?.live_mode ?? null,
    api_version: body?.api_version ?? null,
    date_created: body?.date_created ?? null,
  }
}
```

Y del **recurso re-fetcheado** solo se guarda: `id`, `status`, `status_detail`,
`transaction_amount`, `currency_id`, `collector_id`, `preapproval_id`, `retry_attempt`,
`date_approved`. **Nunca** `payer.email`, `payer.identification`, `payer.first_name`,
`card.cardholder`, `additional_info`.

---

## 7. Checkout del alumno y retorno síncrono como fuente de verdad

Lección de `project_billing_webhook_spof` y del comentario vivo del proyecto: **el camino síncrono es
la fuente de verdad; el webhook es un backstop idempotente**. En MP modo test los webhooks
directamente no llegan (`research/s2 §7.1`), así que sin el camino síncrono el QA es imposible.

### 7.1 `POST /api/cobros/checkout`

```ts
// apps/web/src/app/api/cobros/checkout/route.ts
// Canal del ALUMNO con cookies ⇒ chequeo de origen explícito (patrón exacto de
// apps/web/src/app/api/student/nutrition-v2/route.ts:66-77) + rate limit.
export async function POST(request: Request) {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin')
    return NextResponse.json({ ok: false, error: 'Origen no permitido.' }, { status: 403 })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ ok: false, error: 'Origen no permitido.' }, { status: 403 })

  const { user } = await requireStudentSession()                  // cookies
  const rl = await rateLimitCobrosCheckout(user.id)               // 10/hora
  if (!rl.ok) return jsonRateLimited(rl.retryAfter)

  const plan = await readLivePlanForClient(admin, user.id)        // service-role
  if (!plan || plan.status !== 'active') return NextResponse.json({ ok: false }, { status: 404 })
  const gate = await resolveCobrosAccess(admin, plan.coach_id)
  if (!gate.ok) return NextResponse.json({ ok: false }, { status: 404 })

  // R21 — AVISO PREVIO Y CONSENTIMIENTO, antes de cualquier llamada a MP.
  // · mp_subscription  → aviso COMPLETO (monto, periodicidad, día de cobro, cómo cancelar, quién
  //                      responde, retracto) ⇒ fila kind='subscription'.
  // · mp_link          → aviso CORTO, **solo la primera vez** ⇒ fila kind='first_checkout'.
  // Sin la fila de consentimiento el checkout NO se crea: la evidencia se escribe antes que el
  // cobro, no después. `terms_version` sale de la constante del texto mostrado.
  const consent = await ensureBillingConsent(admin, {
    clientId: user.id, planId: plan.id,
    kind: plan.mode === 'mp_subscription' ? 'subscription' : 'first_checkout',
    accepted: body.acceptedTermsVersion,      // lo manda el cliente tras marcar el checkbox
    ipHash: hashIp(request), userAgent: request.headers.get('user-agent'),
  })
  if (!consent.ok) return NextResponse.json({ ok: false, code: 'COBROS_CONSENT_REQUIRED' }, { status: 428 })

  if (plan.mode === 'mp_link') {
    const charge = await readOpenCharge(admin, plan.id)
    // Link vigente → se devuelve el mismo (T-19: no crear dos preferences para la misma cuota).
    if (charge.checkout_url && charge.checkout_expires_at > new Date())
      return NextResponse.json({ ok: true, url: charge.checkout_url })
    const created = await createChargePreference(admin, gate.connection, charge)  // §7.2
    return NextResponse.json({ ok: true, url: created.initPoint })
  }

  if (plan.mode === 'mp_subscription') {
    const sub = await ensurePreapproval(admin, gate.connection, plan, user.email)  // §7.3
    return NextResponse.json({ ok: true, url: sub.initPoint })
  }

  // manual: no hay checkout. La UI muestra la hoja «Ver cómo pagar».
  return NextResponse.json({ ok: true, url: null, mode: 'manual' })
}
```

Esta ruta **no existe** para la app nativa: no hay equivalente en `/api/mobile/**` y hay un test que lo
verifica (§13.5).

### 7.2 `mp_link` — preference de Checkout Pro con el token del coach

Cuerpo modelado sobre `createOneShotPayment`
(`apps/web/src/lib/payments/providers/mercadopago.ts:566-592`), pero con el token del coach inyectado
y con `X-Idempotency-Key`, que `mpPostJson` hoy **no** setea (`mercadopago.ts:215-228`):

```ts
const body = {
  // R21: el título del ítem sale de `client_billing_plans.description` («Asesoría online mensual»),
  // no de una plantilla nuestra: es lo mismo que el alumno leyó en el aviso previo y en E6.
  items: [{ id: charge.id, title: `${plan.description} — ${coachDisplayName}`,
            quantity: 1, unit_price: charge.amount_clp, currency_id: 'CLP' }],
  payer: { email: studentEmail },
  external_reference: buildChargeExternalReference(coachId, clientId, charge.id), // R10: mp_link ⇒ CUOTA
  // R-01: ref público y opaco POR CONEXIÓN, nunca el secreto global. Esta URL la puede leer el
  // coach desde su panel de MP y con su propio token — asumila pública.
  notification_url: buildCobrosWebhookUrl(connection), // R-01 + R22: /<webhook_ref>?token=<derivado>
  back_urls: {
    success: `${appUrl}/c/${slug}/pagos/retorno?charge=${charge.id}`,
    failure: `${appUrl}/c/${slug}/pagos/retorno?charge=${charge.id}&estado=error`,
    pending: `${appUrl}/c/${slug}/pagos/retorno?charge=${charge.id}&estado=pendiente`,
  },
  auto_return: 'approved',
  expiration_date_to: addDays(new Date(), 30).toISOString(),   // el link caduca (OUTLINE §2.2)
}
// headers: { ...buildCobrosMpHeaders(token), 'X-Idempotency-Key': `cobro:charge:${charge.id}` }
```

El `X-Idempotency-Key` por `charge.id` es lo que impide que un doble click cree dos preferences
(T-19). El resultado (`init_point`, `id`) se guarda en la cuota **en la misma operación**.

### 7.3 `mp_subscription` — preapproval sin plan

Body de `research/s8 §7 paso 3`, con los detalles que ya costaron incidentes en el billing propio:

```ts
const body = {
  reason: `Plan mensual — ${coachDisplayName}`,
  external_reference: buildPlanExternalReference(coachId, clientId, plan.id), // R10: preapproval ⇒ PLAN
  payer_email: studentEmail,
  back_url: `${appUrl}/c/${slug}/pagos/retorno?plan=${plan.id}`,
  notification_url: buildCobrosWebhookUrl(connection), // R-01 + R22: /<webhook_ref>?token=<derivado>
  status: 'pending',
  auto_recurring: {
    frequency: 1, frequency_type: 'months',
    transaction_amount: plan.amount_clp, currency_id: 'CLP',
    // .toISOString() OBLIGATORIO: sin milisegundos MP responde 400 «Invalid format in
    // auto_recurring.start_date» (mercadopago.ts:263-269).
    start_date: startDate.toISOString(),
    end_date: addYears(startDate, 5).toISOString(),           // patrón mercadopago.ts:270
  },
}
// X-Idempotency-Key: `cobro:sub:${plan.id}:v${plan.version}`
```

Guard previo obligatorio: **`payer_email` ≠ email MP del coach**. MP devuelve «You can't pay
yourself» (`research/s8 §11.10`) y el coach de QA lo va a chocar. Se valida antes de llamar y se
explica en la UI.

### 7.4 Retorno `/c/[slug]/pagos/retorno` — el camino síncrono

```
GET /c/<slug>/pagos/retorno?charge=<id>&collection_status=approved&payment_id=<mpId>&…
  1. Se lee `charge` de la URL (nuestro), NUNCA el monto ni el estado que MP pone en la query.
  2. Server action `confirmFromReturn(chargeId, paymentIdFromQuery)`:
       a. carga la cuota + plan + conexión del coach (service-role, guard de pertenencia)
       b. RE-FETCH GET /v1/payments/<paymentIdFromQuery> con el token DEL COACH
       c. verifica collector_id === connection.provider_account_id  (mismo T-08 que el webhook)
       d. verifica external_reference del pago === el de la cuota
       e. si status === 'approved' → private.cobros_apply_provider_payment(...) ← MISMA RPC que el webhook (§8.3)
  3. La página hace poll cada 4 s hasta 60 s (patrón de la pantalla `flow-processing`) por si el
     alumno volvió antes de que MP terminara de acreditar. Estados: aprobado / pendiente / rechazado.
  4. El webhook, cuando llegue, encontrará client_payments.provider_payment_id ya insertado y
     saldrá por el `on conflict do nothing`: BACKSTOP, no duplicado.
```

Por qué el retorno es la fuente de verdad y no el webhook: en preview/test MP no manda webhooks
(`research/s2 §7.1`), y en producción el webhook puede tardar. El alumno que acaba de pagar tiene que
ver su acceso restaurado **en ese mismo click**.

---

## 8. Confirmación manual, claims y comprobantes

### 8.1 `private.cobros_confirm_charge` — idempotente y monotónico

Un solo servicio para las cuatro fuentes (`manual`, `student_claim`, `mp_link`, `mp_subscription`).
**R13**: la función vive en el schema **`private`**, es `security definer`, hace `select … for update`
sobre el plan y **no tiene grant para `authenticated`** (se invoca con service-role). Está en M14
junto con sus tres hermanas (§8.3 aplicar pago de proveedor, §8.4 deshacer, §8.5 revertir).

> **🔴 CORRECCIÓN DB-02 — esto NO puede ser una secuencia de `tx.from()`.** La versión anterior
> envolvía cinco escrituras en `withTransaction(admin, tx => …)`, que **no existe sobre PostgREST**:
> cada `tx.from()` es su propia transacción HTTP y el `for update` de `cobros_lock_plan_by_charge` se
> libera apenas la RPC retorna. El modo de falla es exactamente el peor: si el `insert` en
> `client_payments` pasa y el avance de `paid_through` falla (timeout, 5xx de PostgREST, la lambda
> muere), **el reintento choca con `client_payments_charge_uidx`, devuelve `already_confirmed` y
> corta antes del paso 5**. El alumno pagó, la plata está registrada, `paid_through` nunca avanza y
> queda cortado para siempre — y ningún reintento lo arregla, porque el candado de idempotencia se
> volvió el candado del bug.
>
> Todo va en **UNA función plpgsql `security definer`**, invocada con **un** `rpc()`. Y la rama
> `already_confirmed` **igual ejecuta el `greatest`**: confirmar dos veces tiene que dejar el sistema
> en el estado correcto, no solo «no romper».

```sql
-- M14 · 20260829100500_cobros_rpcs.sql (R13). Schema `private`: sin ruta PostgREST posible.
create or replace function private.cobros_confirm_charge(
  p_charge_id  uuid,
  p_coach_id   uuid,
  p_source     text,
  p_amount_clp integer,
  p_paid_on    date,
  p_provider_payment_id text default null,
  p_client_op_id        text default null,
  p_event_id            text default null,  -- provider_event_id del webhook, para marcarlo applied
  p_periods_covered     smallint default 1  -- R16: prepago de N períodos consecutivos
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_plan   public.client_billing_plans%rowtype;
  v_charge public.student_billing_charges%rowtype;
  v_payment_id uuid;
  v_kind text := 'confirmed';
  v_last_period_end date;   -- R16: fin del ÚLTIMO período cubierto por este pago
begin
  -- 1. CANDADO de fila sobre el plan, DENTRO de la misma transacción que todo lo demás.
  select p.* into v_plan
    from public.client_billing_plans p
    join public.student_billing_charges c on c.billing_plan_id = p.id
   where c.id = p_charge_id
     for update of p;
  if not found then return jsonb_build_object('kind','not_found'); end if;

  -- 2. Guard de pertenencia. IDOR coach → alumno ajeno (T-04).
  if v_plan.coach_id <> p_coach_id then return jsonb_build_object('kind','forbidden'); end if;

  select * into v_charge from public.student_billing_charges where id = p_charge_id;

  -- 2b. R16 — PREPAGO DE N PERÍODOS. El pago cubre esta cuota y las (N-1) consecutivas siguientes
  --     del mismo plan. `v_last_period_end` es el fin del último período cubierto: es lo que
  --     mandará el avance de paid_through (paso 5) y lo que se guarda en client_payments.period_end.
  select max(c.period_end) into v_last_period_end
    from (
      select c2.period_end
        from public.student_billing_charges c2
       where c2.billing_plan_id = v_plan.id
         and c2.period_start >= v_charge.period_start
         and c2.status in ('pending','claimed')
       order by c2.period_start
       limit greatest(coalesce(p_periods_covered, 1), 1)
    ) c;
  v_last_period_end := coalesce(v_last_period_end, v_charge.period_end);

  -- 3. Idempotencia DURA por índice único, no por SELECT previo.
  begin
    insert into public.client_payments (
      client_id, coach_id, billing_plan_id, charge_id, amount, service_description,
      payment_date, status, source, provider_payment_id, period_start, period_end,
      periods_covered, confirmed_by, confirmed_at)
    values (
      v_plan.client_id, v_plan.coach_id, v_plan.id, p_charge_id, p_amount_clp,
      private.cobros_charge_description(v_charge), p_paid_on, 'paid', p_source,
      p_provider_payment_id, v_charge.period_start, v_last_period_end,
      greatest(coalesce(p_periods_covered, 1), 1), p_coach_id, now())
    returning id into v_payment_id;
  exception when unique_violation then
    -- Ya había un pago para esta cuota (o este provider_payment_id). NO se sale: se sigue, para
    -- que el greatest de abajo corrija un avance que quedó a medias en un intento anterior.
    v_kind := 'already_confirmed';
    select id into v_payment_id from public.client_payments where charge_id = p_charge_id;
  end;

  -- 4. Cerrar LAS cuotas cubiertas (idempotente). Con p_periods_covered = 1 es exactamente la de
  --    antes; con N, cierra las N consecutivas y TODAS apuntan al mismo payment_id — por eso R16
  --    saca el unique de student_billing_charges.payment_id.
  update public.student_billing_charges
     set status = 'paid',
         payment_id = coalesce(payment_id, v_payment_id),
         -- R3: la cuota se pagó ⇒ el claim deja de tener sentido y el diferimiento se apaga.
         claim_deferral_until = null
   where billing_plan_id = v_plan.id
     and period_start >= v_charge.period_start
     and period_end   <= v_last_period_end
     and status <> 'paid';

  -- 5. AVANCE. `greatest` en vez de un WHERE condicional: se ejecuta SIEMPRE, también en la rama
  --    already_confirmed, y por definición nunca retrocede la fecha (I-12: acá solo se AVANZA;
  --    los tres retrocesos legítimos viven en §8.4 y §8.5).
  --    R3: se apaga también la copia del diferimiento en el plan.
  update public.client_billing_plans
     set paid_through = greatest(coalesce(paid_through, v_last_period_end), v_last_period_end),
         next_due_on  = private.cobros_next_due_on(v_charge, id),
         claim_deferral_until = null
   where id = v_plan.id;

  -- 6. Bitácora + cierre del ciclo de vida del evento (B-01): el webhook queda 'applied' EN ESTA
  --    MISMA TRANSACCIÓN. Si el commit no ocurre, el evento sigue 'received' y se reintenta.
  insert into public.student_payment_events (
    billing_plan_id, charge_id, client_id, coach_id, provider_event_id, event_kind,
    provider_payment_id, amount_clp, status, applied_at)
  values (
    v_plan.id, p_charge_id, v_plan.client_id, v_plan.coach_id,
    coalesce(p_event_id,
             case when p_provider_payment_id is not null
                  then lower('payment:'||p_provider_payment_id||':confirm')
                  else 'manual:'||coalesce(p_client_op_id, gen_random_uuid()::text) end),
    case when p_source in ('manual','student_claim') then 'manual_confirm' else 'payment' end,
    p_provider_payment_id, p_amount_clp, 'applied', now())
  on conflict (provider, provider_event_id) do update
     set status = 'applied', applied_at = now(), last_error = null;

  return jsonb_build_object('kind', v_kind, 'payment_id', v_payment_id,
                            'paid_through', v_last_period_end);
end;
$fn$;

-- R13: sin grant a authenticated. Solo service-role.
revoke all on function private.cobros_confirm_charge(uuid,uuid,text,integer,date,text,text,text,smallint)
  from public, anon, authenticated;
grant execute on function private.cobros_confirm_charge(uuid,uuid,text,integer,date,text,text,text,smallint)
  to service_role;
```

La cuota siguiente (`ensureNextCharge`, salvo `one_off`) y los correos quedan **fuera** de la RPC: no
son parte del invariante de plata y un fallo suyo no puede revertir un pago confirmado. Los llama el
servicio TS después de que la RPC volvió, y el cron los repara si faltan (§9.1 paso 0).

El TS que queda arriba es delgado y ya no finge transacciones:

```ts
// apps/web/src/services/cobros/confirm-payment.service.ts
export interface ConfirmInput {
  chargeId: string
  coachId: string                    // de la sesión / bearer. JAMÁS del body (AGENTS.md:109)
  source: 'manual' | 'student_claim' | 'mp_link' | 'mp_subscription'
  amountClp: number
  paidOn: string                     // 'YYYY-MM-DD' en Santiago
  providerPaymentId?: string | null
  /** Para la confirmación manual: uuid generado por el CLIENTE en el click (T-06 en el riel B). */
  clientOpId?: string
  /** Del webhook: el provider_event_id que hay que dejar en 'applied' en la MISMA transacción (B-01). */
  providerEventId?: string | null
  /** R16: cuántos períodos consecutivos cierra este pago. Default 1. */
  periodsCovered?: number
}

export async function confirmCharge(admin: Db, input: ConfirmInput): Promise<ConfirmResult> {
  // UNA sola llamada: la atomicidad vive en la RPC, no acá (DB-02/R13). Schema `private`: el cliente
  // de service-role lo alcanza porque el admin de EVA expone `private` en su search_path de RPC.
  const { data, error } = await admin.schema('private').rpc('cobros_confirm_charge', {
    p_charge_id: input.chargeId,
    p_coach_id: input.coachId,
    p_source: input.source,
    p_amount_clp: input.amountClp,
    p_paid_on: input.paidOn,
    p_provider_payment_id: input.providerPaymentId ?? null,
    p_client_op_id: input.clientOpId ?? null,
    p_event_id: input.providerEventId ?? null,
    p_periods_covered: input.periodsCovered ?? 1,
  })
  if (error) throw error                       // → 502 en el webhook: el evento queda 'received'
  const result = data as ConfirmResult

  // Efectos NO transaccionales, después del commit. Si alguno falla, el pago ya está firme y el
  // cron los repara: ninguno puede revertir plata.
  if (result.kind === 'confirmed') {
    await ensureNextCharge(admin, input.chargeId)   // salvo period_kind = 'one_off'
    await sendStudentEmailE5(admin, input.chargeId) // dedupe por client_email_ledger
  }
  return result
}
```

**La reactivación no se programa**: al avanzar `paid_through`, el próximo request del alumno resuelve
`ok` y pasa. Ni cron, ni flag, ni GoTrue.

**`clientOpId`**: el botón «Confirmar pago» genera un `crypto.randomUUID()` **al montarse** (no al
click) y lo manda en el body. Dos taps del mismo botón mandan el mismo uuid ⇒ el segundo choca contra
el índice único de eventos y sale por `already_confirmed`. Es la mitigación que r7 §5.3 pide para el
doble tap en móvil, y funciona incluso si el índice de `client_payments.charge_id` no aplicara (p. ej.
un pago sin cuota).

### 8.2 Claim «ya pagué» — difiere el corte ≤ 5 días, y nada más (**R3**)

**Web y RN llaman al MISMO servicio** (R19). RN entra por una ruta nueva
`POST /api/mobile/student/cobros/claim` (bearer, rate limit, **sin nota ni archivo**: en nativo no hay
adjuntos ni texto libre); la web entra por la server action. Los dos terminan en `claimCharge`.

```ts
// apps/web/src/services/cobros/claim.service.ts — ÚNICO camino (web + RN, R19)
export async function claimCharge(admin: Db, input: {
  clientId: string; chargeId: string; note?: string; receiptPath?: string
}) {
  // Un claim vivo por cuota: el UPDATE condicional es el candado (no un SELECT previo).
  // R3: acá se calcula el DIFERIMIENTO, con tope duro doble.
  const { data } = await admin.schema('private').rpc('cobros_claim_charge', {
    p_charge_id: input.chargeId,
    p_client_id: input.clientId,              // IDOR: la cuota tiene que ser suya
    p_note: (input.note ?? '').slice(0, 280) || null,
    p_receipt_path: input.receiptPath ?? null,
  })
  // La RPC (M14) hace, en una transacción:
  //   1. update student_billing_charges set status='claimed', claimed_at=now(),
  //        claim_deferral_until = least(now() + interval '5 days', <fin de gracia> + interval '5 days')
  //      where id = p_charge_id and client_id = p_client_id and status = 'pending'
  //        and claimed_at is null            ← 0 filas ⇒ no-op idempotente
  //   2. update client_billing_plans set claim_deferral_until = <el mismo valor>   (copia del gate)
  //   3. insert student_payment_events (event_kind='manual_claim')
  if (!data?.claimed) return { ok: true, alreadyClaimed: true }

  await sendCoachEmailC2(data.coach_id, input.chargeId)     // al instante, dedupe por ledger
  await sendPushToCoach(data.coach_id, 'cobros_claim_received')
  return { ok: true, deferredUntil: data.claim_deferral_until }
}
```

Rate limit en las dos superficies: `rateLimitCobrosClaim(clientId)` = **3/día** (T-12).

**Qué hace y qué NO hace el claim (R3)**:

| Efecto | ¿Ocurre? |
|---|---|
| Reactiva el acceso de un alumno ya cortado | **No.** T-12 se mantiene entero: un claim sobre una cuota ya vencida y cortada no devuelve nada. |
| Difiere el corte futuro | **Sí**, hasta `claim_deferral_until` (máx. **5 días** después del fin de la gracia). |
| Suspende E2/E3/E4 al alumno | **Sí**, mientras el claim esté vivo (EMAILS, R3): no se le manda «vas a perder el acceso» a alguien que dice que ya pagó. |
| Avisa al coach | **Sí**: C2 al instante + **recordatorio diario** («Diego avisó hace N días: confirmar o rechazar»), desde `cobros-sweep`. |
| Se puede rechazar | **Sí**: botón «Rechazar» del coach ⇒ `claim_rejected_at = now()`, `claim_deferral_until = null` en cuota **y** plan ⇒ vuelve el calendario normal, incluidos E2/E3/E4. |

**El techo del abuso está acotado y es visible**: forjar claims compra **como máximo 5 días**, una sola
vez por cuota, y el coach lo ve todos los días en su panel y en su correo. Fail-open del rate limit sin
Redis (`apps/web/src/lib/rate-limit.ts:8-11`): aceptado, porque el techo real es el
`status = 'pending' and claimed_at is null` — solo se puede reclamar una cuota abierta y no reclamada,
y hay una por período.

### 8.3 `private.cobros_apply_provider_payment` — el pago de MP, resuelto por período (**R10**)

Envoltorio de §8.1 para el riel automático. Existe porque **elegir la cuota** es la parte delicada y no
puede quedar duplicada entre el webhook y el reconcile:

```sql
create or replace function private.cobros_apply_provider_payment(
  p_plan_id             uuid,
  p_coach_id            uuid,
  p_source              text,       -- 'mp_link' | 'mp_subscription'
  p_amount_clp          integer,
  p_paid_on             date,       -- día chileno del cobro (date_created del recurso)
  p_provider_payment_id text,
  p_event_id            text,
  p_charge_id           uuid default null   -- SOLO mp_link (viene del external_reference)
) returns jsonb
language plpgsql security definer set search_path to ''
as $fn$
declare v_charge public.student_billing_charges%rowtype;
begin
  -- 1. mp_link: la cuota viene en el ref y se verifica que sea de este plan.
  if p_charge_id is not null then
    select * into v_charge from public.student_billing_charges
     where id = p_charge_id and billing_plan_id = p_plan_id;

  -- 2. mp_subscription (R10): POR PERÍODO. El ref trae el planId, no una cuota: la suscripción vive
  --    N cuotas y su ref es inmutable.
  else
    select * into v_charge from public.student_billing_charges
     where billing_plan_id = p_plan_id
       and p_paid_on between period_start and period_end
     order by period_start desc
     limit 1;

    -- 3. Si el período no tiene cuota (MP cobró antes de que el sweep la creara, o el sweep está
    --    caído): SE CREA. Nunca se descarta un cobro real por no tener dónde colgarlo.
    if not found then
      insert into public.student_billing_charges (
        billing_plan_id, client_id, coach_id, period_start, period_end, due_on, amount_clp, mode, status)
      select p.id, p.client_id, p.coach_id,
             private.cobros_period_start_for(p, p_paid_on),
             private.cobros_period_end_for(p, p_paid_on),
             p_paid_on, p.amount_clp, p.mode, 'pending'
        from public.client_billing_plans p
       where p.id = p_plan_id
      on conflict (billing_plan_id, period_start) do nothing
      returning * into v_charge;

      -- La carrera con el sweep la resuelve el unique: si perdió, se lee la que ganó.
      if v_charge.id is null then
        select * into v_charge from public.student_billing_charges
         where billing_plan_id = p_plan_id and p_paid_on between period_start and period_end
         limit 1;
      end if;
    end if;
  end if;

  if v_charge.id is null then return jsonb_build_object('kind','no_charge'); end if;

  -- 4. R9 — PAGO DUPLICADO: la cuota ya está pagada por OTRO provider_payment_id. La plata entró,
  --    tiene que verse, pero paid_through NO avanza dos veces.
  if v_charge.status = 'paid'
     and coalesce(v_charge.payment_id::text,'') <> ''
     and not exists (select 1 from public.client_payments
                      where provider_payment_id = p_provider_payment_id) then
    insert into public.client_payments (
      client_id, coach_id, billing_plan_id, charge_id, amount, service_description,
      payment_date, status, source, provider_payment_id)
    select v_charge.client_id, v_charge.coach_id, v_charge.billing_plan_id,
           null,                                   -- ← charge_id NULL: no cierra ninguna cuota
           p_amount_clp, private.cobros_charge_description(v_charge),
           p_paid_on, 'duplicate', p_source, p_provider_payment_id;
    return jsonb_build_object('kind','duplicate');  -- → correo C8 al coach
  end if;

  -- 5. Camino normal: la misma RPC de §8.1, con el evento del webhook para dejarlo 'applied'.
  return private.cobros_confirm_charge(
    v_charge.id, p_coach_id, p_source, p_amount_clp, p_paid_on,
    p_provider_payment_id, null, p_event_id, 1);
end;
$fn$;
```

### 8.4 `private.cobros_undo_confirmation` — deshacer, el único botón que reemplaza al borrado (**R8**)

`FacturacionTab` **pierde el ícono de borrar en las filas con `charge_id`**. En su lugar hay
**«Deshacer confirmación»**, con estas condiciones, todas verificadas dentro de la RPC:

| Condición | Por qué |
|---|---|
| Solo la **ÚLTIMA** confirmación de esa cuota | Deshacer una intermedia dejaría el historial mintiendo. |
| **≤ 7 días** desde `confirmed_at` | Después de una semana, deshacer es reescribir contabilidad ajena; el camino es reembolso (§8.5). |
| Solo pagos **con `charge_id`** (del motor) | Los legacy sin `charge_id` conservan el borrado de siempre: no hay cuota ni `paid_through` que tocar. |
| **Auditada** | Fila en `student_payment_events` con `event_kind='manual_revert'`, `coach_id` de la sesión. |

Efecto, en una sola transacción: la cuota (o **las N**, si el pago cubría varios períodos — R16) vuelve
a `status='pending'` con `payment_id = null`; el pago queda `status='voided'` con `charge_id = null`
(así el índice único de idempotencia queda libre para una confirmación nueva); y **`paid_through`
retrocede al `period_end` de la cuota anterior pagada** —o a `null` si no hay ninguna—, que es
exactamente «el valor previo» de R8. Es uno de los tres retrocesos legítimos de I-12.

```sql
create or replace function private.cobros_undo_confirmation(
  p_payment_id uuid,
  p_coach_id   uuid
) returns jsonb
language plpgsql security definer set search_path to ''
as $fn$
declare
  v_pay  public.client_payments%rowtype;
  v_plan public.client_billing_plans%rowtype;
  v_prev date;
begin
  -- Candado sobre el plan ANTES de mirar nada (mismo patrón que §8.1).
  select p.* into v_plan
    from public.client_billing_plans p
    join public.client_payments cp on cp.billing_plan_id = p.id
   where cp.id = p_payment_id
     for update of p;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  if v_plan.coach_id <> p_coach_id then return jsonb_build_object('kind','forbidden'); end if;

  select * into v_pay from public.client_payments where id = p_payment_id;
  if v_pay.charge_id is null then return jsonb_build_object('kind','legacy_payment'); end if;
  if v_pay.status <> 'paid' then return jsonb_build_object('kind','not_undoable'); end if;
  if v_pay.confirmed_at < now() - interval '7 days' then
    return jsonb_build_object('kind','too_old');
  end if;
  -- Solo la ÚLTIMA confirmación de esa cuota.
  if exists (select 1 from public.client_payments c2
              where c2.charge_id = v_pay.charge_id and c2.status = 'paid'
                and c2.confirmed_at > v_pay.confirmed_at) then
    return jsonb_build_object('kind','not_last');
  end if;

  -- Reabrir TODAS las cuotas que cerró este pago (R16).
  update public.student_billing_charges
     set status = 'pending', payment_id = null
   where payment_id = p_payment_id;

  update public.client_payments
     set status = 'voided', charge_id = null
   where id = p_payment_id;

  -- RETROCESO AUDITADO (I-12/R8): al period_end de la cuota anterior PAGADA, o null.
  select max(c.period_end) into v_prev
    from public.student_billing_charges c
   where c.billing_plan_id = v_plan.id and c.status = 'paid';

  update public.client_billing_plans
     set paid_through = v_prev,
         next_due_on  = coalesce(v_prev + 1, next_due_on)
   where id = v_plan.id;

  insert into public.student_payment_events (
    billing_plan_id, charge_id, client_id, coach_id, provider_event_id, event_kind,
    status, applied_at, amount_clp)
  values (v_plan.id, v_pay.charge_id, v_plan.client_id, v_plan.coach_id,
          'undo:'||p_payment_id::text, 'manual_revert', 'applied', now(), v_pay.amount::integer);

  return jsonb_build_object('kind','undone','paid_through', v_prev);
end;
$fn$;
```

### 8.5 `private.cobros_revert_charge` — reembolso y contracargo (**R9**)

**Una sola regla para los dos**, disparada por el webhook (§6.1 paso 8) o a mano por soporte:

1. La cuota pasa a `refunded` | `charged_back`; `client_payments.status` **idem** (no `voided`: hubo
   plata y volvió, y eso tiene que quedar escrito distinto de «me equivoqué al confirmar»).
2. **`paid_through` retrocede** al `period_end` de la cuota anterior pagada (o `null`).
3. El estado derivado se recalcula solo y **puede quedar `unpaid`** — que es la verdad.
4. Correos: **E11** al alumno («tu pago fue reembolsado/desconocido; tu acceso queda en pausa el X») y
   **C7** al coach.

```sql
create or replace function private.cobros_revert_charge(
  p_payment_id uuid,
  p_kind       text,      -- 'refunded' | 'charged_back'
  p_event_id   text default null
) returns jsonb
language plpgsql security definer set search_path to ''
as $fn$
declare
  v_pay  public.client_payments%rowtype;
  v_plan public.client_billing_plans%rowtype;
  v_prev date;
begin
  if p_kind not in ('refunded','charged_back') then
    return jsonb_build_object('kind','bad_kind');
  end if;

  select p.* into v_plan
    from public.client_billing_plans p
    join public.client_payments cp on cp.billing_plan_id = p.id
   where cp.id = p_payment_id
     for update of p;
  if not found then return jsonb_build_object('kind','not_found'); end if;

  select * into v_pay from public.client_payments where id = p_payment_id;
  -- Idempotente: si ya está revertido, no se hace nada y NO se manda otro correo.
  if v_pay.status = p_kind then return jsonb_build_object('kind','already_reverted'); end if;

  update public.student_billing_charges set status = p_kind where payment_id = p_payment_id;
  update public.client_payments        set status = p_kind where id = p_payment_id;

  select max(c.period_end) into v_prev
    from public.student_billing_charges c
   where c.billing_plan_id = v_plan.id and c.status = 'paid';

  update public.client_billing_plans
     set paid_through = v_prev
   where id = v_plan.id;

  insert into public.student_payment_events (
    billing_plan_id, charge_id, client_id, coach_id, provider_event_id, event_kind,
    provider_payment_id, amount_clp, status, applied_at)
  values (v_plan.id, v_pay.charge_id, v_plan.client_id, v_plan.coach_id,
          coalesce(p_event_id, p_kind||':'||p_payment_id::text),
          case when p_kind = 'refunded' then 'refund' else 'chargeback' end,
          v_pay.provider_payment_id, v_pay.amount::integer, 'applied', now())
  on conflict (provider, provider_event_id) do update
     set status = 'applied', applied_at = now();

  return jsonb_build_object('kind', p_kind, 'paid_through', v_prev);
end;
$fn$;
```

**Pago duplicado ≠ reembolso** (R9): el duplicado se registra con `charge_id null` y
`status='duplicate'` (§8.3 paso 4), **no** revierte nada y sale **C8** al coach para que lo devuelva
desde MP. `paid_through` nunca avanza dos veces por el mismo período.

### 8.6 Comprobantes

```
1. El alumno (web) pide una URL de subida:
     POST /api/cobros/student/receipt-upload { chargeId }
       → valida sesión + que la cuota sea suya + status='pending'|'claimed'
       → path = `${coachId}/${clientId}/${chargeId}-${Date.now()}.${ext}`
       → createSignedUploadUrl('payment-receipts', path, { expiresIn: 120 })
2. El browser sube directo a Storage. Las policies de M11 igual verifican la carpeta (defensa doble).
3. El alumno manda el claim con `receiptPath`. El servidor verifica que el path empiece con
   `${coachId}/${clientId}/` ANTES de guardarlo (nunca confiar en el path del cliente).
4. El coach ve el comprobante con una signed URL de 60 s generada en el server al abrir la ficha.
   NUNCA se persiste una URL firmada en la DB (caduca y filtra).
5. Límite: 5 MB, `image/jpeg|png|webp` o `application/pdf` (lo impone el bucket, no solo la UI).
```

Gotcha vivo: el WAF de Cloudflare ya rompió uploads (check-in HEIC, logos). El upload usa el mismo
camino y content-type que el de check-ins; si aparece un 403 del WAF, es el mismo incidente conocido.

---

## 9. Crons

Dos crons nuevos en `vercel.json` (hoy hay 14; se suman 2 ⇒ 16, verificar el tope del plan en W0).
Horarios (DECISIONS-2 §PLAN/TASKS): `cobros-sweep` = `45 12 * * *` y `cobros-mp-reconcile` = `15 13 * * *`.
El sweep **corre después de `paid-expiry` (`30 12`)** —para que un coach que pierde Pro esa misma mañana no reciba
correos de cobro— **y antes de `cap-nudge` (`0 13`)**; el reconcile corre después de ambos.

### 9.1 `cobros-sweep` — diario `45 12 * * *` (12:45 UTC, 08:45/09:45 CL)

Estructura obligatoria, copiada del canónico `paid-expiry`
(`apps/web/src/app/api/cron/paid-expiry/route.ts:52-61`): auth `timingSafeEqual` **fail-closed**
(sin `CRON_SECRET` no responde), `?dry=1`, lógica de decisión **pura** en un archivo aparte
(`apps/web/src/lib/cobros/sweep.ts`), fila en `admin_audit_logs` con `action: 'cron.cobros_sweep_ran'`
en el `finally`, correo resumen a `ADMIN_EMAILS` si hubo errores.

```
para cada coach con settings.enabled y resolveCobrosAccess ok y en la allowlist beta:
  para cada plan status='active' del coach:
    EXCLUIR: clients.is_demo · clients.is_archived · clients.is_active=false · org_id/team_id no nulos
    (I-11: EXACTAMENTE las mismas exclusiones que private.student_billing_allowed y que la función
     pura. Si divergen, alguien recibe el corte sin haber recibido un solo correo.)
    SI engine_hold_at is not null (MP desconectado, B-04): se crean cuotas y se manda E1/E2 —el
    coach puede cobrar a mano— pero NUNCA E3 ni E4, porque nadie se va a cortar. Prometer un corte
    que el gate no va a aplicar es peor que no avisar.
    0. si falta la cuota del período vigente → crearla (unique (billing_plan_id, period_start)
       hace que dos corridas simultáneas no dupliquen)
    1. mp_link y due_on - 5 días <= hoy y sin checkout_url vigente:
         crear preference con el token del coach (X-Idempotency-Key: cobro:charge:<id>)
         → correo E1-link (dedupe_key `cobro_link:<charge_id>`)

    R4 — TODOS LOS AVISOS SE DISPARAN POR UMBRAL (<=), NUNCA POR IGUALDAD DE FECHA. El dedupe del
    client_email_ledger es lo que impide el reenvío, no la coincidencia exacta del día. Con `==`,
    un plan creado dentro de la ventana, un cron que no corrió un día, o un cambio de gracia a
    mitad de ciclo hacían que el aviso NO saliera nunca — y el alumno se enteraba del corte el día
    del corte. Con `<=` el sweep del día siguiente lo emite y el ledger garantiza que sea uno solo.

    CALENDARIO CANÓNICO (DECISIONS-2 §EMAILS; F = due_on = paid_through de la cuota):
      gracia 3 ⇒ E2 en F+1 · E3 en F+3 (= F+gracia) · corte y E4 en F+4 (= F+gracia+1)
      gracia 0 ⇒ E2 en F («hoy es el último día») · corte y E4 en F+1 · sin E3
    El corte real es F+gracia+1 (el acceso vale hasta `paid_through + gracia` inclusive), así que E4
    —«tu acceso está en pausa»— sale el MISMO día del corte, nunca un día antes. El off-by-one que
    mandaba E4 en F+gracia queda cerrado por DECISIONS-2.

    2. hoy >= due_on - reminder_days y hoy < due_on y no reminder_opt_out_at
                                                              → E1  (`cobro_recordatorio:<charge_id>`)
    3. gracia = 0 y hoy >= due_on                             → E2  (`cobro_vencido:<charge_id>`)
       gracia > 0 y hoy >= due_on + 1                         → E2  (`cobro_vencido:<charge_id>`)
    4. gracia > 0 y hoy >= due_on + gracia                    → E3  (`cobro_corte_manana:<charge_id>`)
    5. hoy >= due_on + gracia + 1 y cut_notified_at is null   → E4  (`cobro_cortado:<charge_id>`)
                                                                 + set cut_notified_at = now()
    R3 — CLAIM VIVO (claimed_at not null, claim_rejected_at null, claim_deferral_until > now()):
       · E2/E3/E4 al ALUMNO se SUSPENDEN (no se le dice «vas a perder el acceso» a quien avisó que
         ya pagó). No se marca el ledger: cuando el claim se rechace o expire, salen normalmente.
       · Al COACH le llega el recordatorio DIARIO «{Alumno} avisó hace N días: confirmar o
         rechazar» — dedupe_key `cobro_claim_recordatorio:<charge_id>:<yyyy-mm-dd>`, con la fecha
         adentro justamente porque este SÍ es diario.
       · Cuando `claim_deferral_until` pasa sin confirmación ni rechazo: el claim muere solo, el
         calendario vuelve a su curso y E4 sale con el corte real.

    6. mp_link con checkout_expires_at < now() y status='pending' → status='expired'
  digest C1 al coach SOLO si hay cuotas pending/claimed vencidas o por vencer

IDEMPOTENCIA: TODO pasa por client_email_ledger. dedupe_key = `<template>:<charge_id>` (nunca una
key fija: la trampa de coach_email_ledger, 20260822005701:11-13). Ledger ilegible ⇒ ABORTAR SIN
ENVIAR (fail-closed del ledger, patrón cap-nudge/route.ts:42-47: «perder un día de nudges no cuesta
nada; quemar el dominio sí»).

EL CRON NO CORTA A NADIE. Solo notifica y marca cut_notified_at. El corte es derivado (I-2).
```

Fechas: **siempre** `getTodayInSantiago()` (`apps/web/src/lib/date-utils.ts:7`). Comparar
`due_on <= todayIso` como strings ISO. Prohibido `new Date(x.toLocaleString(...))`
(`date-utils.ts:107-110`).

### 9.2 `cobros-mp-reconcile` — diario `15 13 * * *` (13:15 UTC)

```
1. REFRESH de tokens: conexiones active con expires_at < now() + 30 días → refreshConnection()
   (§5.6), como máximo 25 por corrida, `for update skip locked`.
2. RE-CIFRADO de rotación: hasta 20 filas con enc_key_version < CURRENT (§5.5).
3. DRIFT alert-only (patrón mp-reconcile, NUNCA muta el acceso):
     por cada student_subscriptions con status in ('pending','authorized'):
       GET /preapproval/{id} con el token del coach
       remoto ≠ local → registrar evento + alerta a ADMIN_EMAILS. NO se corrige solo.
       404 → status='expired' + aviso al coach (ProviderRequestError distingue 404 de 5xx,
             mercadopago.ts:181-190: un timeout NO puede matar una suscripción viva).
4. Cuotas mp_link con checkout_expires_at vencido → 'expired'.

5. RECUPERACIÓN DE EVENTOS NO APLICADOS (corrección B-01) — los TRES topics, no solo mp_link:
     select … from student_payment_events
      where status <> 'applied' and created_at > now() - interval '30 days'
      order by created_at limit 100
     Por cada uno se re-fetchea el recurso **por el provider_resource_id que ya quedó guardado en el
     insert-first** (no hace falta que MP vuelva a mandar nada) y se corre el MISMO camino del
     webhook desde el paso 6. attempts >= 10 ⇒ status='failed' + alerta a ADMIN_EMAILS.
     Esto es lo que hace que un 502, un 401 de firma, un dueño no resuelto o un apagón no sean un
     pago perdido.

6. RECUPERACIÓN mp_link por búsqueda (R11): cuotas pending de modo mp_link con preference creada
   hace > 1 h → **GET /v1/payments/search?external_reference=cobro|<coachId>|<clientId>|<chargeId>**
   con el token del coach; si hay un approved, aplicarlo por
   `private.cobros_apply_provider_payment` (§8.3) — el mismo camino idempotente del webhook.

7. RECUPERACIÓN DE SUSCRIPCIONES (corrección F-02, fijada por **R11**) — la pata que faltaba y sin
   la cual el riel `mp_subscription` no tiene red **ninguna**:
     por cada student_subscriptions **viva** (status in ('pending','authorized')) — NO solo las que
     tienen una cuota vencida: una cuota que MP cobró y EVA nunca materializó no aparece como
     «vencida», y ese es justamente el agujero:
       **GET /authorized_payments/search?preapproval_id=<id>**   (con el token del coach)
       → materializar TODOS los aprobados que falten, idempotente por `provider_payment_id`
         (client_payments_provider_payment_uidx) y resolviendo la cuota **por período** (R10):
         `private.cobros_apply_provider_payment(planId, …, paidOn = date_created)`.
       fallback si el search no existiera tal cual en MLC:
         GET /v1/payments/search?external_reference=cobro|<coachId>|<clientId>|<planId>  (R10)
   En `mp_subscription` el webhook era el **único** camino que cerraba una cuota: kill-switch, 401 de
   firma, 502, dueño no resuelto o un 500 significaban «MP cobró y EVA corta al alumno», sin
   recuperación posible. Ahora el peor caso es un día de atraso.
   **X14 (experimento del nivel B, obligatorio antes de W5)**: verificar la forma real de
   `/authorized_payments/search` con `preapproval_id` en MLC. Si no existe tal cual, el fallback por
   `external_reference` es el camino y hay que probarlo igual.

7b. **ALERT-ONLY, y solo para el DRIFT DE ESTADO** (R11). Que quede sin ambigüedad, porque la regla
   del repo se venía aplicando de más: este cron **sí escribe plata** en los pasos 5, 6 y 7 —aplicar
   un cobro que MP ya hizo, verificado contra la API con el token del coach, por el camino
   idempotente del webhook, no es «corregir drift»— y **no escribe nada** cuando lo único que ve es
   una diferencia de `status` entre el preapproval remoto y el local (paso 3): eso se registra y se
   alerta, y lo resuelve una persona.

8. SALUD DEL PROPIO CRON: si `cobros-mp-reconcile` falla **dos días seguidos**, alerta a
   ADMIN_EMAILS. Un cron de recuperación caído en silencio es peor que no tenerlo, porque el resto
   del diseño confía en él.
```

«Alert-only» es la regla de money-safety del repo (`paid-expiry.ts`: «en la duda, SIEMPRE
alert-only») y sigue valiendo para el **drift de estado** del paso 3: este cron **nunca corta** ni
cambia el estado remoto por su cuenta. Pero **sí confirma pagos** (pasos 5-7): confirmar un cobro que
MP ya hizo no es «corregir drift», es aplicar un hecho verificado contra la API con el token del
coach, por el mismo camino idempotente del webhook. Lo alert-only era la parte que dejaba pagos
tirados.

**Este cron NO se apaga con `COBROS_KILL_SWITCH`** (corrección LEG-08): tiene su propio flag
`COBROS_INGEST_PAUSED`. El kill-switch existe para dejar de **cortar** gente, no para dejar de
**enterarse** de que pagaron — apagar las dos cosas juntas era garantizar que el apagón terminara en
pagos perdidos. Va escrito así en el runbook.


---

## 10. Flags y kill-switches

### 10.1 Inventario

| Nombre | Tipo | Semántica | Se cambia sin deploy |
|---|---|---|---|
| `COBROS_ENABLED` | env **server-only** | `=== 'true'` enciende. Cualquier otro valor o ausencia ⇒ apagado (**fail-closed del feature**). Server-only a propósito: `NEXT_PUBLIC_*` marcado «Sensitive» en Vercel llega `undefined` al cliente y produce un *false fantasma* (gotcha documentado en `apps/web/src/lib/constants.ts:161-167`). | no (redeploy) |
| `COBROS_GA` | env server-only | `=== 'true'` ⇒ abierto a todos los Pro. Falso ⇒ solo la allowlist beta. | no |
| `COBROS_KILL_SWITCH` | **Edge Config** | `true` apaga **el corte y las mutaciones**: gate (proxy + `/api/mobile/config`), `cobros-sweep`, y la aplicación de efectos en el webhook. **NO apaga la recepción**: el webhook igual registra el evento y responde 503 para que MP reintente (LEG-08). **NO cancela suscripciones** (R5): es temporal y cancelar es irreversible. Ausente/error ⇒ **encendido el módulo** (fail-open del kill-switch: solo el `true` explícito apaga). | **sí** |
| `platform_flags.cobros_gate` | **fila en la DB** (M12) | **R14.** El mismo apagón, pero del lado que Edge Config no alcanza: `private.cobros_gate_enabled()` lo lee y, en `false`, `private.student_billing_allowed` devuelve `true` para todos. Fila ausente ⇒ encendido. Se apaga junto con el kill-switch, **en el mismo click** (ver abajo). | **sí** |
| `COBROS_WEBHOOK_REQUIRE_SIGNATURE` | env server-only | **R22.** `=== 'true'` ⇒ la firma HMAC del webhook es **obligatoria** (ausente o inválida → 401). Default (ausente/false) ⇒ se verifica si viene y una firma inválida sigue siendo 401, pero la barrera vigente es el `?token=` derivado + el re-fetch. Se sube a `true` en prod apenas X1 confirme qué secret firma. *(DECISIONS-2 lo llamó `COBROS_WEBHOOK_SIGNATURE_ENFORCE`: mismo flag, manda el nombre de R22.)* | no (redeploy) |
| `COBROS_INGEST_PAUSED` | **Edge Config** | Flag **propio** de `cobros-mp-reconcile` (LEG-08). El kill-switch NO lo toca: apagar el corte y apagar la recuperación de pagos son dos decisiones distintas, y juntarlas garantizaba que todo apagón terminara en pagos perdidos. Solo se enciende si el propio reconcile está haciendo daño. | **sí** |
| `COBROS_BETA_COACH_IDS` | Edge Config (array) | Allowlist de la beta cerrada (D-D). Vacío + `COBROS_GA=true` ⇒ todos los Pro. Error de lectura ⇒ **lista vacía** (fail-closed: en la duda, nadie entra). | **sí** |
| `EVA_COBROS_EMAILS_DISABLED` | env CSV | `*` o `1` apaga todos los correos del motor; si no, lista de `template_key`. Espejo de `EVA_SALES_EMAILS_DISABLED` (`apps/web/src/services/billing/sales-emails.service.ts:50-55`), **switch propio** porque aquel tiene un union cerrado de 3 eventos (`:37`). | no |
| `EVA_PUSH_DISABLED_EVENTS` | env CSV (existente) | Ya cubre las push nuevas vía `isPushEventEnabled` (`apps/web/src/lib/push.ts:38-40`). | no |
| `CRON_SECRET` | env (existente) | Auth de los dos crons, `timingSafeEqual`, fail-closed. | no |

Secretos nuevos (valores nunca en el repo ni en el SDD): `COBROS_MP_CLIENT_ID`,
`COBROS_MP_CLIENT_SECRET`, `COBROS_MP_REDIRECT_URI`,
`COBROS_WEBHOOK_TOKEN` (**clave madre** del token derivado que sí viaja en la URL como `?token=`,
R-01 + R22: `HMAC(COBROS_WEBHOOK_TOKEN, webhook_ref)`. La clave madre nunca sale del servidor),
`COBROS_WEBHOOK_SIGNING_SECRET`, `COBROS_OAUTH_ENC_KEY_V1`, `COBROS_OAUTH_ENC_KEY_CURRENT`.
Todos **Sensitive** en Vercel, todos distintos de los del billing EVA↔coach (I-7, T-21).

**El kill-switch es UN endpoint, no dos palancas** (R14). `POST /api/admin/cobros/kill-switch
{ on: true }` escribe **Edge Config (`COBROS_KILL_SWITCH`) y la fila `platform_flags.cobros_gate`**
en la misma llamada, y responde con el estado de las dos. Si una de las dos falla, responde 500 con
cuál quedó a medias — nunca «ok» parcial. El runbook documenta **las dos** y el comando manual de
emergencia para cada una, porque en un incidente nadie se acuerda de que existe la segunda:

```sql
-- Emergencia, si el endpoint no responde: apagar el gate DB a mano.
update public.platform_flags set enabled = false, updated_at = now() where key = 'cobros_gate';
```

### 10.2 Lectores (patrón `student-access.server.ts`)

```ts
// apps/web/src/lib/cobros/flags.server.ts
import 'server-only'

const KILL_KEY = 'COBROS_KILL_SWITCH'
const BETA_KEY = 'COBROS_BETA_COACH_IDS'

/**
 * Kill-switch del MÓDULO. Forma canónica copiada de student-access.server.ts:25-34, pero con la
 * polaridad invertida: allí `raw !== false` mantiene el GATE activo (fail-closed del gate); acá
 * `raw === true` APAGA el módulo, y cualquier fallo lo deja encendido. Motivo: un Edge Config caído
 * no puede apagarle el cobro a los coaches que ya lo usan.
 */
export async function isCobrosKillSwitchOn(): Promise<boolean> {
  if (!process.env.EDGE_CONFIG) return false
  try {
    const { get } = await import('@vercel/edge-config')
    return (await get<unknown>(KILL_KEY)) === true
  } catch {
    return false
  }
}

/**
 * Allowlist de la beta. FAIL-CLOSED al revés que el kill-switch: si Edge Config falla, nadie entra
 * a la beta (y con COBROS_GA=true, el gate de tier ya alcanza).
 */
export async function isCoachInCobrosBeta(coachId: string): Promise<boolean> {
  if (process.env.COBROS_GA === 'true') return true
  if (!process.env.EDGE_CONFIG) return false
  try {
    const { get } = await import('@vercel/edge-config')
    const raw = await get<unknown>(BETA_KEY)
    return Array.isArray(raw) && raw.includes(coachId)
  } catch {
    return false
  }
}
```

Cacheo por isolate en el proxy (patrón `apps/web/src/proxy.ts:357-375`, `proxyClaimsFlagCache` con
TTL) para no pagar un round-trip de Edge Config por request del árbol `/c`.

### 10.3 Qué apaga cada cosa (tabla operativa para el runbook)

| Situación | Palanca | Efecto inmediato |
|---|---|---|
| El gate corta a alguien que pagó | endpoint admin del kill-switch (**apaga Edge Config + `platform_flags.cobros_gate`**, R14) | Proxy y `/api/mobile/config` devuelven `off`; `cobros-sweep` sale temprano; el webhook **sigue recibiendo y registrando** (`status='received'`) y responde **503** para que MP reintente — nunca 200, que sería descartar el pago (LEG-08). `cobros-mp-reconcile` **sigue corriendo** y aplica lo pendiente. **Y el gate DB también se apaga**, porque `private.student_billing_allowed` lee `private.cobros_gate_enabled()`: ya no hace falta re-aplicar el rollback de M16 a mano de madrugada (era la trampa que R14 vino a cerrar). **No cancela ninguna suscripción** (R5). |
| Un coach de la beta hace desastre | sacarlo de `COBROS_BETA_COACH_IDS` | Pierde el acceso al módulo; sus planes y datos quedan intactos; el gate de sus alumnos pasa a `off` (fail-open) porque `resolveCobrosAccess` falla. **Si tiene suscripciones vivas**, `/c/<slug>/pagos` en modo mínimo y la cancelación siguen funcionando (§4.5): MP le sigue cobrando al alumno pase lo que pase con la beta. |
| Se está quemando el dominio de correo | `EVA_COBROS_EMAILS_DISABLED = *` | El cron sigue corriendo (crea cuotas, expira links) pero no manda nada. **Ojo**: E5 «pago confirmado» es la única constancia del pago que recibe el alumno (§6.4); apagarlo indiscriminadamente deja cobros sin comprobante. Preferir la lista por `template_key`. |
| MP caído / firma rota | `COBROS_KILL_SWITCH = true` | El webhook deja de **aplicar** pero sigue registrando; `cobros-mp-reconcile` (que **no** se apaga con este switch) aplica lo acumulado, incluidas las suscripciones, en la corrida siguiente. |
| El propio reconcile está haciendo daño | `COBROS_INGEST_PAUSED = true` | Único caso en que se detiene la recuperación. Es una palanca aparte a propósito: apagarla es aceptar perder pagos, y esa decisión no puede caer de rebote de otra. |
| Rollback total | revertir el deploy + rollback de M16 | Las tablas quedan (aditivas, sin lectores) y no molestan a nadie. |

**Advertencia que va en el runbook, en negrita**: desde R14 el kill-switch **sí** apaga el gate de la
base, pero **solo si se usa el endpoint admin** — apagar Edge Config a mano por el panel de Vercel deja
la RLS cortando igual. La asimetría vieja está documentada para `STUDENT_ACCESS_GATE`
(`apps/web/src/lib/student-access.server.ts:20-23`); acá se cerró a propósito, y el precio es que hay
**una** puerta correcta y varias incorrectas. Segunda advertencia: **el kill-switch no cancela
suscripciones** (R5) — si lo que hay que detener es el cobro y no el corte, la palanca es
`cancelSubscriptionsForCoach` (§5.8), no esta.

---

## 11. Threat model final — T-01…T-22

Los T-01…T-18 vienen de `maps/r7-db-seguridad.md §6`; T-19…T-22 del `OUTLINE §10`.

| # | Amenaza | Vector concreto | Mitigación (dónde vive) | Dónde se prueba |
|---|---|---|---|---|
| **T-01** | El alumno se auto-marca como pagado | `PATCH /rest/v1/client_billing_plans?client_id=eq.<self>` con la anon key + su JWT | Cero `GRANT INSERT/UPDATE/DELETE` a `authenticated` en las 10 tablas nuevas (M1-M7, M10, M12, M13). Solo `SELECT`, y por columna donde importa. | `supabase/tests/cobros_grants.sql` |
| **T-02** | El alumno reescribe la fecha en `clients` | Hoy puede: `subscription_start_date` está en el allowlist de 17 columnas con `GRANT UPDATE` (verificado en LIVE, `20260612140001:36-55`) + `clients_self_update` | «Pagado hasta» **no vive en `clients`** (M2). `clients` no recibe ni una columna nueva. `subscription_start_date` queda como dato cosmético que el motor ignora. | `cobros_isolation.sql` (el alumno no puede mover `paid_through`) |
| **T-03** | El alumno lee el billing de su coach | `coaches_select_authenticated` + `SELECT` de 69 columnas para `authenticated` (LIVE) | Deuda pre-existente, **fuera de este tren**. Lo que sí hace el tren: cero tokens y cero ids de cobro en `coaches` (I-4). El censo de las 12 columnas a revocar queda como tarea aparte (G21 de z-completitud). | — (deuda declarada) |
| **T-04** | IDOR coach → alumno ajeno | POST a una ruta nueva con el `clientId` de otro coach | `assertCoachCanManageClient` (`apps/web/src/services/client/client.service.ts:27-45`) + re-chequeo en la ruta móvil (`api/mobile/coach/payments/route.ts:64-77`) + `coach_id` **siempre** de la sesión, nunca del body (`AGENTS.md:109`) + policies de M2-M5. | `cobros_isolation.sql` + vitest de cada ruta |
| **T-05** | Coach de una org toca alumnos no asignados | Coach enterprise con sesión válida | Rama org de las policies con `public.is_org_admin_member(c.org_id)` (`20260525180500:44-68`). Módulo standalone: los planes de alumnos con `org_id` no se crean. | `cobros_isolation.sql` |
| **T-06** | Replay de webhook ⇒ doble mes de acceso | MP reintenta la misma notificación cada 15 min hasta recibir 200 | `unique (provider, provider_event_id)` + insert-first **antes** de mutar (§6.1 paso 4) + lowercase del id + `client_payments_provider_payment_uidx` + el `greatest` del avance (§8.1), que hace inofensiva cualquier reaplicación. **El dedupe corta por `status='applied'`, no por la mera existencia de la fila** (B-01): así el anti-replay no se convierte en un tragadero de pagos. | `webhook/route.test.ts` (redelivery + reintento tras 502) |
| **T-07** | Webhook forjado | La URL es pública; cualquiera puede POSTear «pagó» | **Token siempre obligatorio** (`?token=` derivado por conexión: ausente o inválido → 401, sin excepción). La **firma HMAC se verifica si viene** —una firma presente e inválida es 401, a diferencia de la ruta vieja, que pasa si falta el signing secret: `webhook-authorization.ts:57-58`— y **se exige (ausencia = 401) solo con `COBROS_WEBHOOK_REQUIRE_SIGNATURE=true`**, que se sube en prod cuando X1 confirme qué secret firma (R22). Más `webhook_ref` opaco por conexión en la URL (R-01: el secreto global **no** viaja dentro de las cuentas MP de N coaches). El `ts` **no** produce 401 por sí solo (F-07): ventana amplia y alerta. Y sobre todo: re-fetch del recurso con el token del coach (I-5) + verificación de monto, moneda y estado (R-02) — el body nunca decide. | `webhook/route.test.ts` (401 sin token, 401 con firma de otro secret, 401 sin firma **solo con el flag en true**, 200 sin firma con el flag ausente, 404 con ref desconocido) |
| **T-07b** | Cobro de CLP 1 que compra un mes | Un `payment` `approved` con el `external_reference` correcto pero monto irrisorio, moneda distinta, o parcial | §6.1 paso 7c/7d: `currency_id === 'CLP'`, `status_detail === 'accredited'` y `transaction_amount >= charge.amount_clp`. Si es menor: se registra el pago, **no** se avanza `paid_through`, se marca parcial y decide el coach. | `webhook/route.test.ts` («CLP 1 sobre cuota de 35.000 ⇒ paid_through no avanza») |
| **T-08** | Webhook cruzado entre coaches | Un evento del coach A aplicado a un alumno del coach B | `collector_id` del recurso re-fetcheado === `connection.provider_account_id`; además el `clientId` del `external_reference` debe pertenecer a ese coach. El ref es un **hint**, no autoridad (§6.1 paso 7). | `webhook/route.test.ts` (collector mismatch ⇒ no muta) |
| **T-09** | Robo de tokens desde un dump/backup | `pg_dump`, snapshot, log de query | AES-256-GCM a nivel app con clave en env de Vercel (§5.4): el dump no alcanza. `enc_key_version` para rotar. Nunca se loguea el ciphertext ni el plano. | `token-crypto.test.ts` |
| **T-10** | Exfiltración de tokens por PostgREST | `GET /rest/v1/coach_payment_connections` con la anon key | `revoke all from anon, authenticated` + RLS **sin policies** (deny-all doble) + `do $$ … raise exception` en la propia migración (M6). | `cobros_grants.sql` |
| **T-11** | Token del coach A usado sobre el coach B | Bug: el adapter cae al token global del env (`mercadopago.ts:176`, `getMpAccessToken()`) | `apps/web/src/lib/cobros/mp-client.ts` **exige** un objeto `connection` en la firma y no tiene fallback a env. Test que falla si el string `getMpAccessToken` o `MERCADOPAGO_ACCESS_TOKEN` aparece en `apps/web/src/lib/cobros/**` o `services/cobros/**`. | `cobros-no-global-token.test.ts` (T-22 lo formaliza) |
| **T-12** | Forja del «ya pagué» | El alumno spamea claims para simular pagos | El claim **no cambia el acceso**: solo `status='claimed'` + correo. `rateLimitCobrosClaim` 3/día. Un claim vivo por cuota (el `UPDATE … where status='pending'` es el candado). Chequeo `sec-fetch-site`/`origin`. | `claim.actions.test.ts` |
| **T-13** | CSRF sobre acciones de plata del coach | Página maliciosa hace POST con las cookies del coach | Server actions (chequeo de origen nativo de Next 16) y, en rutas API, el bloque `sec-fetch-site` + `origin` (`api/student/nutrition-v2/route.ts:66-77`). **Nunca** confirmar un pago por `GET`. | vitest de ruta (403 con `sec-fetch-site: cross-site`) |
| **T-14** | Robo del `code` / CSRF en el callback OAuth | Un atacante hace que el coach complete un OAuth que conecta la **cuenta MP del atacante** ⇒ los cobros de los alumnos van a otro bolsillo. **La amenaza más grave del feature.** | Cookie `httpOnly` `SameSite=Lax` firmada HMAC con `state` de 32 bytes + `verifier` + `coachId` + `exp` 10 min, borrada al leerse; comparación timing-safe; **re-verificación de la sesión del coach en el callback** (`cookie.coachId === session.user.id`); PKCE S256; `redirect_uri` estática; rate limit; evento en `coach_payment_connection_events` con IP y UA. | `oauth-callback.test.ts` (state ajeno ⇒ 401; coachId ≠ sesión ⇒ 401; cookie expirada ⇒ 401) |
| **T-15** | Corte injusto (falso negativo) | Bug de fechas/TZ corta a quien pagó | Motor **fail-open** en las 6 ramas (§3.2); `clampGrace` corrupto ⇒ 14 días; TZ con `Intl.formatToParts` y no `toLocaleString` (`date-utils.ts:107-110`); kill-switch; el cron **notifica antes de que el gate corte** (E3 el día previo, E4 el día del corte). | `state.test.ts` (B-01…B-18) |
| **T-16** | Fuga de PII del pagador | Payload de webhook con email/RUT/teléfono guardado y luego leído por el coach o por logs | `trimPayload` whitelist cerrada (§6.3); `payload` fuera del grant; logs solo `{topic, dataId, action}`; retención 180 días en `purge-data` (§12.2). | `webhook/route.test.ts` (el payload guardado no contiene `payer`) |
| **T-16b** | Secuestro de cuenta MP entre coaches | El coach B conecta la misma cuenta MP que ya usa el coach A | `coach_payment_connections_account_uidx` parcial + chequeo explícito en el callback ⇒ 409. | `oauth-callback.test.ts` |
| **T-17** | Escalada por policy nueva mal compuesta | Alguien agrega una policy `FOR ALL` a una tabla con `GRANT ALL` heredado (caso vivo: `subscription_events`, `INSERT` concedido a `authenticated` en LIVE) | Las 10 tablas nuevas nacen con `revoke all`. Test de regresión: **ninguna tabla de cobros tiene privilegios de escritura para anon/authenticated**, y corre en CI de DB. | `cobros_grants.sql` |
| **T-18** | Enumeración de coaches/alumnos por los endpoints nuevos | `/api/cobros/clients/<id>/plan` respondiendo 404 vs 403 | Respuesta uniforme 404 «Alumno no encontrado» (patrón `api/mobile/coach/payments/route.ts:74-76`) + rate limit + los 5 códigos de `resolveCobrosAccess` mapeados a 404 en superficies del alumno. | vitest de ruta |
| **T-19** | Doble envío de link/preference | Doble click del coach, o dos corridas del cron | `X-Idempotency-Key: cobro:charge:<chargeId>` en el POST a MP + la cuota guarda `provider_preference_id`: si ya hay uno vigente, se reusa, no se crea. Unique `(billing_plan_id, period_start)`. | `charges.service.test.ts` |
| **T-20** | `checkout_url` filtrado a la app nativa | Alguien agrega el campo a `/api/mobile/config` «porque estaba a mano» | `checkout_url` fuera del `grant select` de `authenticated` (M3); se sirve solo por `/api/cobros/checkout` (web). **Test que escanea las respuestas de todas las rutas `/api/mobile/**` buscando `init_point`, `checkout_url`, `mpago`, `mercadopago.c`**. | `tests/mobile/cobros-no-checkout-url.test.ts` |
| **T-21** | Secret compartido con el billing EVA | Reusar `MERCADOPAGO_WEBHOOK_SIGNING_SECRET` en la ruta nueva «porque ya está» | Segunda app MP con secretos propios (I-7). Test que falla si `MERCADOPAGO_` aparece en `apps/web/src/lib/cobros/**`, `services/cobros/**` o `app/api/cobros/**`. | `cobros-env-isolation.test.ts` |
| **T-22** | Token del coach usado fuera del riel C | Un helper del riel nuevo importa el adapter viejo y termina operando con el token de EVA sobre la cuenta de un coach (o al revés) | `mp-client.ts` recibe `connection` obligatorio; test estático que falla si `getMpAccessToken`, `MERCADOPAGO_ACCESS_TOKEN` o `@/lib/payments/providers/mercadopago` aparecen importados desde el árbol de cobros (salvo los helpers puros explícitamente permitidos: `ProviderRequestError`, `extractMercadoPagoNotificationId`, `constantTimeEquals`). | `cobros-no-global-token.test.ts` |

---

## 12. PII, retención, logs y Sentry

### 12.1 Qué se guarda y qué no

| Dato | ¿Se guarda? | Dónde / por qué |
|---|---|---|
| `payer_email` del alumno | **No** en las tablas del motor | Viaja a MP porque el `preapproval` lo exige, pero no se persiste en `student_payment_events` ni en `client_email_ledger`. El correo del alumno ya vive en `clients.email`; duplicarlo en tablas de plata es superficie gratis. |
| Nombre / RUT / teléfono del pagador | **No, nunca** | `trimPayload` es una whitelist cerrada (§6.3). Ley 19.628 / 21.719. |
| `provider_payment_id`, `preapproval_id` | Sí | Son la clave de idempotencia y de reconciliación. Fuera del grant de `authenticated` donde no aportan (M4, M5). |
| Monto | Sí (`amount_clp`) | Es el objeto del negocio. **Nunca** en `client_email_ledger.payload` ni en eventos de PostHog. |
| Tokens OAuth | Sí, **cifrados** | §5.4. Nunca en claro, nunca en logs, nunca a Sentry. |
| IP / User-Agent | En `coach_payment_connection_events` (IP en claro) y en `student_billing_consents` (**IP hasheada**, R21) | Callback: investigar un secuestro (T-14), retención 180 días. Consentimientos: probar quién aceptó, retención **24 meses**, y con `ip_hash` en vez de la IP porque la evidencia solo necesita comparar, no identificar. |
| Consentimiento del alumno (`student_billing_consents`) | Sí: `kind`, `terms_version`, `consented_at`, `ip_hash`, `user_agent` | **R21**. Es la defensa del coach y de EVA ante un contracargo o un reclamo. **Excluida de `purge-data`** (§12.2). |
| Comprobante de transferencia | Sí, en Storage privado | Puede contener el nombre y la cuenta del alumno: bucket privado, signed URLs de 60 s, sin URL persistida. |
| Eventos PostHog | Sin montos ni `client_id` | `OUTLINE §8`. `distinctId` = `coach_id`, como todo el server-capture del repo (`apps/web/src/lib/posthog/server-capture.ts`, doc inline `:3-27`). |

### 12.2 Retención — se suma a `purge-data`

`apps/web/src/app/api/cron/purge-data/route.ts` (domingos 03:00 UTC, `vercel.json:38`) suma tres
bloques con la misma forma que los dos que ya tiene (`:30-56`):

```ts
// ── Payload de eventos de cobro: se recorta a los 180 días ────────────────────
// La FILA se conserva (es el candado de idempotencia y la traza contable del coach); lo que se
// borra es el payload, que es lo único con contexto del pagador.
{
  const cutoff = new Date(Date.now() - 180 * 86400_000).toISOString()
  const { count } = await admin.from('student_payment_events')
    .update({ payload: null }).lt('created_at', cutoff).not('payload', 'is', null)
    .select('id', { count: 'exact', head: true })
  purged += count ?? 0
}

// ── IP/UA de la bitácora OAuth: 180 días ──────────────────────────────────────
await admin.from('coach_payment_connection_events')
  .update({ ip_address: null, user_agent: null })
  .lt('created_at', new Date(Date.now() - 180 * 86400_000).toISOString())

// ── Ledger de correos al alumno: filas de más de 365 días ─────────────────────
await admin.from('client_email_ledger').delete()
  .lt('created_at', new Date(Date.now() - 365 * 86400_000).toISOString())
```

**`student_billing_consents` NO entra en `purge-data`** (R21). Retención **24 meses**, y la purga es
**manual y auditada**, no un `delete` en un cron dominguero. El número no es arbitrario: el plazo de
contracargo de las tarjetas llega a **6 meses** y un reclamo de consumidor puede tardar bastante más;
borrar la evidencia antes deja al coach —y a EVA— sin nada que mostrar justo cuando hace falta. El
censo de lo que pasa los 24 meses sale por el índice `student_billing_consents_created_idx` y se
revisa a mano. Guard: un test estático que falle si `purge-data/route.ts` menciona
`student_billing_consents`. **Exportación**: CSV desde admin (`kind`, `terms_version`,
`consented_at`, `client_id`, `plan_id`; **nunca** `ip_hash` ni `user_agent`, que son para la
investigación interna, no para un correo).

**Decisión del writer (D-W10)**: los comprobantes del bucket `payment-receipts` **no** se purgan
automáticamente. Son la evidencia de un pago entre dos personas y borrarlos a espaldas del coach puede
dejarlo sin defensa en una disputa. Se borran cuando se borra el alumno (cascade lógico a implementar
en el flujo de baja de cuenta) o cuando el coach lo pide. Va a la spec como decisión explícita.

### 12.3 Logs

```ts
// Forma canónica de log del webhook (patrón webhook-pipeline.ts:120-133, que ya redacta).
console.info('[cobros.webhook]', {
  topic, action, dataId,          // ids del gateway: no son PII
  coachId,                        // uuid interno
  outcome,                        // 'processed' | 'deduped' | 'ignored' | 'mismatch' | 'transient'
})
// PROHIBIDO en cualquier console.*: access_token, refresh_token, ciphertext, init_point,
// checkout_url, payer_email, el body crudo del webhook, el claim_note del alumno,
// y la URL del webhook completa (lleva el webhook_ref de la conexión — R-01).
```

Regla dura: `init_point` y `checkout_url` **no se loguean** — un log con la URL de checkout es una URL
de pago en un sistema de terceros (Vercel logs, Sentry, Slack de alertas). Lo mismo vale para
`notification_url` / la URL del webhook: el `webhook_ref` no autoriza nada por sí solo, pero
identifica al coach y no tiene por qué andar dando vueltas.

### 12.4 Sentry scrubbing

`apps/web/sentry.server.config.ts` (hoy 8 líneas: `dsn`, `environment`, `tracesSampleRate: 0.1`,
`ignoreErrors`) gana un `beforeSend`:

```ts
// apps/web/sentry.server.config.ts
const SECRET_KEYS = /^(access_token|refresh_token|.*_token_enc|code_verifier|client_secret|init_point|checkout_url|notification_url|webhook_ref|payer_email|x-signature)$/i

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? 'development',
    tracesSampleRate: 0.1,
    ignoreErrors: ['ResizeObserver loop limit exceeded'],
    beforeSend(event) {
        // 1. Query strings: el ?token= del webhook y el ?code=/&state= del callback OAuth.
        if (event.request?.query_string) event.request.query_string = '[scrubbed]'
        if (event.request?.url) event.request.url = event.request.url.replace(/([?&])(token|code|state)=[^&]*/gi, '$1$2=[scrubbed]')
        // 2. Headers.
        if (event.request?.headers) {
            for (const h of ['x-signature', 'x-webhook-token', 'authorization', 'cookie']) {
                if (event.request.headers[h]) event.request.headers[h] = '[scrubbed]'
            }
        }
        // 3. extra/contexts con claves sensibles.
        const scrub = (o: any) => {
            if (!o || typeof o !== 'object') return
            for (const k of Object.keys(o)) {
                if (SECRET_KEYS.test(k)) o[k] = '[scrubbed]'
                else scrub(o[k])
            }
        }
        scrub(event.extra); scrub(event.contexts)
        return event
    },
})
```

Además, `MpOauthError` y `ProviderRequestError` del riel de cobros serializan **solo** el código y el
`x-request-id`, nunca el cuerpo de la respuesta de MP (que puede traer el token en un error de
`/oauth/token`). El adapter viejo ya tiene esa disciplina (`mercadopago.ts:186-190`).

---

## 13. Tests de seguridad exigidos

Sin estos, el tren no sale. Los SQL se corren a mano contra LIVE dentro de `begin … rollback`
(convención viva de `supabase/tests/`); los vitest corren en CI con el runner de la raíz
(`vitest.config.ts`).

### 13.1 `supabase/tests/cobros_grants.sql` — grants

Repone además la suite fantasma `tests/separation/card-metadata-grants.sql`, citada por
`20260615120000:20` e inexistente en el árbol.

```sql
-- Criterio de paso: 0 excepciones. Cualquier RAISE aborta.
do $$
declare
  t text;
  tablas text[] := array[
    'coach_billing_settings','client_billing_plans','student_billing_charges',
    'student_subscriptions','student_payment_events','coach_payment_connections',
    'coach_payment_connection_events','client_email_ledger',
    -- Tablas nuevas de esta ronda (R14, R21). Si aparece una tabla más en el módulo y no entra acá,
    -- la lista deja de ser una barrera: el guard estático de §13.5 verifica que el array cubra todo
    -- `create table` de las migraciones del tren.
    'platform_flags','student_billing_consents'];
  r text;
  roles text[] := array['anon','authenticated'];
  p text;
  privs text[] := array['INSERT','UPDATE','DELETE','TRUNCATE'];
begin
  -- (1) Ninguna tabla nueva concede ESCRITURA a anon/authenticated (I-1, T-01, T-17).
  foreach t in array tablas loop
    foreach r in array roles loop
      foreach p in array privs loop
        if has_table_privilege(r, 'public.'||t, p) then
          raise exception 'FALLA I-1: % tiene % sobre %', r, p, t;
        end if;
      end loop;
    end loop;
  end loop;

  -- (2) anon no lee NADA de las tablas nuevas.
  foreach t in array tablas loop
    if has_table_privilege('anon', 'public.'||t, 'SELECT') then
      raise exception 'FALLA: anon puede SELECT sobre %', t;
    end if;
  end loop;

  -- (3) Los tokens son invisibles para todo rol de cliente (I-4, T-10).
  foreach r in array roles loop
    if has_column_privilege(r,'public.coach_payment_connections','access_token_enc','SELECT')
    or has_column_privilege(r,'public.coach_payment_connections','refresh_token_enc','SELECT') then
      raise exception 'FALLA I-4: % ve los tokens OAuth', r;
    end if;
  end loop;

  -- (4) Columnas explícitamente fuera del grant.
  if has_column_privilege('authenticated','public.student_payment_events','payload','SELECT')
  or has_column_privilege('authenticated','public.student_payment_events','provider_event_id','SELECT')
  or has_column_privilege('authenticated','public.student_billing_charges','checkout_url','SELECT')
  or has_column_privilege('authenticated','public.student_subscriptions','provider_subscription_id','SELECT') then
    raise exception 'FALLA: una columna sensible quedó en el grant de authenticated';
  end if;

  -- (5) coach_payment_connections: RLS on y CERO policies (deny-all doble).
  if (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname = 'coach_payment_connections') <> 0 then
    raise exception 'FALLA: coach_payment_connections tiene policies (debe tener CERO)';
  end if;
  if not (select relrowsecurity from pg_class where relname = 'coach_payment_connections') then
    raise exception 'FALLA: coach_payment_connections sin RLS';
  end if;

  -- (6) client_payments tras M9: anon sin nada, authenticated SOLO lectura (DB-07).
  --     Es la tabla donde vive la plata y la que arrastra GRANT ALL del baseline
  --     (00000000000001_baseline.sql:3590-3592): sin este assert, un `grant all` reintroducido por
  --     cualquier migración futura pasa desapercibido y el coach puede envenenar la idempotencia
  --     del riel MP escribiendo provider_payment_id / charge_id a mano.
  foreach p in array privs loop
    if has_table_privilege('anon','public.client_payments', p)
    or has_table_privilege('authenticated','public.client_payments', p) then
      raise exception 'FALLA M9/DB-07: alguien recuperó % sobre client_payments', p;
    end if;
  end loop;
  if has_table_privilege('anon','public.client_payments','SELECT') then
    raise exception 'FALLA M9: anon conserva SELECT sobre client_payments';
  end if;
  if not has_table_privilege('authenticated','public.client_payments','SELECT') then
    raise exception 'FALLA M9: authenticated perdió SELECT — el coach no ve sus pagos';
  end if;

  -- (7) R13: NINGUNA private.cobros_* es ejecutable por anon/authenticated, salvo
  --     cobros_gate_enabled, que la invoca el gate con el rol del alumno.
  declare fx record;
  begin
    for fx in
      select p.oid::regprocedure as sig, p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.proname like 'cobros\_%'
         and p.proname <> 'cobros_gate_enabled'
    loop
      foreach r in array roles loop
        if has_function_privilege(r, fx.sig, 'EXECUTE') then
          raise exception 'FALLA R13: % puede EXECUTE sobre %', r, fx.proname;
        end if;
      end loop;
    end loop;
  end;

  -- (8) R21: la evidencia de consentimiento no se lee desde ningún cliente.
  if has_table_privilege('authenticated','public.student_billing_consents','SELECT')
  or has_table_privilege('anon','public.student_billing_consents','SELECT') then
    raise exception 'FALLA R21: student_billing_consents es legible por un rol de cliente';
  end if;

  -- (9) R14: platform_flags es service-role-only (si el coach pudiera escribirla, apagaría el gate
  --     de sus propios alumnos… o el de todos).
  if has_table_privilege('authenticated','public.platform_flags','SELECT')
  or has_table_privilege('authenticated','public.platform_flags','UPDATE') then
    raise exception 'FALLA R14: platform_flags accesible desde authenticated';
  end if;
end $$;
```

### 13.2 `supabase/tests/cobros_isolation.sql` — aislamiento

Dos coaches (A, B) y dos alumnos (a→A, b→B) sintéticos, `set local role authenticated` +
`request.jwt.claims`, todo dentro de `begin … rollback`:

| # | Escenario | Esperado |
|---|---|---|
| 1 | Alumno `a` hace `select * from client_billing_plans` | 1 fila (la suya) |
| 2 | Alumno `a` intenta leer el plan de `b` por id | 0 filas |
| 3 | Alumno `a` hace `update client_billing_plans set paid_through = '2099-01-01'` | **42501** (sin grant) |
| 4 | Alumno `a` hace `insert into client_payments (...)` con su `client_id` | 42501 o 0 filas |
| 5 | Alumno `a` hace `update student_billing_charges set status='paid'` | 42501 |
| 6 | Coach A hace `select` sobre planes | solo los suyos |
| 7 | Coach A intenta leer un plan del coach B por id | 0 filas |
| 8 | Coach A hace `update client_billing_plans` | 42501 (escritura solo service-role) |
| 9 | Cualquiera hace `select * from coach_payment_connections` | 42501 |
| 10 | Alumno archivado (`is_archived=true`) hace `select` de su plan | 0 filas (`student_self_client_id()` da NULL) |
| 11 | Alumno `a` sube a `payment-receipts` con path `<coachB>/<b>/x.jpg` | policy rechaza |
| 12 | `private.student_billing_allowed` con un plan vencido + gracia agotada | `false` |
| 13 | Idem con `paid_through = null` | `true` (fail-open) |
| 14 | Idem con `module_enabled = false` | `true` (**B-02/DB-01**: acá fallaba el DDL anterior) |
| 15 | Idem con `engine_hold_at` puesto | `true` (**B-04**) |
| 16 | Idem con `clients.is_demo = true` (y archivado / inactivo / org / team) | `true` |
| 17 | Plan `canceled` con `paid_through` vencido ayer | `false` (**R1**: el derivado es `ended`; la barrera de datos cierra igual) |
| 18 | Coach A hace `insert into client_payments` por PostgREST | 42501 (**DB-07**) |
| 19 | Coach A hace `delete from client_payments` por PostgREST | 42501 (**DB-07**, el camino de RN) |
| 20 | `delete from client_payments` (service-role) de un pago que cerró una cuota | 23503 por el FK `restrict` (**RN-04/DB-08**), nunca un 23514 del CHECK |
| 21 | `platform_flags.cobros_gate = false` + plan vencido y cortado | `true` (**R14**: el kill-switch apaga el gate DB) |
| 22 | Alumno `a` hace `select`/`update` sobre `platform_flags` | 42501 (**R14**) |
| 23 | Alumno `a` hace `select * from student_billing_consents` (incluidas las suyas) | 42501 (**R21**: la evidencia no se navega, se exporta desde admin) |
| 24 | Alumno `a` invoca `private.cobros_confirm_charge(...)` con su cuota | 42501 (**R13**: sin EXECUTE) |
| 25 | Cuota vencida con `claim_deferral_until` en el futuro | `true` (**R3**) · con el valor ya pasado ⇒ `false` |
| 26 | Un pago con `periods_covered = 3` cierra 3 cuotas: `select count(*) from student_billing_charges where payment_id = <id>` | 3 filas, sin violación de unique (**R16**) |

### 13.3 `apps/web/src/app/api/cobros/mp/webhook/route.test.ts`

Copia estructural del ejemplo de oro `apps/web/src/app/api/payments/webhook/route.test.ts`:
`vi.mock` del módulo de autorización con flags mutables, admin de Supabase **stateful in-memory**
(Maps que emulan `student_payment_events` con dedupe por `provider_event_id`, `client_payments` con
unique por `provider_payment_id` y por `charge_id`, `client_billing_plans` con `paid_through`).

Casos obligatorios:

1. **404 con `webhook_ref` desconocido** · **401 con `?token=` ausente o de otra conexión** (R22:
   el token derivado es la barrera vigente) · **401 con firma de otro secret** · **200 procesado con
   `ts` de hace 10 minutos** (F-07: el `ts` viejo **no** puede dar 401; a lo sumo deja una alerta).
2. **R22, el flag**: con `COBROS_WEBHOOK_REQUIRE_SIGNATURE` **ausente**, un POST **sin** `x-signature`
   pero con token derecho ⇒ **200 procesado** + alerta `cobros.webhook.unsigned`. Con el flag en
   `'true'`, el MISMO POST ⇒ **401**. Y con el flag en `'true'` y sin
   `COBROS_WEBHOOK_SIGNING_SECRET` en `NODE_ENV=production` ⇒ **401**, nunca «pasa porque no hay
   secret» (la diferencia con la ruta vieja, T-07).
3. **Redelivery idempotente**: el mismo `(topic, dataId, action)` dos veces ⇒ una sola fila en
   `client_payments`, un solo avance de `paid_through`, un solo correo.
3b. **Reintento tras fallo transitorio (B-01, el caso que se perdía)**: primera entrega ⇒ el
   re-fetch da 500 ⇒ **502** y el evento queda `status='received'`. Segunda entrega con el
   MISMO `(topic, dataId, action)` ⇒ **NO** se dedupea: se procesa, `paid_through` avanza y el
   evento queda `'applied'`. Con el `on conflict do nothing` anterior este test falla, que es
   exactamente el punto.
3c. **Monto insuficiente (R-02)**: pago `approved` de **CLP 1** sobre una cuota de **CLP 35.000** ⇒
   se registra el `client_payments`, la cuota **no** queda `paid`, **`paid_through` no avanza** y
   sale el aviso al coach. Ídem con `currency_id: 'ARS'` y con `status_detail <> 'accredited'`.
4. **`data.id` en MAYÚSCULAS** firma igual que en minúsculas (el manifest usa `toLowerCase`) y produce
   el **mismo** `provider_event_id` ⇒ el segundo se dedupea.
5. **Collector mismatch**: el recurso re-fetcheado trae `collector_id` de otra cuenta ⇒ **no muta
   nada** y responde 200 (T-08).
6. **`external_reference` con un `clientId` de otro coach** ⇒ descartado (T-08 segunda barrera).
7. **`external_reference` del billing viejo** (`<uuid>|pro|monthly`) ⇒ ignorado con 200, cero
   escrituras (barrera de forma del prefijo `cobro|`).
8. **5xx de MP en el re-fetch** ⇒ 502 (para que MP reintente); **404** ⇒ 200.
9. **Kill-switch encendido** ⇒ **503** (para que MP reintente) **y una fila en
   `student_payment_events` con `status='received'`**; cero mutaciones de plata. Un 200 acá
   es el bug LEG-08 y el test tiene que fallar si vuelve.
10. **El payload guardado no contiene `payer`** ni ninguna clave fuera de la whitelist (T-16).
11. `subscription_authorized_payment` aprobado sobre un alumno **cortado** ⇒ `paid_through` avanza y
    el estado derivado vuelve a `ok` (el choque de relojes EVA 3 días / MP 10 días).
12. **R10 — cuota por período**: dos `authorized_payment` del MISMO preapproval (mes 1 y mes 2, mismo
    `external_reference` con `planId`) ⇒ **dos cuotas distintas** cerradas, `paid_through` al
    `period_end` del mes 2. Con la resolución vieja por `chargeId` del ref, el segundo caía sobre la
    cuota del mes 1 y el alumno quedaba cortado con el cobro hecho: el test tiene que fallar si
    alguien la revive. Y un `authorized_payment` de un período **sin cuota** ⇒ la cuota **se crea**.
13. **R9 — reembolso**: `payment` con status `refunded` sobre una cuota pagada ⇒ cuota `refunded`,
    `client_payments.status='refunded'`, **`paid_through` RETROCEDE** al `period_end` de la cuota
    anterior pagada, y salen E11 (alumno) + C7 (coach). Reprocesar el mismo evento ⇒ `already_reverted`
    y **cero correos nuevos**. Ídem `charged_back`.
14. **R9 — duplicado**: segundo pago aprobado, distinto `provider_payment_id`, sobre una cuota ya
    `paid` ⇒ fila en `client_payments` con `charge_id null` y `status='duplicate'`, **`paid_through`
    no se mueve**, sale C8.
15. **R12 — reproceso por ventana**: evento `received` de hace **30 segundos** ⇒ 200 `inflight`, sin
    re-fetch; el MISMO evento `received` de hace **5 minutos** ⇒ se reprocesa. Evento `failed` ⇒ se
    reprocesa siempre. Recurso ajeno ⇒ evento **`applied` con nota** + 200 (no queda reciclando).
16. **R16 — prepago**: confirmación con `periods_covered = 3` ⇒ 3 cuotas `paid` con el MISMO
    `payment_id` (sin violación de unique) y `paid_through` en el `period_end` de la tercera.

### 13.4 `apps/web/src/app/api/cobros/mp/callback/route.test.ts` — OAuth

1. `state` de la query distinto del de la cookie ⇒ 401, cero escrituras.
2. Cookie ausente ⇒ 401. Cookie con firma alterada ⇒ 401. Cookie expirada ⇒ 401.
3. `cookie.coachId !== session.user.id` ⇒ **401** (el corazón de T-14).
4. `code` válido pero `users/me.site_id !== 'MLC'` ⇒ 400, conexión **no** creada.
5. `live_mode: false` en producción ⇒ 400.
6. `scope` sin `offline_access` ⇒ 400 con mensaje explícito.
7. `provider_account_id` ya activo en otro coach ⇒ 409 (T-16b).
8. Éxito ⇒ la fila guardada tiene `access_token_enc` que **no contiene** el token en claro
   (`expect(row.access_token_enc).not.toContain(token)`), y `enc_key_version = CURRENT`.
9. `oauthPost` se llama con exactamente 2 headers y sin claves extra en el body (`research/s8 §2.9`).

### 13.5 Guards estáticos (los que impiden la regresión silenciosa)

```ts
// tests/mobile/cobros-no-checkout-url.test.ts
// Ninguna ruta /api/mobile/** puede mencionar el vocabulario del checkout (I-6, T-20).
const PROHIBIDO = /\b(init_point|initPoint|checkout_url|checkoutUrl|sandbox_init_point|mpago\.la|mercadopago\.c)/
it('ninguna ruta /api/mobile/** menciona el checkout', async () => {
  for (const f of await glob('apps/web/src/app/api/mobile/**/*.ts')) {
    expect(await read(f), f).not.toMatch(PROHIBIDO)
  }
})
it('ningún archivo de apps/mobile menciona el checkout', async () => {
  for (const f of await glob('apps/mobile/**/*.{ts,tsx}')) {
    expect(await read(f), f).not.toMatch(PROHIBIDO)
  }
})

// tests/cobros-no-global-token.test.ts  (T-11, T-22)
const ARBOL = ['apps/web/src/lib/cobros/**', 'apps/web/src/services/cobros/**', 'apps/web/src/app/api/cobros/**']
const PERMITIDOS = ['ProviderRequestError', 'extractMercadoPagoNotificationId', 'constantTimeEquals', 'mapProviderStatus']
it('el riel de cobros nunca resuelve el token del env global', async () => {
  for (const f of await glob(ARBOL)) {
    const src = await read(f)
    expect(src, f).not.toMatch(/getMpAccessToken|MERCADOPAGO_ACCESS_TOKEN/)
    // Import del adapter viejo: solo helpers puros de la lista.
    const imports = [...src.matchAll(/from '@\/lib\/payments\/providers\/mercadopago'/g)]
    if (imports.length) {
      const named = [...src.matchAll(/import \{([^}]+)\} from '@\/lib\/payments\/providers\/mercadopago'/g)]
        .flatMap(m => m[1].split(',').map(s => s.trim()))
      expect(named.every(n => PERMITIDOS.includes(n)), `${f}: ${named}`).toBe(true)
    }
  }
})

// tests/cobros-env-isolation.test.ts  (T-21)
it('el riel de cobros no usa los secretos del billing EVA', async () => {
  for (const f of await glob(ARBOL)) {
    expect(await read(f), f).not.toMatch(/MERCADOPAGO_WEBHOOK_(TOKEN|SIGNING_SECRET)/)
  }
})

// tests/cobros-no-withtransaction.test.ts  (R13 / D-W15)
// `withTransaction` no es una primitiva de este stack. Si aparece en el árbol de cobros, alguien
// está fingiendo atomicidad que PostgREST no da — y en §8 eso es plata perdida.
it('el riel de cobros no finge transacciones', async () => {
  for (const f of await glob([...ARBOL, 'packages/cobros/**'])) {
    expect(await read(f), f).not.toMatch(/withTransaction/)
  }
})

// tests/cobros-consents-not-purged.test.ts  (R21)
// La evidencia de consentimiento se conserva 24 meses y se purga a mano. Si alguien la suma al cron
// dominguero, se borra sola justo cuando hace falta.
it('purge-data no toca student_billing_consents', async () => {
  const src = await read('apps/web/src/app/api/cron/purge-data/route.ts')
  expect(src).not.toMatch(/student_billing_consents/)
})

// tests/cobros-money-rpcs-are-private.test.ts  (R13)
// Toda mutación de plata pasa por private.cobros_*. Un `.from('client_billing_plans').update(...)`
// con `paid_through` fuera de una RPC es el bug que R13 vino a matar.
it('paid_through solo se escribe dentro de las RPCs private.cobros_*', async () => {
  for (const f of await glob([...ARBOL, 'apps/web/src/services/cobros/**'])) {
    const src = await read(f)
    if (/paid_through/.test(src)) {
      expect(src, `${f}: escribe paid_through fuera de una RPC`).not.toMatch(/\.update\(\s*\{[^}]*paid_through/s)
    }
  }
})
```

### 13.6 Vitest de funciones puras y servicios

| Archivo | Qué prueba |
|---|---|
| `packages/cobros/state.test.ts` | Las **27** filas de §3.3 + propiedades (sin ancla ⇒ nunca `unpaid` ni `ended`; monotonía temporal; `canceled` ⇒ nunca `unpaid`; `active` ⇒ nunca `ended`; el claim nunca corre el corte > 5 días). Patrón `paid-expiry.test.ts`. |
| `packages/cobros/periods.test.ts` | `addDaysIso`, `santiagoDayStartUtcMs` en cambio de DST (04-04 y 06-09 de 2026), y el borde B-16 (UTC vs Santiago). |
| `apps/web/src/lib/cobros/token-crypto.test.ts` | §5.4: round-trip, tag inválido, AAD cruzada (otro coach, otra columna), v1 legible con `CURRENT=2`, clave de largo inválido. |
| `apps/web/src/lib/cobros/external-reference.test.ts` | Round-trip; rechaza el ref del billing viejo; rechaza uuids malformados; el ref no contiene `@` ni espacios. |
| `apps/web/src/services/cobros/confirm-payment.service.test.ts` | Doble confirmación ⇒ un solo pago; `paid_through` nunca retrocede; `coachId` distinto ⇒ `forbidden`; `clientOpId` repetido ⇒ `already_confirmed`. **Y el caso DB-02**: pago ya insertado pero `paid_through` sin avanzar (estado a medias de un intento anterior) ⇒ la rama `already_confirmed` **igual aplica el `greatest`** y deja el plan correcto. |
| `supabase/tests/cobros_confirm_charge.sql` | La RPC de §8.1 contra LIVE en `begin … rollback`: atomicidad real (matar la transacción entre el insert y el avance no deja el pago escrito), monotonía, y el evento del webhook en `'applied'` **solo** si el pago commiteó. |
| `apps/web/src/services/cobros/connection.service.test.ts` | Desconectar con N suscripciones vivas ⇒ **409** sin tocar nada (F-04); `confirm:'cancel_all'` ⇒ un `PUT cancelled` por suscripción **antes** de borrar los tokens; **si una falla tras los reintentos ⇒ 502, los tokens NO se borran y sale la alerta** (R5 — el token vivo es lo único que puede cerrar esa suscripción); **no existe `confirm:'force'`** (R5 lo eliminó: un test que falle si vuelve); `invalid_grant` ⇒ `engine_hold_at` puesto en los planes `mp_*` (B-04) + `needs_manual_cancel`. |
| `apps/web/src/services/cobros/cancel-subscription.service.test.ts` | **R5**: los cinco hooks (H-1…H-5) llaman al servicio; 3 reintentos con backoff ante 5xx; 404 de MP ⇒ éxito; 401/403 ⇒ no reintenta y marca `needs_manual_cancel`; fallo final ⇒ alerta a ADMIN_EMAILS; **el kill-switch NO cancela nada**. |
| `apps/web/src/services/cobros/claim.service.test.ts` | **R3**: rate limit; claim de una cuota ajena ⇒ no-op; claim sobre cuota ya `claimed` ⇒ idempotente; el claim **no** mueve `paid_through`; **sí** escribe `claim_deferral_until` en cuota **y** plan, con tope de 5 días; rechazar ⇒ los dos vuelven a null; web y RN (`POST /api/mobile/student/cobros/claim`) terminan en el MISMO servicio (R19) y la ruta RN **no** acepta nota ni archivo. |
| `apps/web/src/services/cobros/undo-revert.service.test.ts` | **R8/R9**: deshacer ⇒ cuota `pending`, pago `voided`, `paid_through` al valor previo; deshacer una confirmación que no es la última ⇒ `not_last`; a los 8 días ⇒ `too_old`; pago legacy sin `charge_id` ⇒ `legacy_payment` (conserva el borrado viejo); reembolso ⇒ retroceso + E11 + C7, y reprocesado ⇒ `already_reverted` sin correos. |
| `apps/web/src/lib/cobros/sweep.test.ts` | Decisión pura del cron: qué correo toca cada día, exclusión de `is_demo`/archivados/org, `reminder_opt_out_at` solo apaga E1. |
| `apps/web/src/lib/cobros/flags.server.test.ts` | Kill-switch: `true` apaga, `false`/ausente/error dejan encendido. Beta: error ⇒ nadie entra. **R14**: el endpoint admin escribe Edge Config **y** `platform_flags.cobros_gate`, y si una de las dos falla responde 500 (nunca «ok» a medias). |
| `apps/web/src/lib/cobros/external-reference.test.ts` (ampliado) | **R10**: `buildChargeExternalReference` vs `buildPlanExternalReference`; el parse devuelve `targetId` y **no** un `chargeId` implícito; el ref de un preapproval nunca se usa para resolver cuota. |

### 13.7 Orden de ejecución en el tren

```
W1 (datos + motor puro):  cobros_grants.sql · cobros_isolation.sql · cobros_gate_equivalence.sql
                          + EXPLAIN ANALYZE (§2.1) + state/periods/token-crypto tests
                          + flags.server.test (R14) + los guards estáticos de R13/R21
W3 (alumno + cron):       claim.service.test (R3/R19) · sweep.test (R4) · guards estáticos 13.5
W5 (riel MP):             webhook route.test · callback route.test · external-reference.test (R10)
                          + confirm-payment.service.test + undo-revert.service.test (R8/R9)
                          + cancel-subscription.service.test (R5)
W6 (QA):                  niveles A/B/C de research/s2 §10 · Playwright con UN navegador
                          (memoria: 6 en paralelo colgaron Supabase Micro el 22-08)
```

---

## 14. Resumen de decisiones del writer (para el juicio del jefe)

| # | Decisión | Alternativa descartada |
|---|---|---|
| D-W1 | Sin `org_id`/`team_id` en **ninguna** tabla nueva; la rama org se resuelve joineando `clients`. | El espejo denormalizado de r7 §4.1. |
| D-W2 | Las policies del alumno usan `private.student_self_client_id()`, así que un alumno archivado no ve su plan. | `client_id = auth.uid()` liso. |
| D-W3 | `provider_subscription_id` / `provider_account_id` / `provider_payer_id` fuera del grant de `authenticated`. | r7 §4.6: «es un id público, dejarlo». |
| D-W4 | `client_payments.amount` sigue `numeric(10,2)`; las tablas nuevas usan `integer` CLP. | Migrar el tipo de la columna histórica. |
| D-W5 | El alumno no lee `client_email_ledger`. | Policy de lectura propia. |
| D-W6 | El error de las 3 RPC sigue siendo `coach_account_paused`; no se agrega `student_block_reason` en este tren. | Cambiar el `raise` de las 3 RPC (más caro, toca el camino caliente de nutrición). |
| ~~D-W7~~ · ~~D-W7-bis~~ | **REEMPLAZADAS POR R1.** D-W7 decía que `canceled` apagaba el gate (⇒ gratis para siempre); D-W7-bis lo mandaba a `unpaid` (⇒ copy que miente, «ponte al día» sin nada que pagar). **R1**: `canceled` dentro de `paid_through` ⇒ `ok`; después ⇒ **`ended`**, sin gracia ni diferimiento. Estados finales `off \| ok \| due_soon \| due \| unpaid \| ended`. | Las dos versiones anteriores de la propia decisión. |
| D-W8 | `resolveStudentAccessForCoach` se extiende para devolver también `{ coachTier, coachStatus }` ⇒ el gate de cobros no agrega ni un round-trip al proxy. | Un segundo SELECT sobre `coaches` en el árbol `/c`. |
| D-W9 | El `state` de OAuth vive en una cookie firmada `httpOnly` `SameSite=Lax` con TTL 10 min, no en una tabla. | La tabla de `state` con TTL de r7 §6 T-14 (necesita cron de limpieza y no obliga al mismo navegador). |
| D-W10 | Los comprobantes de `payment-receipts` **no** se purgan por retención automática. | Sumarlos a `purge-data` a los 180 días. |
| D-W11 | `reminder_opt_out_at` vive en `client_billing_plans` (sin grant, escrito por server action), **no** como columna user-editable de `clients`. Resuelve el choque G14 de z-completitud. | `clients.billing_emails_opt_out` con `GRANT UPDATE(col)`. |
| D-W12 | El kill-switch de cobros tiene polaridad **inversa** a `STUDENT_ACCESS_GATE`: solo el `true` explícito apaga, y un Edge Config caído deja el módulo encendido. | Copiar `raw !== false` (un Edge Config caído apagaría el cobro de todos). |
| ~~D-W13~~ | **REEMPLAZADA POR R7.** Proponía el header `x-eva-client-caps: student-billing` para no cortar en binarios viejos. R7 decide cortar siempre con `studentAccess.state='blocked'` + `reason`: los viejos muestran la pausa genérica (segura, verificado en `entitlements-core.ts:105-113`, que ya acepta `'blocked'`) y el OTA agrega el copy por `reason`. El header **no se implementa**. | El contrato nuevo entre RN y `/api/mobile/config`. |
| D-W14 | La gracia efectiva y el interruptor del módulo se **desnormalizan** en `client_billing_plans` (`effective_grace_days`, `module_enabled`), escritos por `settings.service.ts`. Proxy, RLS y motor puro leen la misma columna. | Leer `coach_billing_settings` desde el gate — tabla que M1 no le expone al alumno, así que el proxy directamente no podía. |
| D-W15 | **`withTransaction` no es una primitiva de este stack** (elevado a **R13**). Donde dos escrituras tienen que caer juntas, va una función plpgsql `security definer` **en el schema `private`**, un solo `rpc()`, `select … for update` sobre el plan y **cero grant a `authenticated`**. En el documento no queda ni un `withTransaction`, y hay un guard estático que lo mantiene así. | La secuencia de `tx.from()`, que finge una transacción que PostgREST no da. |
| D-W17 | **`claim_deferral_until` se desnormaliza en el plan** (R3), además de vivir en la cuota. Extiende D-W14 por la misma razón: el gate SQL y el proxy resuelven el estado con **un** lookup y el criterio de §2.1 (≤ 0,15 ms/fila, un Index Scan) sobrevive. Lo escriben los servicios de claim/rechazo/confirmación. | Un segundo `lateral` sobre `student_billing_charges` en el camino caliente de `student_write_allowed` — el gate de nutrición y de workout_logs paga eso por fila. |
| D-W18 | **El `?token=` de la URL del webhook es DERIVADO**: `HMAC(COBROS_WEBHOOK_TOKEN, webhook_ref)`. Cumple R22 (hay `?token=`) sin violar R-01 (no se reparte el secreto global dentro de N cuentas MP ajenas): filtrar el de un coach no filtra los demás. | El `?token=COBROS_WEBHOOK_TOKEN` literal (R-01 lo prohíbe) o no tener token (R22 lo pide). |
| D-W19 | **`ended` y `unpaid` colapsan en el mismo `false`** dentro de `private.student_billing_allowed`. La barrera de datos no tiene copy: cortar es cortar. La distinción de R1 vive en la función pura, el proxy, `/api/mobile/config` y la UI. | Un tercer valor de retorno o una función `student_billing_reason` en el camino caliente (D-W6 ya descartó tocar eso en este tren). |
| D-W16 | El **freno del motor** (`engine_hold_at`) es una rama fail-open de primera clase, no un caso especial del modo. Sin señal de MP, nadie se corta. | «Los planes `mp_*` pasan a manual sin cortar a nadie» — cierto en el instante, falso a los 3 días. |

## 15. Lo que este documento NO resuelve (para el jefe)

1. **El secret que firma los webhooks de un recurso creado con token OAuth de un vendedor** es una
   inferencia fundada, no un hecho documentado (`research/s8 §4.3` y §11.4). **R22 ya decidió cómo se
   convive con eso**: `?token=` derivado + firma si viene, y `COBROS_WEBHOOK_REQUIRE_SIGNATURE` a
   `true` cuando X1 lo confirme **en nivel C, con la primera notificación real** (no en W0). Lo que
   queda pendiente no es la decisión: es **correr X1 y subir el flag**, y que alguien lo tenga
   agendado — un flag de endurecimiento que nadie sube se queda en `false` para siempre.
2. **El `EXPLAIN (ANALYZE)` de §2.1 no se corrió** (mandato de solo lectura). Es el número que decide
   si M16 se aplica o si el corte queda solo en la capa app.
3. **El censo de `anon` sobre `client_payments`** (M9) está razonado con greps, no con un
   `begin … rollback` en LIVE. Correrlo antes de aplicar.
4. **El payload de `mp-connect`** no está documentado (`research/s8 §11.2`): el handler lo acepta y lo
   registra, pero la aplicación exacta se ajusta cuando llegue el primero real.
5. **Menores de 18 pagando** (G22 de z-completitud): el diseño no lo contempla. Hoy EVA confirma 14+
   (`apps/web/src/app/c/[coach_slug]/onboarding/OnboardingForm.tsx:386`). El aviso previo del
   `OUTLINE §6.4` incluye un checkbox de «pagador mayor de 18», que es una declaración, no un control.
   Decisión de owner + abogado.

### 15.1 Preguntas nuevas que dejan las correcciones (28-08)

6. **`client_email_ledger.status` vs. la realidad de Resend.** El CHECK admite
   `delivered/bounced/complained`, pero los 8 retornos de `sendCobrosEmailOnce` no los escriben:
   los `skipped_*` ni siquiera dejan fila. La exclusión «último correo `bounced`/`complained`»
   (EMAILS §1.1 inv. 6) **solo funciona si se cablea el webhook de Resend**. ¿Entra en este tren o se
   declara letra muerta por ahora?
7. **«Dar de baja mi plan» en modo manual** (§3.3) necesita un correo al coach que **no existe** en
   `EMAILS.md`. Con la numeración de DECISIONS-2, **C6 ya es «bajaste a Free»**, así que la pregunta
   es: ¿**C9** nueva, o C2 con otro asunto?
8. **Cambios cross-archivo que este documento pide y no puede hacer** (el fixer solo edita
   DATA-SECURITY): `PLAN §W1` y `TASKS W1.2-W1.8` reescritos contra §1 — ahora **16 migraciones**, con
   `platform_flags` (M12), `student_billing_consents` (M13) y las RPCs `private.cobros_*` (M14)
   **antes** del gate, y el gate renumerado a M15/M16 con timestamps nuevos (`…101000` / `…101500`);
   R17 exige además que PLAN y TASKS referencien por `M-n` y **no** repitan timestamps.
   `PLAN §4` (que afirma que los binarios viejos ignoran `studentAccess`: **no lo hacen — y R7 cuenta
   con eso**); `SPEC §5.2 T14/T17/T18/T20`, `SPEC §15 casos 7-8, 10 y 13` (el caso 13 ya no es «Anular
   pago» sino **«Deshacer confirmación»**, R8), `SPEC §16 inv. 5` (el estado `ended` de R1 y la nueva
   regla de `paid_through` de I-12/R8) y `SPEC §19`; `TESTING-LEGAL` X13, X14 y el plan de contingencia
   de X1 (que ahora se apoya en el `?token=` **derivado**, D-W18); `TASKS W5.11`; y tareas nuevas para
   los cinco hooks de R5 (§5.8), que tocan `client.service.ts` y el downgrade del billing EVA↔coach.
9. **La segunda mitad de R5 vive fuera de este documento**: H-4 («el coach baja a Free») se cablea en
   el servicio de downgrade del **billing EVA↔coach**, que es otro riel y otro dueño. Acá queda
   especificado (C6 + cancelar + planes a `paused`), pero alguien tiene que meter la llamada ahí y
   ese archivo no es de cobros.
10. **`periods_covered` no tiene UI en este tren.** R16 deja el dato y la RPC listos (un pago cierra N
   cuotas), pero el formulario de «Confirmar pago» del coach no ofrece elegir N: hoy solo lo usa el
   camino de prepago cargado a mano por soporte. ¿Entra el selector en W4 o queda para después?
