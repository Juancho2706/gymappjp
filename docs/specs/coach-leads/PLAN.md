---
status: draft
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# PLAN — Solicitudes al coach (`coach_leads`)

El QUÉ está en [SPEC.md](./SPEC.md); el orden ejecutable con DoD en [TASKS.md](./TASKS.md).

## Punto de partida (código al 21-08)

- `apps/web/app/join/[invite_code]/` ya resuelve la invitación (`resolveInvite`), aplica
  `rateLimitInviteAccept`, valida el referido (`resolveJoinReferral`) y — desde `723b7acb` — crea
  el alumno con `joinViaInviteAction` para los tres scopes. **Ese último paso es lo que se
  revierte para standalone.**
- `apps/web/app/(auth)/register/register.actions.ts` es el patrón vigente de Turnstile (Script de
  `challenges.cloudflare.com` + `div.cf-turnstile` + verificación server con `TURNSTILE_SECRET_KEY`,
  incluido el comportamiento cuando falta la site key). Se copia tal cual, no se reinventa.
- `lib/email/coach-join-notification.ts` (aviso «se unió», F6.4 del 20-08) queda **obsoleto**: lo
  reemplaza `lib/email/coach-lead-notification.ts` (`notifyCoachOfLead`); el viejo y sus usos/tests
  se borran.
- `capturePostHogServerEvent` ya existe y se usa con `await` (el redirect de Vercel mata las
  promesas fire-and-forget).
- `createClientAction` ya trae el cerco de cupo del plan: la conversión pasa por ahí, no se
  duplica lógica de cupo.

## Arquitectura

Flujo de datos obligatorio para la LECTURA del panel (RLS, cliente del usuario):

```text
app/coach/clients/_data/leads.queries.ts
  -> services/leads/leads.service.ts
  -> infrastructure/db/leads.repository.ts
  -> Supabase (RLS: coach_id = auth.uid())
```

Las ESCRITURAS (insert del lead público, cambios de estado) no pueden pasar por el cliente del
usuario: el interesado es anónimo y las columnas de estado no tienen grant. Van por server actions
con **service role**, y cada action del coach verifica primero que el lead sea suyo (`coach_id`
contra la sesión) antes de tocar nada. No hay política de INSERT/UPDATE en la tabla a propósito:
la única puerta de escritura es el servidor de EVA.

## Waves

### W1 — DDL + `/join` solicitud + correo (web) — **en ejecución 21-08**

1. Migración `supabase/migrations/20260821030821_coach_leads.sql` (tabla, constraints, índice,
   RLS, política de select, revoke/grant, trigger `handle_updated_at`). Aditiva e idempotente.
   **El archivo se escribe; el jefe lo aplica** (protocolo tx-rollback + advisors de `AGENTS.md`).
2. `database.types.ts`: entrada de `coach_leads` (Row/Insert/Update) quirúrgica.
3. `requestJoinAction(inviteCode, prev, formData)`: rate limit → Turnstile → Zod → `resolveInvite`
   (debe ser standalone) → `resolveJoinReferral` → dedup 7 días → insert service role →
   `notifyCoachOfLead` (await, fail-open, HTML escapado) → `capturePostHogServerEvent`
   (`coach_lead_received`) → `{ success: true }`.
4. `joinViaInviteAction`: `scope === 'standalone'` → error, no crea nada.
5. UI de `/join/[invite_code]`: formulario de solicitud + estado de éxito + link a login.
6. Baja de `lib/email/coach-join-notification.ts`.

### W2 — Panel «Solicitudes» (web) — **en ejecución 21-08**

1. Lectura por `_data` → service → repository, filtrando `status in ('new','contacted')`.
2. Sección en `/coach/clients` (solo si hay filas): tarjeta por lead con WhatsApp, correo,
   mensaje, chip de referido y «hace X».
3. Actions con service role + verificación de pertenencia: `markLeadConvertedAction`,
   `dismissLeadAction`, `markLeadContactedAction`.
4. `CreateClientModal` con `initialValues` opcional (prop nueva, sin romper usos existentes);
   al crear, se llama `markLeadConvertedAction(leadId, clientId)` que además copia la atribución
   a `clients` y emite `coach_client_referred` / `coach_lead_converted`.
5. `?solicitudes=1` hace scroll/abre la sección.
6. `revalidatePath('/coach/clients')` en cada mutación.

### W3 — RN (fuera de W1/W2)

`GET /api/mobile/coach/leads` (contrato en `packages/*`), lista de solicitudes en el tab de
clientes de la app del coach, acciones de descartar/contactar, y push al coach cuando entra una
solicitud. Requiere binario o queda en OTA según qué toque.

### W4 — Invitar alumno → `/join`

El sheet «Invitar alumno» del coach hoy no emite `/join`. Unificarlo para que el único link que
circula sea el de solicitud, y revisar el QR de la tarjeta.

## Normalizador de WhatsApp (compartido)

Un solo helper, usado por el correo y por el panel:

1. Quitar todo lo que no sea dígito.
2. Si empieza con `0`, quitarlo.
3. Si quedan 9 dígitos y empieza con `9` → anteponer `56`.
4. `https://wa.me/<dígitos>`.

## Test plan

- Unit: schema Zod del formulario (WhatsApp obligatorio, consentimiento obligatorio, límites),
  normalizador de WhatsApp (casos `+56 9…`, `09…`, `9…`, basura), dedup (ventana de 7 días y
  estados que cuentan).
- Integración: `requestJoinAction` con Turnstile mockeado — standalone crea lead, team/org no
  entran por ahí, `joinViaInviteAction` con standalone devuelve error.
- Manual: `/join/{código}` en móvil (dark + white-label), correo real al coach, panel con y sin
  solicitudes, conversión con cupo lleno.

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Romper el alta de team/org al tocar `/join` | El branch por `scope` es explícito y hay test de que team/org siguen por `joinViaInviteAction` |
| Insert con service role expuesto a spam | Turnstile + rate limit + dedup antes del insert; nada de service role en el cliente |
| Correo al coach falla y se pierde la solicitud | El lead ya está insertado antes de mandar el correo; el correo es fail-open y el panel es la fuente de verdad |
| Leer leads con service role por comodidad | Prohibido: la lectura del panel va por RLS; el gate es la revisión de diff |
| El modal de crear alumno se rompe para el resto | `initialValues` es opcional y no cambia el default |

## Rollback

- **DB**: la migración es **aditiva** — una tabla nueva sin tocar nada existente. Rollback = no
  usarla (dejarla vacía) o `drop table public.coach_leads` si el owner lo pide. Ninguna fila de
  `clients`/`coaches` cambia de forma.
- **Web**: el formulario y el action viejos se restauran desde `723b7acb`
  (`git show 723b7acb -- apps/web/app/join`). Volver al alta directa es revertir el branch por
  scope; el resto (correo, panel) queda inerte sin leads.
- **Correo**: `coach-join-notification.ts` vive en el historial si hubiera que resucitarlo.
