# 4. Flujo de pago MercadoPago: preferencias, confirmacion y webhook

Esta seccion cubre el flujo de dinero de punta a punta del checkout del coach standalone. Es el unico canal de ingresos: alta (free → pago), renovacion recurrente, upgrade/downgrade de tier, cambio de ciclo, add-ons (modulos pagos), cupon de descuento, cambio de tarjeta, cancelacion y reactivacion. Todo el calculo de precio y toda la mutacion de columnas de billing son **server-side y service-role**: el cliente JAMAS manda montos.

> Regla transversal money-safety (presente en TODAS las rutas): el coach se resuelve SIEMPRE por `user.id` (de `supabase.auth.getUser()`), nunca del body. El monto SIEMPRE lo calcula el server contra MP / contra el catalogo. Las columnas `subscription_tier`/`subscription_status`/`billing_cycle`/`max_clients`/`payment_provider`/`subscription_mp_id`/`superseded_mp_preapproval_id` son **compra-only** (REVOKE UPDATE a `authenticated`): solo las escribe service-role (checkout + webhook + confirmaciones sincronas).

---

## 4.0 Conceptos base (precios, ciclos, descuentos)

Fuente unica de precios y catalogo: `@eva/tiers` (`packages/tiers/index.ts`), re-exportado por `apps/web/src/lib/constants.ts`.

### Tiers en venta (mensual de lista, CLP)

| Tier | `monthlyPriceClp` | `maxClients` | Nutricion | Branding |
|------|-------------------|--------------|-----------|----------|
| `free` | 0 | 3 | no | no |
| `starter` | 19990 | 10 | no | no |
| `pro` | 29990 | 30 | si | si |
| `elite` | 44990 | 100 | si | si |
| `growth` (LEGACY, fuera de venta) | 84990 | 120 | si | si |
| `scale` (LEGACY, fuera de venta) | 190000 | 500 | si | si |

`SALE_TIERS = ['free','starter','pro','elite']`. El checkout (`create-preference`) **solo acepta `starter|pro|elite`** (Zod enum) — `free` se activa por otra ruta (`activate-free`); `growth/scale` quedan fuera por el enum (un grandfathered no puede re-checkout su tier por esta puerta; lo gestiona admin/Teams).

### Ciclos de cobro (`BILLING_CYCLE_CONFIG`)

| Ciclo | `months` | `discountPercent` |
|-------|----------|-------------------|
| `monthly` | 1 | 0 % |
| `quarterly` | 3 | 10 % |
| `annual` | 12 | 20 % |

`getTierPriceClp(tier, cycle)`: mensual → precio mensual; trimestral → `round(monthly*3 * 0.9)`; anual → `round(monthly*12 * 0.8)`. `isBillingCycleAllowedForTier` valida la combinacion (los tiers a la venta admiten los 3 ciclos; `free` ninguno).

### Add-ons / modulos pagos (`ADDON_CONFIG`)

`ADDON_MONTHLY_PRICE_CLP = 9990` **uniforme** para los 4 modulos (`cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges`). Monto por ciclo via `getAddonCycleAmountClp(priceMensual, cycle)` = `round(priceMensual * months * (1 - discountPercent/100))` (mismo descuento del ciclo, redondeo POR ITEM). `nutrition_exchanges` exige tier con nutricion (Pro+).

### Direccion del cambio de plan

`TIER_RANK`: free 0 < starter 1 < pro 2 < elite 3 < growth 4 < scale 5. `comparePlanDirection(current, next)` → `'upgrade' | 'downgrade' | 'same'`.

### Cupon (motor de descuento puro)

`computeDiscountedClp({ baseClp, addons, spec, floorClp })` aplica el cupon **SOBRE el composite ya con descuento de ciclo** (compone). `DiscountSpec`:
- `type`: `'percent'` (1..100) o `'fixed_clp'` (CLP entero).
- `target`: `'base'` (solo el plan), `'module'` (solo los addons en `moduleKeys`), `'total'` (toda la cuenta).
- `remainingCycles`: `null` = forever/once vigente; `<= 0` = expirado (sin descuento).

Devuelve `{ baseBeforeDiscountClp, discountClp, netClp }`. El neto se clampea entre el piso (`DISCOUNT_NET_FLOOR_CLP = 0`, configurable por `floorClp`) y el composite (un cupon nunca sube el precio). El path **pago** ademas rechaza `netClp === 0` (un 100%-off va por `admin_grant`, nunca por MP que rechaza `transaction_amount <= 0`).

### El UNICO calculo de monto compuesto

`getCompositeAmountClp(tier, cycle, billableAddons, discount?)` (`services/billing/addons.service.ts`):
- Sin 4o arg → `number` legacy = `base + Σ addons` (sin cupon).
- Con `discount` (spec o `null`) → `CompositeWithDiscount = { totalClp, baseBeforeDiscountClp, discountClp }`.

Lo consumen `create-preference`, todos los PUT del preapproval, el webhook (todas las ramas), `subscription-status` y los tests. Como TODOS resuelven el cupon con el MISMO spec (server-side), checkout == webhook == cron computan el mismo neto → **drift-safe**: un preapproval con cupon nunca dispara `addon_amount_drift`.

### Resolucion del cupon vivo (server-side, drift-safe)

