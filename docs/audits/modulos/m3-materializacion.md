# 3. Materializacion y billing del entitlement (backend)

Esta seccion describe COMO un modulo de pago pasa de "comprado/otorgado" a estar
realmente ON para el coach. La regla de oro del sistema: **nadie escribe el jsonb
`enabled_modules` a mano** (esta bloqueado por column-grant, ver §3.6). El unico camino
es insertar/actualizar una fila viva en `coach_addons`, y un trigger DB recomputa
`enabled_modules` en la misma transaccion. Standalone y teams son dos motores distintos:
standalone pasa por `coach_addons` (trigger D1); teams es un toggle directo del CEO sobre
`teams.enabled_modules`.

Archivos nucleo:
- `apps/web/src/services/billing/addons.service.ts` — logica de cobro/estado/grant (no toca red ni MP directo).
- `apps/web/src/services/billing/addon-webhook.service.ts` — hooks idempotentes que ejecuta el webhook.
- `apps/web/src/services/entitlements.service.ts` — resolucion del entitlement (lectura del gate).
- `apps/web/src/infrastructure/db/coach-addons.repository.ts` — acceso a datos puro (service-role).
- `apps/web/src/domain/billing/types.ts` — tipos de negocio.
- `supabase/migrations/20260612150000_coach_addons_selfservice_billing.sql` — tablas + trigger D1.
- `supabase/migrations/20260612140000_modules_compra_only_grants.sql` — column-grants + `teams_guard_owner_fields`.
- `apps/web/src/app/api/payments/webhook/route.ts` — orquestacion del webhook MercadoPago.
- `apps/web/src/app/api/payments/confirm-addon/route.ts` — camino sincrono espejo del webhook.
- `apps/web/src/app/admin/(panel)/coaches/_actions/coach-actions.ts` — override CEO standalone (`syncAdminGrants`).
- `apps/web/src/app/admin/(panel)/teams/_actions/teams.actions.ts` — toggle CEO de modulos de team.

---

## 3.1 La tabla `coach_addons` (fuente de verdad del entitlement standalone)

Definida en `20260612150000_coach_addons_selfservice_billing.sql` §(1). Es la **fuente de
verdad de los entitlements de modulos de pago** del coach standalone. El comentario de tabla:
"Fuente de verdad de entitlements de add-ons del coach standalone. Escritura SOLO service-role;
el trigger trg_coach_addons_sync recomputa coaches.enabled_modules."

Columnas (snake_case en DB; el repository mapea a camelCase del dominio en `coachAddonFromRow`):

| Columna | Tipo / regla | Significado |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | — |
| `coach_id` | uuid NOT NULL FK → `coaches(id)` ON DELETE CASCADE | dueno del add-on |
| `module_key` | text NOT NULL, CHECK IN (`cardio`,`movement_assessment`,`body_composition`,`nutrition_exchanges`) | espejo de `MODULE_KEYS` (entitlements.service.ts:19-24) |
| `status` | text NOT NULL default `active`, CHECK IN (`active`,`cancel_pending`,`cancelled`) | maquina de estados |
| `source` | text NOT NULL default `self_service`, CHECK IN (`self_service`,`admin_grant`) | pago vs cortesia CEO |
| `price_clp` | integer NOT NULL CHECK `>= 0` | precio MENSUAL de lista **congelado** al contratar; `0` en `admin_grant` |
| `terms_version` | text NOT NULL | version de terminos aceptada (evidencia); `admin_grant` usa sentinela |
| `terms_accepted_at` | timestamptz NOT NULL default `now()` | — |
| `activated_at` | timestamptz NOT NULL default `now()` | — |
| `first_charged_at` | timestamptz nullable | **set-once** por webhook al primer cobro; NULL ⇒ aun sin cobrar (solo posible en mensual) |
| `cancel_requested_at` | timestamptz nullable | momento de la solicitud de baja |
| `expires_at` | timestamptz nullable | fin del periodo ya pagado; al alcanzarse pasa a `cancelled` |
| `cancelled_at` | timestamptz nullable | — |
| `created_at` / `updated_at` | timestamptz NOT NULL default `now()` | — |

El dominio (`CoachAddon` en `domain/billing/types.ts`) renombra `price_clp` → `priceClpMensual`
para dejar explicito que es el **precio mensual de lista congelado**, no el monto del ciclo.