`services/billing/discount.service.ts`: el descuento NUNCA se confia del cliente ni del `external_reference`. Se re-resuelve en cada call site de precio desde `coaches.active_coupon_redemption_id` → `coupon_redemptions` (puntero → ledger). Funciones:
- `resolveActiveDiscountSpec(db, coachId)` — service-role, devuelve `DiscountSpec | null` (lee `coaches`, luego `coupon_redemptions`; `null` si no hay cupon, el ledger no esta `active`, o el snapshot es invalido/expirado).
- `resolveActiveDiscountDetail` — agrega `redemptionId`, `couponCode`, `appliedCyclesRemaining` (para snapshots).
- `resolveActiveDiscountFromRpc(db)` — para `subscription-status` (cliente user-scoped): RPC `resolve_active_discount` (SECURITY DEFINER, `auth.uid()` interno, anti-IDOR).
- `isChargeableNetClp(net)` = `net >= 1`. `buildAmountPutIdempotencyKey(coachId, amount)` = `coupon-amt|{coachId}|{amount}` (estable por coach+monto, sin timestamp → un retry del mismo monto deduplica).

### Provider MercadoPago (`lib/payments/providers/mercadopago.ts`)

Implementa `PaymentsProvider`. Metodos clave:
- `createCheckout` → `POST /preapproval` (suscripcion recurrente, status `pending`, `auto_recurring.transaction_amount = amountClp`, `frequency = months`, `start_date`, `end_date = now+5años`). Devuelve `{ checkoutId, checkoutUrl }`.
- `createOneShotPayment` → `POST /checkout/preferences` (pago unico clasico, `auto_return: 'approved'`, `back_urls`). Lo usan upgrade de tier y alta de add-on.
- `fetchCheckoutSnapshot(id)` → `GET /preapproval/{id}` (status, `external_reference`, `next_payment_date`, `start_date`, `auto_recurring`).
- `fetchPaymentSnapshot(id)` → `GET /v1/payments/{id}` (status, `external_reference`) — para confirm sincrono de one-shots.
- `updateCheckoutAmount(id, amount, idempotencyKey?)` → `PUT /preapproval/{id}` solo `auto_recurring.transaction_amount`.
- `updateCheckoutAmountAndRef(id, amount, ref, idempotencyKey?)` → PUT que ademas reescribe `external_reference` (revert de stale-ref en upgrade).
- `updateCardAtProvider(id, cardTokenId, idempotencyKey)` → PUT con UNA sola key `card_token_id` (cambio de tarjeta in-place).
- `cancelCheckoutAtProvider(id)` → `PUT /preapproval/{id} { status: 'cancelled' }`.
- `processWebhook(payload)` → rutea el evento (ver 4.4).

`X-Idempotency-Key` (header) se manda solo cuando el caller provee la key (PUTs cupon-driven); los PUTs sin cupon lo omiten (comportamiento intacto). En modo TEST (`MERCADOPAGO_ACCESS_TOKEN` empieza con `TEST-`) se agrega `X-scope: stage`; el payer email se resuelve por `MERCADOPAGO_TEST_PAYER_EMAIL` (solo Preview) o el email real del coach (prod).

### `external_reference`: 4 formatos discriminados

1. **Suscripcion recurrente**: `coachId|tier|cycle[|addon1+addon2]` — `buildCheckoutExternalReference` / `parseCheckoutExternalReference`. La 4a parte (add-ons) es opcional, backward-compatible con preapprovals de 3 partes.
2. **One-shot upgrade de tier**: `tier_upgrade|coachId|newTier|cycle` — `buildTierUpgradeExternalReference` / `parseTierUpgradeReference`.
3. **One-shot add-on**: `addon_oneshot|coachId|moduleKey|termsVersion` — `buildOneShotExternalReference` / `parseOneShotAddonReference`.

Precedencia de parse en el webhook payment: `oneShotAddon` → `tierUpgrade` → `checkoutRef` (cada uno excluye a los siguientes; el prefijo literal `addon_oneshot`/`tier_upgrade` los distingue del uuid del coach).

---

## 4.1 `create-preference` — arma la preferencia / preapproval

`POST /api/payments/create-preference` (`apps/web/src/app/api/payments/create-preference/route.ts`). Es el punto de entrada de TODA compra/cambio de plan (alta, reactivacion, upgrade, downgrade, cambio de ciclo, combo plan+modulos).

**Body (Zod):** `{ tier: 'starter'|'pro'|'elite', billingCycle: 'monthly'|'quarterly'|'annual', addons?: ModuleKey[] }`. Del body **jamas** se acepta monto ni precio.

**Guards en orden:** auth (`getUser`) → `rateLimitPayment(user.id)` → `canViewBilling(workspace)` (excluye team/org con 403) → Zod → `isBillingCycleAllowedForTier` (400) → coherencia de add-ons:
- `requestedAddons` = dedup del body filtrado contra `MODULE_KEYS`, **pero si `SELF_SERVICE_ADDONS_ENABLED` esta OFF se ignoran los add-ons nuevos del body** (se tratan como `[]`) — fail-closed del switch de lanzamiento (sin esto, un POST crafted podria embeber un modulo pago en el preapproval con el feature apagado). NO afecta a los add-ons YA VIVOS del coach (esos son entitlements pagados, se arrastran siempre).
- `starter + nutrition_exchanges` → 400 (cobrar algo inusable).

**Lectura del coach vigente:** `subscription_status, subscription_tier, billing_cycle, current_period_end, subscription_mp_id`. Deriva:
- `isFreeTierCoach` = tier vigente `free`.
- `isActiveUpgrade` = status `active` **y** `current_period_end` futuro (suscriptor pago vivo).
- `currentTier`, `currentCycle`, `direction = comparePlanDirection(currentTier, tier)`.
- `upgradeStartDate` = `current_period_end` (el nuevo plan agendado al corte, si `isActiveUpgrade`).
- `mustUseFreshStart` = status `canceled`/`expired` → `reactivationStartDate = now+60s` (no heredar un `start_date` viejo de MP).
- `previousMpId` = `subscription_mp_id` previo (para supersede).

**Cupon:** `discountSpec = resolveActiveDiscountSpec(admin, user.id)` resuelto **una vez** server-side; lo usan la proracion del upgrade y el composite recurrente.

### Ramas (solo si `isActiveUpgrade`)

#### Upgrade (`direction === 'upgrade'`)
- **Lock atomico**: `claimUpgradeInFlight(admin, user.id)` (ver 4.2). Si no reclama → 409 `UPGRADE_IN_FLIGHT`.
- `prorationClp = getTierUpgradeProrationClp(currentTier, tier, currentCycle, now, currentPeriodEnd)` = diferencia de precio `(getTierPriceClp(newTier,cycle) - getTierPriceClp(currentTier,cycle))` por la fraccion de dias que resta del ciclo actual, minimo 1 CLP. Si `<= 0` → libera el lock + 400 (sin diferencia a cobrar).
- **Cupon sobre la proracion**: solo `percent` con `target !== 'module'` descuenta el diff prorrateado (`max(1, proration - round(proration*pct/100))`).
- Crea **one-shot** (`createOneShotPayment`), `externalReference = tier_upgrade|coachId|tier|currentCycle`, success → `/coach/subscription/upgrade-processing?tier=&cycle=`, failure/pending → `/coach/subscription?upgrade=...`. **NO** crea preapproval nuevo, NO marca superseded, NO muta el coach: el nuevo tier se activa al confirmar (confirm-upgrade/webhook). El ciclo solicitado se IGNORA (se fija a `currentCycle`); cambiar ciclo es accion aparte.
- Si la creacion del one-shot falla → `clearUpgradeInFlight` antes de relanzar (no trabar 30 min).
- Respuesta: `{ kind: 'tier_upgrade_oneshot', checkoutUrl, prorationClp }`.

#### Downgrade (`direction === 'downgrade'`)
Dos guards con **cero efectos colaterales** (no toca coach ni crea checkout):
- `OVER_CAPACITY` (409): si `getTierMaxClients(tier) < countActiveStandaloneClients` → bloquea, exige archivar alumnos.
- `NUTRITION_ADDON_ON_DOWNGRADE` (409): si el tier destino no admite nutricion (starter) y hay un add-on `nutrition_exchanges` con status `active` vivo → bloquea (debe quitar el modulo primero). Si ya esta en `cancel_pending`, el downgrade se permite.

#### Same tier + same ciclo
400 no-op (la UI deshabilita Continuar).

### Camino comun (composite recurrente)

`scheduleAtCutOnly = isActiveUpgrade && (downgrade || same)` → el preapproval nuevo arranca al CORTE y NO se tocan tier/max_clients/cycle ahora (el webhook los fija al corte desde el `external_reference`).

**Monto compuesto:** une `liveAddons` (filas vivas `coach_addons` facturables, via `listLive` + `toBillableAddons`) con `requestedAddons` del signup (estos aun sin fila — los materializa el webhook), dedup por `moduleKey`:
```
composite = getCompositeAmountClp(tier, billingCycle, billableAddons, discountSpec)
amountClp = composite.totalClp
```
Si `!isChargeableNetClp(amountClp)` (100%-off) → 400 `NET_NOT_CHARGEABLE` (va por admin_grant).

**Crea el preapproval** (`createCheckout`): `external_reference = coachId|tier|cycle[|addons]`, `amountClp`, success → `/coach/subscription/processing`, failure/pending → `/coach/reactivate?payment=...&tier=&cycle=`, `startDate = upgradeStartDate ?? reactivationStartDate`, `addons = checkoutAddons` (el webhook los materializa al confirmar).

**Supersede del preapproval viejo (P0-2/P1-6):** si `previousMpId` existe y `!== newMpId`, se cancela el viejo en MP de inmediato SIEMPRE (no solo en downgrade/cambio-de-ciclo). Best-effort: si el cancel tiene exito, `supersededForUpdate = null`; si falla, se persiste en `superseded_mp_preapproval_id` como backstop para que webhook/cancel/cron lo reintenten. Esto evita doble cobro cuando un coach reintenta el checkout (refresca y reaprieta).

**UPDATE del coach** (service-role, `eq('id', user.id)`):
- `isFreeTierCoach` → solo `payment_provider`, `subscription_mp_id`, `superseded_mp_preapproval_id`. **NO** se pasa a `pending_payment`: un free que abandona el checkout conserva acceso; el webhook lo sube al confirmar el pago.
- `scheduleAtCutOnly` → solo `payment_provider`, `subscription_mp_id`, `superseded_*` (no degrada el plan vigente antes del corte).
- caso normal (alta/reactivacion) → escribe `subscription_tier`, `subscription_status` (`pending_payment`), `billing_cycle`, `max_clients`, `payment_provider`, `subscription_mp_id`, `superseded_*`.