### Indice unico parcial — la pieza clave de coexistencia

```sql
CREATE UNIQUE INDEX coach_addons_one_live_per_module
  ON public.coach_addons (coach_id, module_key, source)
  WHERE status IN ('active','cancel_pending');
```

`source` va en el indice **a proposito**: garantiza **una fila viva por (coach, modulo, source)**.
Consecuencia D2: un grant del CEO (`admin_grant`) y un add-on pago (`self_service`) del **mismo
modulo COEXISTEN** (son filas distintas). Solo se rechaza una segunda fila viva del mismo modulo
**y** mismo source. El service trata la violacion de este indice como "modulo ya activo" o como
idempotencia (re-lee la fila viva en vez de propagar el error — ver §3.3).

`coach_addons_coach_idx` sobre `(coach_id)` para los lookups del repository.

---

## 3.2 El trigger D1 (`sync_coach_enabled_modules`) — cero drift por construccion

Definido en la misma migracion §(2). Es el corazon de la materializacion: recomputa
`coaches.enabled_modules` desde las filas vivas **en cada INSERT/UPDATE/DELETE** de `coach_addons`,
dentro de la misma transaccion.

```sql
CREATE OR REPLACE FUNCTION public.sync_coach_enabled_modules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_coach_id uuid := COALESCE(NEW.coach_id, OLD.coach_id);
BEGIN
  UPDATE public.coaches c
  SET enabled_modules = COALESCE(
    (SELECT jsonb_object_agg(a.module_key, true)
     FROM public.coach_addons a
     WHERE a.coach_id = v_coach_id
       AND a.status IN ('active','cancel_pending')),
    '{}'::jsonb)
  WHERE c.id = v_coach_id;
  RETURN NULL;
END; $fn$;

CREATE TRIGGER trg_coach_addons_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.coach_addons
  FOR EACH ROW EXECUTE FUNCTION public.sync_coach_enabled_modules();
```

Puntos finos verificados en el codigo:
- **`SECURITY DEFINER`**: necesario porque `enabled_modules` esta bloqueado por column-grant
  (§3.6) — el trigger escribe aunque el rol `authenticated` no pueda. El repository nunca toca
  ese jsonb directamente (comentario en `coach-addons.repository.ts:22-24`).
- **`COALESCE(..., '{}')` obligatorio**: `enabled_modules` es jsonb NOT NULL y `jsonb_object_agg`
  sobre 0 filas vivas devuelve NULL — sin el coalesce, cancelar el unico add-on del coach
  reventaria el UPDATE.
- **Filas vivas = `status IN ('active','cancel_pending')`**: un modulo en `cancel_pending` sigue
  prendido (el coach sigue teniendo acceso hasta `expires_at`). Solo `cancelled` lo apaga.
- El jsonb solo lleva keys en `true` (las que estan vivas). El modulo OFF es simplemente la
  ausencia de la key; `getCoachEnabledModules` mapea cualquier valor que no sea `true` a OFF.

`enabled_modules` queda **derivado, no autoritativo**. Si cualquier fila cambia de estado
(insert, set-once de `first_charged_at`, paso a `cancel_pending`, `cancelled`, revoke de grant),
el jsonb se recomputa solo. Por eso no hay drift posible entre lo cobrado y lo habilitado.

---

## 3.3 Materializacion via webhook MercadoPago — el pago crea/activa la fila

El entitlement standalone se materializa cuando MP confirma un pago aprobado. Toda la
orquestacion vive en `apps/web/src/app/api/payments/webhook/route.ts`; los hooks puros
(testeables sin red) viven en `addon-webhook.service.ts` y `addons.service.ts`.

El webhook adapta el provider a un **puerto estrecho** `AddonPaymentsPort` (solo `updateCheckoutAmount`;
`createOneShotPayment` lanza si se invoca aca — el alta lo usa, el webhook no — ver `webhook/route.ts:207-213`).

Hay cuatro maneras en que el webhook materializa/avanza una fila, segun el tipo de evento:

### (a) Alta in-app de UN modulo via one-shot (`materializeAddonFromOneShot`)

Flujo (D4, TODOS los ciclos: mensual, trimestral, anual):