Respuesta: `{ provider, tier, billingCycle, amountClp, subscriptionId, checkoutUrl }`. El cliente redirige a `checkoutUrl` (Checkout Pro de MP).

---

## 4.2 `plan-change-lock` — candado in-flight del upgrade

`services/billing/plan-change-lock.ts`. Sin tabla nueva: reutiliza `subscription_events` con `provider_event_id = tier_upgrade_pending:{coachId}` (UNIQUE). Cierra la ventana entre "cree el one-shot del upgrade" y "active el tier": en esa ventana un segundo upgrade, un alta de add-on o un cambio de ciclo recomputarian el composite sobre el tier viejo y plegarian el pago dos veces.

- `claimUpgradeInFlight(db, coachId)` → `true` si reclama, `false` si hay un candado vivo. Atomicidad apoyada en el UNIQUE: el primer INSERT que gane el constraint (`23505`) es el unico dueño. Si hay colision lee el `created_at`: **fresco** (dentro de `TTL_MINUTES = 30`) → `false`; **rancio** (checkout abandonado) → toma de control con **compare-and-swap** (borra solo esa fila exacta por `created_at`; si el DELETE afecta 0 filas, otro racer la tomo → `false`). Cierra el TOCTOU del stale-takeover (el viejo `setUpgradeInFlight` con DELETE→INSERT incondicional dejaba ganar a dos requests → doble one-shot; queda `@deprecated`).
- `isUpgradeInFlight(db, coachId)` → `true` si hay marcador dentro del TTL (lo consulta `addons` para bloquear altas durante un upgrade).
- `clearUpgradeInFlight(db, coachId)` → borra el marcador (idempotente). Lo llaman confirm-upgrade y la rama tierUpgrade del webhook al activar, y cancel-subscription al cancelar.

`db` SIEMPRE service-role (la escritura de `subscription_events` esta revocada a `authenticated`).

---

## 4.3 Confirmaciones sincronas (vuelta de MP)

Como **MP en modo test NO entrega webhooks** (solo el Simulador o prod), tras volver del Checkout Pro las pantallas `processing` llaman a estos endpoints para confirmar el pago **en el acto**, sin depender del webhook (que sigue como backstop idempotente en prod). Cada uno re-corre los hooks criticos de forma idempotente con el webhook.

### `confirm-subscription` (pantalla `processing`)

`POST /api/payments/confirm-subscription`. Body opcional `{ preapprovalId? }`. Guards: auth → `canViewBilling`. Lee el coach (service-role); `preapprovalId = body ?? coach.subscription_mp_id`.

- **Guard "Ya pague" stale**: si NO viene `preapprovalId` explicito y el coach esta `expired`/`paused` → 403 (no reactivar con un id guardado viejo).
- `snapshot = fetchCheckoutSnapshot(preapprovalId)` (502 si falla).
- **Ownership**: si el `external_reference` parsea con `coachId` y no es `user.id` → 403. Si `preapprovalId` explicito y el ref es null/no-parseable → debe coincidir con `coach.subscription_mp_id` (fail-closed sin 403 espurio a legacy).
- `tier`/`cycle` del ref si vienen; valida `isBillingCycleAllowedForTier` (409 con `suggestedBillingCycle`).
- **Paid-like gate**: solo muta si `mapProviderStatus(snapshot.status)` ∈ `active|trialing`. Si NO (sandbox deja `pending` al redirect) → no muta nada, devuelve el status → la pantalla **sigue polleando** sin bloquear.
- **Early-slash guard**: si `snapshot.start_date` (o `auto_recurring.start_date`) es **futuro** → es un cambio agendado al corte (downgrade/cambio de ciclo) → NO muta tier/entitlements ahora (el coach perderia acceso antes de tiempo), devuelve `{ scheduled: true }`.
- Si paid-like e inicio ya vigente: **UPDATE** del coach con `subscription_status = status`, `current_period_end = resolveCurrentPeriodEnd(...)`, `subscription_tier`, `billing_cycle`, `max_clients = getTierMaxClients(tier)`, `subscription_mp_id`.
- **Espejo idempotente del webhook**: (a) **supersede cancel** del `superseded_mp_preapproval_id` + clear del marcador; (b) **materialize addons** del `external_reference` (`materializeAddonsFromPreapproval`, idempotente por el indice unico parcial) — para que un upgrade sincrono nunca deje al coach pagando-composite con `enabled_modules={}`. Ambos best-effort (logean, no tumban el confirm).
- Escribe `subscription_events` con `provider_event_id = manual-confirm:{preapprovalId}:{status}` (upsert).

> El `billing_snapshot` NO se escribe aqui — lo escribe el webhook (dedup por `provider_payment_id`) para no competir.

### `confirm-upgrade` (pantalla `upgrade-processing`)

`POST /api/payments/confirm-upgrade`. Body `{ paymentId }`. Confirma el one-shot prorrateado del upgrade. Guards: auth → `canViewBilling` → rate-limit → Zod.

- `payment = fetchPaymentSnapshot(paymentId)` (502 si falla). Si `status !== 'active'` → `{ ok, status }` (abandono = tier intacto; la pantalla sigue polleando).
- `ref = parseTierUpgradeReference(payment.external_reference)`; si null → 400; si `ref.coachId !== user.id` → 403.
- Lee coach (service-role). Sin `subscription_mp_id` → 409. Si `canceled`/`expired` → **NO resucitar** (skip).
- **Replay guard (P1)**: si existe `subscription_events.provider_event_id = tier_upgrade:{paymentId}` → ya procesado, no re-activa (evita re-jugar un paymentId viejo para re-otorgar tier gratis tras un downgrade).
- **Activacion rank-guarded**: solo escribe `subscription_tier`/`max_clients`/`billing_cycle` si `getTierRank(currentTier) < getTierRank(ref.newTier)` (si ya activo — este camino o el webhook — no-op). El `status` no se toca.
- **PUT del preapproval** al nuevo composite (`getCompositeAmountClp(newTier, cycle, addons vivos, discountSpec).totalClp`) + reescribe el `external_reference` al nuevo `tier|cycle` (`updateCheckoutAmountAndRef`, **P0-1 stale-ref revert**: sin esto el proximo evento `preapproval` re-derivaria el tier viejo y revertiria el upgrade). Sin cargo inmediato (el one-shot ya cobro la diferencia); aplica DESDE la renovacion. Con cupon → manda idempotency key.
- Escribe `subscription_events` `tier_upgrade:{paymentId}` (upsert) + `clearUpgradeInFlight`.

### `confirm-addon` (pantalla `addon-processing`)

`POST /api/payments/confirm-addon`. Body `{ paymentId }`. Materializa el add-on tras el one-shot prorrateado aprobado. Guards: auth → **`SELF_SERVICE_ADDONS_ENABLED` (403 `FEATURE_DISABLED` si OFF)** → `canViewBilling` → rate-limit → Zod.

- `payment = fetchPaymentSnapshot(paymentId)`. Si `status !== 'active'` → no otorga nada.
- `ref = parseOneShotAddonReference(...)`; null → 400; `ref.coachId !== user.id` → 403.
- Lee coach; sin `subscription_mp_id` → 409 (backstop; el alta ya bloquea antes con `NO_ACTIVE_SUBSCRIPTION`).
- `materializeAddonFromOneShot(admin, payments, ctx, ref.moduleKey, ref.termsVersion, paidAt=now)`: idempotente — reusa la fila viva si existe (indice unico parcial `coach_addons_one_live_per_module`); si no, inserta con `first_charged_at = paidAt` (one-shot ya cobrado, compromiso minimo cubierto). Luego **PUT** del preapproval al nuevo composite honrando el cupon vivo (sin el spec, sumar el add-on borraria el descuento de la base).

> El `billing_snapshot` lo escribe SOLO el webhook. Llamar confirm-addon + webhook no duplica filas ni dispara PUTs incoherentes.

---

## 4.4 Webhook — punto de confirmacion canonico en prod

`POST/GET /api/payments/webhook` (`apps/web/src/app/api/payments/webhook/route.ts`). Es el **single-point-of-failure** del cobro recurrente, alta, renovacion, refund/chargeback, materializacion de add-ons y supersede-cancel. En prod es la unica via que confirma renovaciones (MP test no entrega webhooks). Cada hook es idempotente (set-once / unique / indice parcial / dedup por `provider_event_id` o `provider_payment_id`).

### Autenticacion y idempotencia de entrada

1. `extractMercadoPagoNotificationId(request, body)` — del query (`id`/`data.id`) o del body.
2. `isPaymentsWebhookTokenValid` — compara `?token=` o header `x-webhook-token` contra `MERCADOPAGO_WEBHOOK_TOKEN` en **tiempo constante** (`timingSafeEqual`). En prod el token es **obligatorio** (sin el → 401). 401 si invalido.
3. `verifyMercadoPagoSignatureIfConfigured` — si `MERCADOPAGO_WEBHOOK_SIGNING_SECRET` esta seteado: valida el header `x-signature` (`ts=`+`v1=`) reconstruyendo el manifest `id:{dataId.toLowerCase()};request-id:{x-request-id};ts:{ts};` y comparando el HMAC-SHA256 en tiempo constante. **P0-D**: MP minuscula el `data.id` alfanumerico antes de firmar → se hace `.toLowerCase()` (sin esto, ids alfanumericos fallaban la firma). 401 si invalido.
4. **Dedup**: si ya existe `subscription_events.provider_event_id = notificationId` → skip (`{ ok: true }`).

`result = provider.processWebhook(payload)`; si lanza → 502; si `!accepted` → 400.

### Resolucion del coach
- Si `result.coachId` falta pero es un **refund/chargeback** con `preapprovalId` → recupera al coach por `subscription_mp_id = preapprovalId` (P1-1, money-safety: un refund sin `external_reference` no se pierde).
- Sin coach → `{ ok: true }` (accepted sin coachId).
- Carga el coach; si no existe → log + ok. Si `org_managed`/`team_managed` → **skip** (jamas mutar billing centralizado).

### `processWebhook` — ruteo de eventos