1. El coach activa un modulo desde la UI. `activateAddonForCoach` (addons.service.ts:293) **NO crea
   fila**: calcula el **one-shot prorrateado** (`getAddonProrationClp` — fraccion del periodo restante
   × monto por ciclo, alineado al corte real del preapproval; minimo 1 dia, nunca $0 — cubre el
   compromiso minimo), aplica el cupon vivo a la proracion (`applyCouponToAddonProration`, solo
   `percent` con `target='total'` o `target='module'` que cubra la key), y crea una **preference
   one-shot** (Checkout Pro). Devuelve `{ kind: 'one_shot_checkout', checkoutUrl, prorationClp, cycleAmountClp }`.
   El `external_reference` es dedicado: `addon_oneshot|{coachId}|{key}|{termsVersion}`
   (`buildOneShotExternalReference`) — su primera parte NO es uuid de coach para que el parser de
   suscripcion no lo confunda. **Checkout abandonado = cero filas, cero modulos.**

2. Al aprobarse el pago, MP entrega el evento `payment` con ese `external_reference`. El webhook
   detecta `result.oneShotAddon` (`webhook/route.ts:368`) y llama `materializeAddonFromOneShot`
   (addons.service.ts:342). Esta funcion:
   - Idempotencia previa: busca una fila viva `self_service` del modulo; si existe, la reusa.
   - Si no existe, `insertAddon` con `firstChargedAt = paidAt` (el one-shot **ya cobro** → compromiso
     minimo cubierto). El insert dispara el trigger D1 → el modulo se prende.
   - Carrera confirm-addon ↔ webhook: si el insert viola el indice unico parcial (la fila se creo
     entremedio), re-lee la fila viva en vez de propagar el error (evita 500 espurio) —
     addons.service.ts:370-379.
   - Recalcula el composite con el cupon vivo (`getCompositeAmountClp(..., spec).totalClp`) y ejecuta
     el **PUT al preapproval** (`updateCheckoutAmount`) que **suma el add-on al monto del proximo cobro
     DESDE la renovacion** (no hay cargo inmediato del valor completo — eso ya lo cubrio el one-shot).
     El PUT honra el cupon (con idempotency key `buildAmountPutIdempotencyKey` si hay spec) — sin el
     spec recomputaria a precio lleno y borraria el descuento de la base (incidente jun-2026,
     addons.service.ts:382-383).

3. El webhook ademas escribe el `billing_snapshot` (kind `addon_proration`), un evento de historial
   con el texto integro de las 5 reglas aceptadas, y dispara el recibo por email (fire-and-forget).
   Todo idempotente (ver §3.8 — FIX-5 marker keyed por notificationId).

**Camino sincrono espejo** (`confirm-addon/route.ts`): al volver del Checkout Pro, la pantalla
`addon-processing` postea el `payment_id`. Esta ruta valida (auth → `canViewBilling` excluye team/org →
rate-limit → zod), comprueba que el `external_reference` pertenece al coach de la sesion
(`ref.coachId !== user.id` → 403, anti privilege-escalation), y llama el MISMO
`materializeAddonFromOneShot`. Es idempotente con el webhook (indice unico parcial). El `billing_snapshot`
**lo escribe SOLO el webhook** (dedup por `provider_payment_id`); confirm-addon NO lo escribe para no
competir. Asi el modulo se prende en el acto sin depender del webhook, que queda como backstop.

### (b) Add-ons que viajan en el preapproval de signup/supersede (`materializeAddonsFromPreapproval`)

Cuando el coach contrata add-ons junto con la suscripcion (signup combo o supersede con add-ons),
viajan en el `external_reference` del preapproval. Al llegar el evento `preapproval` `authorized`
(activo) con `result.addons.length > 0` (`webhook/route.ts:1121`), `materializeAddonsFromPreapproval`
(addon-webhook.service.ts:117) inserta una fila `self_service` por modulo con **`firstChargedAt = null`**
(el preapproval nace con el ciclo completo compuesto; el primer cobro recurrente lo seteara despues).
Idempotente por el indice unico parcial. El trigger D1 prende cada modulo en el insert.

### (c) Primer cobro recurrente — set-once de `first_charged_at` (`applyFirstChargeToAddons`)

En el primer cobro recurrente aprobado (mensual), `applyFirstChargeToAddons` (addon-webhook.service.ts:163)
llama `markFirstCharged` (repository:118): set-once por `WHERE first_charged_at IS NULL`, **solo filas
`source='self_service'`** (los grants jamas "se cobran"), `status IN ('active','cancel_pending')`.
Idempotente: una segunda pasada del mismo cobro no marca nada. Si alguna recien-cobrada estaba en
`cancel_pending` (baja antes del 1er cobro, regla 3 mensual = compromiso minimo cumplido), fija su
`expires_at` y dispara el PUT que la excluye del proximo cobro. Honra el cupon vivo en el PUT.