`eventType = body.type ?? topic ?? action`:
- **`authorized_payment`** (cobro recurrente) — **interceptado ANTES** del check `subscription` (sin esto se trataria como preapproval → `GET /preapproval/{authpay_id}` → 404 → 502, y la renovacion nunca se confirma — el P0 historico). `GET /authorized_payments/{id}` trae `payment.{id,status}`, `preapproval_id`, `external_reference`. Match contra el coach **por coachId del external_reference** (no por order.id). `isRecurringAuthorizedPayment = true`. Tras un cobro aprobado lee el `next_payment_date` fresco del preapproval.
- **`preapproval`/`subscription`** → `GET /preapproval/{id}` → `eventKind: 'preapproval'`, expone `providerAmountClp` (monto vigente para detectar drift) y los addons del ref.
- **`payment`** → `GET /v1/payments/{id}`. Parse discriminado: `oneShotAddon` → `tierUpgrade` → `parsed` (suscripcion). Expone `preapprovalId` (de `metadata.preapproval_id` o top-level) para el fallback de refund.

### Rama A — cobro recurrente (`isRecurringAuthorizedPayment`)
Autocontenida e idempotente. `recurringStatus = mapProviderStatus(...)`:
- **`active`** (aprobado): `applyFirstChargeToAddons` (set-once de `first_charged_at`) + `insertBillingSnapshot` (kind `recurring`, honrando el cupon: `total_clp` = lo realmente cobrado, con desglose base/descuento + codigo) + `decrementCouponCycleForCharge` (decrementa el ciclo del cupon **exactamente una vez** por cobro, dedup por `provider_payment_id`; si el cupon **expira** sube el preapproval al precio lleno DESDE la proxima renovacion — revert disclosed SERNAC-safe) + UPDATE coach `subscription_status='active'` + `current_period_end` fresco. Si venia de `past_due` → email de recuperacion.
- **`rejected`/`recycling`** (dunning real): marca `past_due` **conservando** `current_period_end` (gracia) solo si el coach esta vivo + email de pago fallido. ⚠️ La authorized_payment llega PRIMERO como `scheduled` (cobro programado, aun no cobrado) y luego `approved` → `scheduled`/`pending`/`processed` NO se tratan como rechazo (seria dunning falso).
- Upsert de `subscription_events` (`authpay:{providerPaymentId}`), return.

### Rama B — one-shot de add-on (`eventKind: 'payment' && oneShotAddon`)
No toca el estado de la suscripcion. Si no aprobado → skip. Sin `subscription_mp_id` → skip (no hay donde PUTear). **FIX-5**: dedup adicional por `notificationId` (la fila de historial va keyed `addon:{id}:oneshot`, no por la notificationId → una reentrega re-enviaria el recibo). Si aprobado: `materializeAddonFromOneShot` + `insertBillingSnapshot` (kind `addon_proration`, `base_clp=0`, honra cupon via `applyCouponToAddonProration`) + evento de historial con el texto integro de las 5 reglas aceptadas + marker keyed por notificationId + **recibo de alta** (fire-and-forget, Resend). Si la materializacion falla → 500 (lo reintenta el reconcile diario).

### Rama C — one-shot de upgrade de tier (`eventKind: 'payment' && tierUpgrade`)
Backstop idempotente de confirm-upgrade. Si no aprobado / sin preapproval / coach canceled-expired → skip. Si aprobado: activacion **rank-guarded** (igual que confirm-upgrade) + PUT al nuevo composite + revert del `external_reference` (P0-1) + `insertBillingSnapshot` (kind `tier_upgrade_proration`, `base_clp=0`, dedup por `provider_payment_id`) + evento `tier_upgrade:{providerPaymentId}` (misma key que confirm-upgrade → seguro en cualquier orden) + marker notificationId + `clearUpgradeInFlight`.

### Rama D — checkout no-current (stale branch)
`appliesToTrackedSubscription = !checkoutId || !coachMpId || checkoutId === coachMpId`. Si NO aplica (un cobro recurrente aprobado trae `providerCheckoutId = payment.order.id ≠ preapproval id`):
- Si es un **payment aprobado** del coach → corre IGUAL los hooks de cobro (first-charge + snapshot recurring + decremento de cupon) matcheando por coachId.
- **FIX-7 refund/chargeback**: si `providerStatus ∈ refunded|charged_back` (estado CRUDO, no `mapProviderStatus`): cancela el preapproval en MP (P1-3: sin esto seguiria cobrando y, con `mp_id` nulleado, el cobro futuro no se podria re-matchear → re-cobro silencioso), `cancelAllForCoach` (trigger D1 apaga modulos), `revertActiveCouponForCoach`, bloquea el coach (`subscription_status='expired'`, `current_period_end=null`, `subscription_mp_id=null`), audit log. El `billing_snapshot` NO se revierte fisicamente (solo audit, evidencia SERNAC). Idempotente.
- Upsert de `staleEventRow`, return.

### Rama E — no-op de cambio de tarjeta (`eventKind: 'preapproval' && active`)
Si hay un marcador `card_change_pending:{coachId}` reciente (< 15 min, escrito por `change-card.service` ANTES del PUT) → reconoce el swap y retorna **sin tocar nada** del estado (P0-7: un PUT `{card_token_id}` emite `preapproval updated` y el bloque normal recomputaria `current_period_end` desde `next_payment_date`, pudiendo re-fechar/expirar al coach en un cambio exitoso).

### Rama F — preapproval/payment general (alta, renovacion, terminacion)
- `status = mapProviderStatus(...)`; tier/cycle del `external_reference` si vienen.
- `statusForUpdate`: si `active` pero la combinacion tier/cycle es invalida → `pending_payment`.
- `nextPeriodEnd = resolveCurrentPeriodEnd(...)`.
- **Paid-like** (`active|trialing`) con `checkoutId || hasResolvedPlan`: escribe `subscription_tier`, `billing_cycle`, `max_clients`. ⚠️ El **primer `payment` aprobado** de una suscripcion MP llega **sin `order.id`** (checkoutId null) → antes el coach quedaba `free` pese a pagar; ahora se escribe el plan cuando viene resuelto del `external_reference`, aunque falte el checkoutId. `subscription_mp_id` solo se escribe con un checkoutId real (un `payment` sin order.id no debe pisar el preapproval id con null). Supersede cancel del `superseded_*` si difiere.
- **Terminal** (`resolveTerminalEvent`): `expire` → `subscription_status='expired'`, `current_period_end=null`, `subscription_mp_id=null` (preserva tier/max_clients para que reactivate pre-seleccione el plan); `ignore-free` → no re-lockear a un free recien activado.
- UPDATE coach. Si falla → 500.
- **Hooks de add-ons post-update** (logean, no tumban el webhook; el reconcile diario detecta drift):
  - (a) terminal expire → `cancelAllForCoach` + `revertActiveCouponForCoach`.
  - (b) `preapproval` → `reconcilePreapprovalAmount` (compara monto vigente vs composite esperado **con cupon** → drift → audit log `addon_amount_drift`).
  - (c) `preapproval authorized` con addons en el ref → `materializeAddonsFromPreapproval`.
  - (d/e) `payment active` → `applyFirstChargeToAddons` (set-once + PUT diferido del compromiso minimo) + `insertBillingSnapshot` (kind recurring, honra cupon) + `decrementCouponCycleForCharge`.
- Upsert de `subscription_events` (`stableEventId`). Si falla → 500.

---

## 4.5 Otras rutas

### `cancel-subscription`
`POST /api/payments/cancel-subscription`. Guards: auth → rate-limit → `canViewBilling`. Body `{ reason? }`.
- Cancela el preapproval en MP (`cancelCheckoutAtProvider`); un "already cancelled" no es error (regex), otro → 502.
- **P0-3**: cancela TAMBIEN el `superseded_mp_preapproval_id` (un cambio de plan en vuelo dejaria al viejo cobrando) + limpia el marcador.
- UPDATE `subscription_status='canceled'` **preservando `current_period_end`** (acceso hasta el fin del periodo ya pagado).
- **P0-4**: `clearUpgradeInFlight` (un upgrade en vuelo no debe trabar add-ons/cambios 30 min).
- **Add-ons** (regla 4): los `self_service` `active` pasan a `cancel_pending` con `expires_at = current_period_end` **sin PUT** (el preapproval ya quedo cancelado). NO se barren los `admin_grant` (cortesia del CEO). Tambien fija `expires_at` a los `cancel_pending` con expires nulo. El cron de expiry los pasa a `cancelled` al corte.
- Inserta `subscription_events` `manual-cancel:{coachId}:{ts}`.

### `change-card`
`POST /api/payments/change-card`. Cambio de tarjeta in-place (Modalidad A). Guards: auth → **`CHANGE_CARD_ENABLED` (gate de dinero server-side, 403 si OFF)** → `rateLimitCardChange` → `canViewBilling` → Zod (`cardToken` 8-256, `acceptedTermsVersion`, display-only `last4`/`brand`/`paymentMethodId` con regex estricto) → **consentimiento** (`acceptedTermsVersion === CARD_CHANGE_DISCLOSURE.version`, evidencia SERNAC Ley 19.496/21.398; 400 `TERMS_OUTDATED` si no).
- Delega en `changeCardForCoach(admin, provider, {...})`: resuelve el coach por `auth.uid()` (anti-IDOR, el body nunca trae mp_id), escribe el marcador `card_change_pending` ANTES del PUT, hace `PUT /preapproval/{id} { card_token_id }` (UNA sola key → no mueve ciclo/monto/fecha), guard Q1 (verifica post-PUT que no cambio next_payment_date/amount/status), audit. El `cardToken` no se loggea.
- Si `PREAPPROVAL_TERMINAL` → responde con `reactivateUrl`. Errores → mensaje generico (nunca filtra body de MP ni datos de tarjeta).

### `addons` (alta de modulo)
`POST /api/payments/addons`. Guards: auth → **`SELF_SERVICE_ADDONS_ENABLED` (403)** → rate-limit → `canViewBilling` → Zod (`moduleKey`, `acceptedTermsVersion`) → checkbox obligatorio (`=== ADDON_PAYMENT_RULES.version`, 400 `TERMS_OUTDATED`).
- `canPurchaseAddon` (gate D8): no `no_paid_plan` (tier pago + status `active|trialing`), `requires_nutrition_tier` (nutrition_exchanges exige Pro+), `managed_by_team_or_org`.
- **Guard P0-A (i)**: si ya hay fila viva del modulo → 409 `ALREADY_ACTIVE` (el one-shot no inserta fila en el alta, asi que el indice unico no dispara hasta el aprobado; sin este check re-comprar cobraria 2a proracion).
- **Guard P0-A (ii)**: doble cobro entre superficies — si hay `superseded_mp_preapproval_id` (cambio en curso que puede embeber el modulo) → 409 `ALREADY_BILLED`; si el modulo YA viaja en el preapproval vigente (lee el `external_reference` via snapshot) → 409 `ALREADY_BILLED`. Fail-open solo si el fetch del snapshot lanza.
- **Guard P0-4b**: `isUpgradeInFlight` → 409 `UPGRADE_IN_FLIGHT` (el composite del upgrade plegaria este add-on dos veces).
- **Guard money-safety**: sin `subscription_mp_id` → 409 `NO_ACTIVE_SUBSCRIPTION` (no tomar dinero que confirm-addon luego no podria cumplir — charged-and-fail).
- `activateAddonForCoach`: crea el one-shot prorrateado (`getAddonProrationClp` por la fraccion restante del periodo, con cupon aplicado via `applyCouponToAddonProration`), `external_reference = addon_oneshot|...`, success → `/coach/subscription/addon-processing`. NO crea fila — la materializa el webhook/confirm-addon. Respuesta `{ kind: 'one_shot_checkout', checkoutUrl, prorationClp, cycleAmountClp }`.