Este path se ejecuta tanto en la rama `isRecurringAuthorizedPayment` (P0-1, webhook/route.ts:221) como
en la rama "stale branch" (cobro recurrente cuyo `providerCheckoutId` es la order, no el preapproval —
webhook/route.ts:759-827) y en la rama generica de pago aprobado (webhook/route.ts:1137).

### (d) Confirmacion/reconciliacion de monto (`reconcilePreapprovalAmount`)

En eventos `preapproval` `updated`/`authorized`, el webhook compara el monto vigente del preapproval
contra el composite esperado (incluyendo cupon). Drift → alerta en `admin_audit_logs`
(`coach.addon_amount_drift`), no rompe el flujo (webhook/route.ts:1087-1117).

---

## 3.4 Override del CEO — `admin_grant` price 0, write-through `syncAdminGrants`

El override del CEO para standalone es un **write-through de `coach_addons`**, NO una escritura
directa del jsonb (que el trigger D1 pisaria en la proxima mutacion de add-ons). Implementado en
`syncAdminGrants` (addons.service.ts:515), llamado desde `coach-actions.ts:152` cuando el form trae
`modules_present`.

`syncAdminGrants(db, coachId, desired)`:
- `desired` = mapa `Record<ModuleKey, boolean>` (una entrada por MODULE_KEY), construido por
  `readModules` desde los checkboxes `module_<key>` del panel admin.
- Diffea `desired` contra las filas vivas **`admin_grant`** del coach:
  - deseado ON sin grant vivo → `insertAddon` con `source: 'admin_grant'`, **`priceClpMensual: 0`**
    (cortesia, NUNCA factura, D2), `termsVersion: ADMIN_GRANT_TERMS_VERSION` (sentinela `'admin_grant'`).
  - deseado OFF con grant vivo → `revokeAdminGrant` (repository:193): cancel DURO del grant
    (`status='cancelled'`). El grant no tiene ciclo que esperar (price 0, sin preapproval): pasa
    directo a `cancelled`.
- **NO toca filas `self_service`**: retirar la cortesia jamas cancela un add-on que el coach paga.
- Idempotente: re-correr con el mismo `desired` no cambia nada.
- Cada insert/revoke dispara el trigger D1 → `enabled_modules` se recomputa.

Coexistencia (D2): por el indice unico parcial con `source`, un grant del CEO y un add-on pago del
mismo modulo coexisten. Si el CEO retira el grant pero el coach paga ese modulo, el modulo **sigue ON**
por la fila `self_service` (el trigger recomputa y la key permanece). Devuelve `{ granted, revoked }`
para el audit log (`coach.modules_grant`).

`buildCoachUpdateData` (module-form.ts:36) **excluye `enabled_modules` a proposito** — el comentario
documenta que el override de modulos paso a write-through (no escribir el jsonb directo).

---

## 3.5 Cancelacion — maquina de estados `active → cancel_pending → cancelled`

Maquina de estados (domain/billing/types.ts:14-19): `active ──baja──► cancel_pending ──(corte
alcanzado)──► cancelled (terminal)`. `cancelled` es terminal: reactivar crea una fila NUEVA
(re-congela precio).

`requestAddonCancellation` (addons.service.ts:418) bifurca por `first_charged_at`:

- **`first_charged_at` SETEADO (regla 4)** — cubre SIEMPRE trim/anual (el one-shot ya cobro) y el
  mensual ya cobrado: `requestCancel` → `cancel_pending` con `expires_at = currentPeriodEnd` (fin del
  periodo ya pagado), y **PUT YA** que baja el monto del proximo cobro (excluye el add-on, que en
  `cancel_pending` + `first_charged_at != null` deja de ser facturable — ver `isAddonBillable`,
  addons.service.ts:153). El PUT honra el cupon vivo. Si el PUT falla (preapproval pausado / MP caido),
  **NO se tumba la baja**: queda aplicada en DB y el reconcile diario reintenta (`putApplied=false`).