### `addons/cancel` (baja de modulo)
`POST /api/payments/addons/cancel`. Guards: auth → `SELF_SERVICE_ADDONS_ENABLED` (403) → rate-limit → `canViewBilling` → Zod (`moduleKey`, `reason?`).
- `requestAddonCancellation` (reglas 3-4):
  - `first_charged_at` SETEADO (regla 4, siempre trim/anual): `cancel_pending` + **PUT YA** que baja el monto (excluye el add-on del proximo cobro, honra cupon) + `expires_at = current_period_end`. Si el PUT falla, la baja queda aplicada igual (reconcile reintenta).
  - `first_charged_at` NULL (regla 3, solo mensual): `cancel_pending` SIN PUT (el proximo corte lo cobra — compromiso minimo); `expires_at` diferido al primer cobro.
- Evento de historial + recibo fire-and-forget. Respuesta con `effectiveAt` (null = "tras tu primer cobro") y `putApplied`.

### `activate-free`
`POST /api/payments/activate-free`. Pasar a plan gratuito. Guards: auth → `canViewBilling`. Solo si status `pending_payment`/`expired` (403 si no). Si `activeClients > maxClients('free')=3` → 400 (debe archivar). Cancela best-effort el preapproval. UPDATE `subscription_status='active'`, `subscription_tier='free'`, `billing_cycle='monthly'`, `max_clients=3`, `subscription_mp_id=null`, `current_period_end=null`. Eventos + audit log.

### `subscription-status`
`GET /api/payments/subscription-status`. **Lectura** para la pantalla. Guards: auth → `canViewBilling`. Cliente user-scoped (RLS). Devuelve `coach`, `events` (ultimos 50), `addons` (`listLive`), `billing { baseClp, addonsClp, totalClp, baseBeforeDiscountClp, discountClp }`, `activeCoupon { code, discountClp, spec }` (via `resolveActiveDiscountFromRpc` — **el precio mostrado == el cobrado**, SERNAC), `activeClientCount` (para bloquear downgrades), `changeCardEnabled` (`CHANGE_CARD_ENABLED && NEXT_PUBLIC_MP_PUBLIC_KEY` presente — sin la public key el tokenizer no monta). Tolerante a fallos: si la lectura de addons/cupon/count falla, devuelve defaults sin romper el resto.

---

## 4.6 Invariantes money-safety (resumen)

- **Idempotencia**: webhook dedup por `provider_event_id == notificationId`; snapshots por `provider_payment_id` (UNIQUE, upsert ignoreDuplicates); materializacion de add-ons por indice unico parcial `coach_addons_one_live_per_module`; activacion de upgrade rank-guarded + replay guard (`tier_upgrade:{paymentId}`); `markFirstCharged` set-once; decremento de cupon una vez por cobro.
- **Confirm sincrono == webhook**: las pantallas processing re-corren los hooks criticos de forma idempotente porque MP test no entrega webhooks. Llamar confirm + webhook nunca duplica filas/cobros.
- **El descuento sobrevive al webhook recurrente**: cada PUT del preapproval y cada snapshot re-resuelve el MISMO `DiscountSpec` server-side y lo pasa a `getCompositeAmountClp` → el monto neto es identico en checkout, renovacion y reconcile (sin `addon_amount_drift`). Sumar/quitar un add-on SIN el spec borraria el descuento de la base (incidente jun-2026 evitado).
- **Supersede-cancel**: un cambio de preapproval cancela el viejo en MP de inmediato (P0-2/P1-6) o lo persiste como backstop (`superseded_mp_preapproval_id`) para que webhook/cancel/cron lo reintenten — evita doble cobro en reintentos del checkout.
- **plan-change-lock**: candado atomico (UNIQUE + CAS, TTL 30 min) que impide que un segundo upgrade / alta de add-on / cambio de ciclo plieguen el pago en vuelo dos veces.
- **Single-point-of-failure del webhook**: en prod es la unica via que confirma renovaciones recurrentes, materializa add-ons del signup y procesa refund/chargeback. Su autenticacion (token tiempo-constante + HMAC opcional) y su idempotencia son criticas; un fallo en un hook post-update logea pero NO tumba el webhook (el estado base del coach ya quedo consistente; el reconcile diario detecta el drift).
- **P0 historico del ruteo**: el cobro recurrente (`subscription_authorized_payment`) DEBE interceptarse antes del check `subscription`; de lo contrario `GET /preapproval/{authpay_id}` → 404 → 502 y la renovacion nunca se confirma (sin snapshot, decline invisible). El match del cobro recurrente va por coachId del `external_reference`, NO por `order.id` (que ≠ preapproval id).