- **`first_charged_at` NULL (regla 3, SOLO mensual)** = compromiso minimo: `cancel_pending` SIN PUT,
  `expires_at = null` (diferido). El proximo corte cobra igual (compromiso minimo); recien al primer
  cobro `applyFirstChargeToAddons` fija `expires_at` y dispara el PUT.

El paso `cancel_pending → cancelled` lo aplica la pasada diaria de reconcile via `applyExpiry`
(repository:170): cuando `expires_at` se alcanza, `status='cancelled'` (idempotente, solo afecta filas
aun `cancel_pending`). El trigger D1 apaga el modulo recien en ese paso (mientras esta en
`cancel_pending` el modulo sigue ON, porque es una fila viva).

`cancelAllForCoach` (repository:217) cancela DURO **todas** las filas vivas del coach — lo usa el
webhook cuando el preapproval expira de verdad (terminal `expire`, webhook/route.ts:1077) y en
refund/chargeback (webhook/route.ts:867). El trigger D1 apaga todos los modulos de golpe.

---

## 3.6 RLS / grants — `enabled_modules` es compra-only (escritura service-role)

`coach_addons` y `billing_snapshots` (migracion 20260612150000):
- `ALTER DEFAULT PRIVILEGES` del proyecto otorga ALL a `authenticated`/`anon` en toda tabla nueva,
  por eso se hace `REVOKE ALL` y luego solo `GRANT SELECT TO authenticated` + `GRANT ALL TO service_role`.
- **Unica policy**: `coach_addons_select_own` / `billing_snapshots_select_own` — `SELECT` propio
  (`coach_id = (SELECT auth.uid())`). **CERO policies INSERT/UPDATE/DELETE para `authenticated`** → toda
  escritura es service-role. El SELECT propio si funciona con el client user-scoped del coach (lo usa
  `/coach/subscription`).
- Por eso el repository documenta: "TODA escritura corre con SERVICE-ROLE; pasar siempre un client
  `createServiceRoleClient()` a los metodos de escritura — un client user-scoped fallara por RLS".

`coaches.enabled_modules` es **compra-only** (migracion 20260612140000, column-grants): se hace
`REVOKE INSERT,UPDATE,DELETE ON public.coaches FROM authenticated,anon` y luego `GRANT UPDATE(...)` sobre
una allowlist de columnas user-editable (full_name, branding, invite_code, etc.). `enabled_modules` NO
esta en la allowlist → solo service-role la escribe. El trigger D1, al ser `SECURITY DEFINER`, escribe
igual aunque el rol no tenga el grant de columna. Regla de mantenimiento (en el header de la migracion):
toda columna nueva user-editable exige su `GRANT UPDATE(col)` en la misma migracion, o PostgREST devuelve
`42501` en runtime.

---

## 3.7 Teams — `teams.enabled_modules`, toggle directo del CEO + `teams_guard_owner_fields`

Para teams la resolucion es distinta (entitlements.service.ts:9-16, regla LOCKED): en contexto pool/team
**el team decide** (`teams.enabled_modules`, el POOL gana, no es union); en standalone manda
`coaches.enabled_modules`. Los modulos del team NO se filtran a los clientes standalone del coach.

`teams.enabled_modules` **NO pasa por `coach_addons` ni por el trigger D1**: es un **toggle directo del
CEO** en `/admin/teams`. `updateTeamAction` (teams.actions.ts:133) y `createTeamAction` escriben
`enabled_modules` directo con `readModules(formData)` (el mismo helper que standalone) via service-role
(`adminClient`). Los teams se pagan por contrato, no self-service.

Doble proteccion de columnas de team (migracion 20260612140000):
- `REVOKE INSERT,UPDATE,DELETE ON public.teams FROM authenticated,anon` + `GRANT UPDATE(...)` de una
  allowlist (name, colores, loader, logos). `enabled_modules` y `seat_limit` NO estan en la allowlist →
  solo service-role.
- `teams_guard_owner_fields` (CREATE OR REPLACE endurecido): trigger `SECURITY DEFINER` que **bloquea el
  cambio de `seat_limit` para TODO caller `authenticated`** (incluido el owner — "ni el owner del team
  puede modificarlo"); service-role exento. Segunda capa de defensa sobre el column-grant. La rama de
  `owner_coach_id` queda intacta (solo via `transfer_team_ownership`).

`enabled_modules` de teams es jsonb directo; no hay maquina de estados ni `admin_grant` (eso es
exclusivo del motor standalone `coach_addons`).

---

## 3.8 `billing_snapshots` — evidencia SERNAC del desglose congelado por cobro

`billing_snapshots` (migracion 20260612150000 §(3)) congela el desglose `base_clp` + `addons[]` +
`total_clp` de CADA cobro aprobado. Comentario de tabla: "Desglose congelado al momento exacto de cada
cobro aprobado (recurrente u one-shot), escrito por el webhook (service-role). Evidencia SERNAC: prueba
que se cobro y por que. Idempotente por `provider_payment_id`."

Columnas: `provider_payment_id` (text NOT NULL **UNIQUE** — idempotencia por cobro), `charged_at`, `tier`,
`billing_cycle`, `kind`, `base_clp`, `addons` (jsonb `[{module_key, price_clp, cycle_amount_clp}]`),
`total_clp`. La migracion 20260614120000 amplio el CHECK de `kind` a
`('recurring','addon_proration','tier_upgrade_proration')` (sin ella el upsert del upgrade tira 23514 y
el webhook loopea en cada redelivery). El service ademas escribe columnas de cupon (F4):
`base_before_discount_clp`, `discount_clp`, `coupon_code`, `coupon_redemption_id` (nullable/defaulted →
snapshots sin cupon quedan back-compat).

`insertBillingSnapshot` (addon-webhook.service.ts:66) hace `upsert(..., { onConflict:
'provider_payment_id', ignoreDuplicates: true })` → un reintento del webhook es no-op. El desglose de
add-ons facturables lo arma `buildAddonBreakdown` (addon-webhook.service.ts:50) usando `toBillableAddons`
+ `getAddonCycleAmountClp` (precio mensual congelado → monto del ciclo). RLS: `SELECT` propio,
escritura solo service-role (igual que `coach_addons`).

`kind` por escenario:
- `recurring` — cobro recurrente; `total_clp` = composite honrando el cupon vivo (`getCompositeAmountClp`
  con spec), `base_clp` = `tierBaseClp`.
- `addon_proration` — one-shot de alta de add-on; `base_clp = 0` (solo la fraccion del add-on), total
  descontado si hay cupon.
- `tier_upgrade_proration` — one-shot de upgrade de tier; `base_clp = 0`, add-ons no entran.

### Idempotencia global del webhook (defensa en profundidad)

- Dedup top-level por `provider_event_id === notificationId` en `subscription_events`
  (webhook/route.ts:117-127): una reentrega exacta corta temprano.
- `markFirstCharged` set-once (`WHERE first_charged_at IS NULL`).
- Materializacion idempotente por el indice unico parcial.
- `billing_snapshots` idempotente por `provider_payment_id` UNIQUE.
- **FIX-5** (webhook/route.ts:393-407, 469-488): los eventos one-shot/upgrade se historizan con keys
  derivadas del id del addon/payment (no del notificationId), asi que el dedup top-level no los atrapa;
  por eso el webhook escribe ademas un marker keyed por `notificationId` para que una reentrega corte
  antes de re-enviar el recibo (la materializacion es idempotente, pero el email + side-effects NO).

---

## 3.9 Lectura del entitlement (el gate que consume todo esto)

`entitlements.service.ts` resuelve el entitlement final, SIEMPRE server-side:
- `getCoachEnabledModules` / `getTeamEnabledModules` leen el jsonb (que el trigger D1 mantiene).
- `hasModule(db, key, ctx)`: si `ctx.teamId` → manda el team; si `ctx.coachId` → manda el coach; default
  OFF. Aplica el kill-switch de operador `EVA_DISABLED_MODULES` (`isModuleKilledByOperator`) ANTES del
  entitlement — apaga el modulo para TODOS por encima del entitlement del tenant (requiere redeploy).
- `assertModule` (throwing guard) corre al tope de cada server action / RSC de modulo. El gating se
  enforce server-side; la UI solo espeja para show/hide (`applyOperatorKillSwitch`).

El gating de COMPRA (distinto del de uso) vive en `canPurchaseAddon` (addons.service.ts:220, D8): exige
plan pago activo (`tier !== 'free'` + status `active`/`trialing` con preapproval vivo donde sumar el
monto); `nutrition_exchanges` exige tier con nutricion (Pro+, starter no); coach de team/org excluido
(sus add-ons van por contrato). El kill-switch NO bloquea la compra (es palanca de incidentes).
