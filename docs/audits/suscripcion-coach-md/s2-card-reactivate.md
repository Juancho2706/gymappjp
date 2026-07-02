# 2. Cambiar tarjeta, pantallas de procesamiento y reactivacion

> Alcance: las superficies del checkout que NO son la pagina principal de suscripcion. Tres bloques: (A) cambiar tarjeta in-place, (B) las tres pantallas de procesamiento post-MercadoPago, (C) reactivacion de churn. Enfasis en backend: que datos llegan, como se calcula el precio, como se confirma el pago, que persiste, idempotencia y estados. Todo es money-safety.

---

## 2.0 Mapa de superficies y rutas

| Ruta de pantalla | Componente | Endpoint(s) que dispara | Servicio backend |
|---|---|---|---|
| `/coach/subscription/update-card` | `CardChangeForm` | `POST /api/payments/change-card` | `changeCardForCoach` (`services/billing/change-card.service.ts`) |
| `/coach/subscription/processing` | `SubscriptionProcessingPage` | `POST /api/payments/confirm-subscription`, `POST /api/payments/create-preference`, `POST /api/payments/redeem-coupon-signup`, `GET /api/payments/subscription-status` | confirm-subscription + create-preference inline |
| `/coach/subscription/upgrade-processing` | `UpgradeProcessingPage` | `POST /api/payments/confirm-upgrade`, `GET /api/payments/subscription-status` | confirm-upgrade route |
| `/coach/subscription/addon-processing` | `AddonProcessingPage` | `POST /api/payments/confirm-addon`, `GET /api/payments/subscription-status` | confirm-addon route |
| `/coach/reactivate` | `ReactivateClient` + `ReactivateCouponCard` | `POST /api/payments/create-preference`, `POST /api/payments/confirm-subscription`, `POST /api/payments/activate-free`, `POST /api/payments/redeem-coupon-signup`, `GET /api/payments/subscription-status` | varios |

Invariante transversal: **el cliente NUNCA manda montos**. Cada endpoint resuelve el coach por `auth.uid()` (anti-IDOR), recalcula el precio server-side y valida la propiedad del recurso (preapproval / payment) contra el `external_reference`.

---

## 2.A Cambiar tarjeta (in-place, "Modalidad A")

### 2.A.1 Gate de existencia de la pagina

`update-card/page.tsx` es `export const dynamic = 'force-dynamic'` (el flag es `process.env`, server-only, debe leerse en request-time).

- Si `CHANGE_CARD_ENABLED` esta OFF → `notFound()` (404). El flag es `process.env.CHANGE_CARD_ENABLED === 'true'` (exacto). El gate se duplica en la API (la URL es alcanzable directo).
- Lee `process.env.NEXT_PUBLIC_MP_PUBLIC_KEY` (public key de MP) y la pasa al form. Si esta vacia, el form muestra un aviso de no-disponible (no rompe).
- Pasa `CARD_CHANGE_DISCLOSURE.version` y `CARD_CHANGE_DISCLOSURE.points` (5 puntos numerados con `title`/`text`) al form.

### 2.A.2 El disclosure SERNAC (`CARD_CHANGE_DISCLOSURE`)

Definido en `lib/constants.ts`. Es un consentimiento DEDICADO (NO reutiliza las reglas de compra de add-on — forzar ese checkbox para cambiar tarjeta seria un non-sequitur legal bajo Ley 19.496 / 21.398). Version vigente: **`v1-2026-06`** (sin sufijo `-DRAFT` porque el rep legal JP firmo el 2026-06-16). Los 5 puntos:

1. **Para tus proximos cobros** — la tarjeta nueva reemplaza a la actual para los cobros recurrentes.
2. **No cambia tu plan ni tu fecha** — monto, ciclo y fecha del proximo cobro NO cambian.
3. **No se cobra hoy** — cambiar la tarjeta no genera ningun cobro ahora.
4. **Procesado por Mercado Pago** — EVA no almacena el numero; MP puede notificar al titular.
5. **Puedes cancelar cuando quieras** — acceso hasta el fin del periodo pagado.

CERO mencion de IVA. El texto integro se persiste como evidencia (ver 2.A.7).

### 2.A.3 `CardChangeForm` — tokenizacion client-side (PCI SAQ-A)

`'use client'`. Carga el SDK `https://sdk.mercadopago.com/js/v2` via `next/script` (`strategy="afterInteractive"`, `onReady` y `onLoad` ambos llaman `initFields`). Usa **Secure Fields** de MercadoPago.js v2: el PAN nunca toca el server.

Estado interno: `fieldsReady`, `cardholderName`, `accepted` (checkbox), `submitting`, `error`, `paymentMethodId`.

`initFields` (idempotente via `mountedRef`):
- No-op si ya montado o si la public key esta vacia.
- Lee `window.MercadoPago`; si el Ctor aun no existe sale SIN marcar montado → un disparo posterior reintenta (evita "bricked forever").
- Crea `new MercadoPago(publicKey, { locale: 'es-CL' })`.
- Deriva el color del texto del iframe segun dark/light (el iframe no hereda estilos de la pagina). *(presentacional — fuera de alcance)*.
- Monta tres campos tokenizados en contenedores fijos: `cardNumber` (#mp-card-number), `expirationDate` (#mp-card-expiration), `securityCode` (#mp-card-security). Mas un input normal `cardholderName` (NO tokenizado, es solo texto).
- **Resolucion de marca (display-only)**: escucha `binChange` en el campo `cardNumber`; al cambiar el BIN llama `mp.getPaymentMethods({ bin })` y guarda `paymentMethodId` (visa/master/debvisa/...). Es best-effort, COSMETICO — no gatea el swap. Existe porque `createCardToken` NO devuelve `payment_method_id` y Secure Fields no expone el BIN al JS de la pagina.

`handleSubmit`:
1. Valida `accepted` (sino: "Debes aceptar las condiciones para continuar.").
2. Valida `fieldsReady` (sino: "El formulario todavia se esta cargando.").
3. **Tokeniza**: `mp.fields.createCardToken({ cardholderName })` → `token.id` (single-use, vive 7 dias). Si falla o no hay `token.id` → error pidiendo **re-ingresar el CVV** (Secure Fields LIMPIA el CVV tras tokenizar, asi que un reintento exige volver a teclearlo).
4. **POST** `/api/payments/change-card` con body: `{ cardToken: token.id, acceptedTermsVersion: termsVersion, last4: token.last_four_digits, brand: paymentMethodId ?? token.payment_method_id, paymentMethodId: ... }`. Solo el `cardToken` es load-bearing; `last4`/`brand`/`paymentMethodId` son display-only.
5. Resultado:
   - `res.ok && data.ok` → `router.push('/coach/subscription?card=success')`.
   - `data.code === 'PREAPPROVAL_TERMINAL' && data.reactivateUrl` → `window.location.href = data.reactivateUrl` (suscripcion cancelada/vencida → recrear preapproval via reactivacion).
   - Otro → muestra `data.error`.
   - Catch de red → "No se pudo conectar...".

### 2.A.4 Ruta `POST /api/payments/change-card` — shell HTTP

Guards en orden (espeja `/api/payments/addons`):

1. `auth` (`supabase.auth.getUser()`; 401 si no hay user).
2. **Gate de DINERO server-side**: `if (!CHANGE_CARD_ENABLED)` → 403 `FEATURE_DISABLED` (la ruta es alcanzable por API aun con la UI oculta).
3. `rateLimitCardChange(user.id)` fail-closed → 429 `jsonRateLimited`.
4. `canViewBilling(workspace)` via `resolvePreferredWorkspace` → 403 si es org/team (cambio de tarjeta = solo coach independiente).
5. Zod: `cardToken` (8–256), `acceptedTermsVersion` (min 1), `last4` (`/^\d{4}$/` opt), `brand` (`/^[a-zA-Z0-9 _-]{1,40}$/` opt), `paymentMethodId` (`/^[a-zA-Z0-9_-]{1,40}$/` opt). El formato estricto evita que un valor spoofeado rompa la UI.
6. **Consentimiento**: `acceptedTermsVersion !== CARD_CHANGE_DISCLOSURE.version` → 400 `TERMS_OUTDATED`.
7. Llama `changeCardForCoach(admin, provider, {...})` con `admin` = **service-role** (escribe `coaches.card_*` y `subscription_events`, ambas write-only para service-role) y `acceptedTermsText = JSON.stringify(CARD_CHANGE_DISCLOSURE.points)` (texto integro como evidencia) + `reactivateUrl = ${NEXT_PUBLIC_SITE_URL}/coach/reactivate`.

El `coachId` SIEMPRE = `user.id` (auth.uid()); el body NUNCA trae mp_id/checkoutId. El `cardToken` jamas se loggea. Catch global devuelve mensaje generico (no filtra body crudo de MP).

### 2.A.5 `changeCardForCoach` — orquestacion backend (SIN doble cobro)

Recibe `db` (service-role) + `provider` (MercadoPago) + input. Pasos:

**(1) Carga del coach.** `SELECT id, subscription_mp_id, subscription_status, superseded_mp_preapproval_id, payment_provider FROM coaches WHERE id = coachId`.

**(2) Guards de negocio (todos cortan ANTES de tocar MP):**
- Sin coach → `COACH_NOT_FOUND` (404).
- `payment_provider` distinto al provider actual → `WRONG_PROVIDER` (409). Solo MercadoPago soporta swap in-place (StripeProvider lanza NotImplemented).
- Sin `subscription_mp_id` → `NO_ACTIVE_SUBSCRIPTION` (409). Sin preapproval recurrente no hay nada que PUTear (free/manual/test).
- **Upgrade en vuelo (doble senal):** si `superseded_mp_preapproval_id` esta seteado O `isUpgradeInFlight(db, coachId)` es true → `UPGRADE_IN_FLIGHT` (409). Un PUT de token sobre un preapproval por reemplazar/cancelar corromperia el estado.
- `subscription_status` en `TERMINAL_STATUSES` = {`canceled`, `cancelled`, `expired`} → `PREAPPROVAL_TERMINAL` (409) con `reactivateUrl` (no se puede PUTear un preapproval terminal → ruta a reactivar).
- `subscription_status` NO en `PUT_ALLOWED_STATUSES` = {`active`, `trialing`, `paused`, `past_due`} → `INVALID_STATUS` (409). **Nota clave:** los estados de DUNNING (`paused`/`past_due`) SI permiten el swap — cambiar la tarjeta es justo la recuperacion de un cobro fallido (sin esto el CTA del email de dunning seria callejon sin salida). `pending_payment` queda fuera (es "nunca confirmado", no dunning).

**(3) Snapshot PRE-PUT (guard Q1).** `provider.fetchCheckoutSnapshot(mpId)` → guarda `beforeNextPaymentDate` y `beforeAmount` (`auto_recurring.transaction_amount`). Si el GET falla → `GATEWAY_ERROR` (502, retryable). Esto es la base para verificar que el swap NO mueva el ciclo.

**(4) last4 AUTORITATIVO (A6/P0-10).** `provider.fetchCardTokenSummary(cardToken)` = `GET /v1/card_tokens/{id}` → `last_four_digits` real server-side (NO se confia en el body). El GET NO consume el token (lo consume el PUT). Best-effort: si falla, cae al `last4` del cliente. `brand`/`paymentMethodId` siguen siendo del cliente (cosmeticos).

**(5) Marcador P0-7 ANTES del PUT.** Escribe (delete previo + insert) en `subscription_events` una fila `provider_event_id = card_change_pending:${coachId}`, `provider_status = card_change_pending`, payload `{ mp_id }`. Para qué: si MP emite un `preapproval updated` tras el PUT, el webhook lo reconoce como card-only swap y NO recomputa el periodo (preserva `current_period_end`). El delete→insert refresca `created_at` (el guard del webhook filtra por ventana de 15 min). **A2: si el marcador no se puede persistir, ABORTA antes del PUT** (`GATEWAY_ERROR` 502 retryable) — no se cambia una tarjeta que un `preapproval updated` podria re-fechar/expirar sin proteccion.

**(6) El PUT del swap.** `provider.updateCardAtProvider(mpId, cardToken, idempotencyKey(coachId, cardToken))`.
- En el provider: `PUT /preapproval/{id}` con body de **UNA sola key a proposito**: `{ card_token_id }`. Nada de `auto_recurring`/`status`/`external_reference`/`back_url` (eso moveria ciclo/monto = re-facturacion silenciosa = exposicion SERNAC). Por eso el swap NO cobra.
- **Idempotency key** (`idempotencyKey(coachId, cardToken)`): `card_change:${coachId}:${sha256(cardToken).slice(0,32)}`. Deterministica y SIN timestamp → un doble-submit del MISMO token deduplica en MP (el token single-use ya es la unidad natural). El token va HASHEADO (nunca en claro en la key ni en logs). Se envia en header `X-Idempotency-Key`.
- Manejo de error del PUT: `parseMpStatus(message)` extrae el HTTP status de `... failed (NNN) ...`. Status `400` → `TOKEN_INVALID` (400, retryable, "Revisa los datos"). Otro → `GATEWAY_ERROR` (502, retryable). Solo se loggea status + coachId (nunca PAN/token).

**(7) Guard Q1 en runtime (el swap NO debe mover next_payment_date ni monto).** `provider.fetchCheckoutSnapshot(mpId)` POST-PUT → compara:
- `next_payment_date`: comparacion como INSTANTE (P1-8) — si las strings difieren, parsea ambas (`Date.parse`) y compara ms; unparseable → conservador (asume movido). Esto evita `CYCLE_DRIFT` espurio por `…Z` vs `…+00:00`.
- `auto_recurring.transaction_amount` (before vs after).
- Si `movedDate || beforeAmount !== afterAmount` → escribe fila de auditoria `card_change_cycle_drift:${coachId}:${Date.now()}` con before/after de fecha y monto, loggea, y devuelve `CYCLE_DRIFT` (409). **A5: NO dice "revertido"** (no hay PUT compensatorio; la tarjeta YA cambio en MP), solo "no se pudo verificar de forma segura. No se realizo ningun cobro; contacta a soporte." Un swap nunca cobra.
- Si el GET post-PUT falla (no se pudo verificar): escribe fila auditable `card_change_unverified:${coachId}:${Date.now()}` payload `{ reason: 'post_put_get_failed' }` y SIGUE (la tarjeta ya cambio).

**(8) Limpieza del marcador (A3).** Si `q1Verified` → borra el marcador `card_change_pending:${coachId}` (achica la ventana de no-op del webhook de 15 min a la duracion del swap). Si NO se verifico → lo DEJA (un `preapproval updated` tardio debe seguir siendo no-op para preservar el periodo).

**(9) Persistir el display.** `UPDATE coaches SET card_last4 = last4 (autoritativo), card_brand = brand (cliente), card_payment_method_id = paymentMethodId (cliente) WHERE id = coachId`. Service-role. Si falla, solo warn (es cosmetico).

**(10) Auditoria SERNAC.** Inserta `subscription_events` fila `card_change:${coachId}:${Date.now()}`, `provider_status = card_changed`, payload `{ card_change_terms_version, card_change_terms_text (texto integro), old_status, card_last4, card_brand }`. Una fila por cambio.

Retorna `{ ok: true, last4, brand }`.

### 2.A.6 Codigos de resultado del cambio de tarjeta (tabla)

| `code` | HTTP | Causa | Que ve el coach |
|---|---|---|---|
| (ok) | 200 | swap verificado | redirige a `?card=success` |
| `COACH_NOT_FOUND` | 404 | sin fila coach | error generico |
| `WRONG_PROVIDER` | 409 | provider != MP | "no admite cambio en linea" |
| `NO_ACTIVE_SUBSCRIPTION` | 409 | sin `subscription_mp_id` | "necesitas suscripcion recurrente activa" |
| `UPGRADE_IN_FLIGHT` | 409 | superseded o lock vivo | "completa ese cambio antes" |
| `PREAPPROVAL_TERMINAL` | 409 | canceled/expired | redirige a `reactivateUrl` |
| `INVALID_STATUS` | 409 | estado no permitido | "contacta a soporte" |
| `TOKEN_INVALID` | 400 (retryable) | PUT 400 | "revisa los datos, re-ingresa CVV" |
| `GATEWAY_ERROR` | 502 (retryable) | GET/marker/PUT no-400 | "intenta en unos minutos" |
| `CYCLE_DRIFT` | 409 | el swap movio ciclo/monto | "no se pudo verificar; no hubo cobro; soporte" |
| `TERMS_OUTDATED` | 400 | version de consentimiento vieja | "acepta las condiciones vigentes" |
| `FEATURE_DISABLED` | 403 | flag OFF | (UI ya 404; defensa API) |

### 2.A.7 Evidencia persistida (cambio de tarjeta)

- `coaches.card_last4`, `coaches.card_brand`, `coaches.card_payment_method_id` (display; service-role write-only).
- `subscription_events`: filas `card_change_pending` (transitoria), `card_change` (auditoria final con texto del consentimiento), y posibles `card_change_cycle_drift` / `card_change_unverified`.

---

## 2.B Pantallas de procesamiento (poll tras volver de MercadoPago)

Las tres son `'use client'`, leen el resultado del `back_url` de MP via `useSearchParams`, hacen un confirm sincrono y caen a un poll. Patron comun: confirm inmediato → si activo redirige → sino poll cada N segundos hasta exito o timeout (5 min). El motivo de pollear y NO depender solo del webhook: **el sandbox de MP NO auto-entrega webhooks y los webhooks de prod pueden llegar tarde/faltar**; el confirm sincrono activa el plan/modulo en el acto (espejo idempotente del webhook).

### 2.B.1 `/processing` — `SubscriptionProcessingPage` (alta y reactivacion de plan base)

Es la pantalla mas compleja: cubre el primer checkout del registro (con o sin cupon) Y la vuelta del checkout del plan base.

**Lectura de la URL:**
- `extractPreapprovalId(...)`: busca `preapproval_id` directo, o lo des-anida del param `subscription` (que puede venir URL-encoded con `preapproval_id=` adentro).
- `from === 'register'` → flujo de primer checkout (aun no hay preapproval).
- `coupon` (codigo del cupon del registro), `tier`, `cycle`, `addons` (CSV → array).
- Normalizacion de tier: `starter_lite` → `starter`; `free` → null (los free no usan esta pagina, redirige a dashboard). Para el LABEL valida contra TODO `TIER_CONFIG` (incluye growth/scale legacy) — un grandfathered debe ver su tier real.

**Camino A — primer checkout SIN preapproval (`fromRegister && !preapprovalId`):**
- Sin cupon → `startCheckoutFromRegister()`: `POST /api/payments/create-preference` con `{ tier, billingCycle: cycle, addons? }` → si ok, `window.location.href = checkoutUrl` (a MP). Reintentable.
- Con cupon → `loadCouponPreview()`: `POST /api/payments/redeem-coupon-signup` con `{ code, commit: false }` (PREVIEW, no escribe). Si invalido/no-elegible → NO bloquea, cae a checkout a precio lleno (silencioso). Si ok → muestra el disclosure SERNAC del descuento (`couponPhase='preview'`).
  - El disclosure muestra: `termsText`, "Precio normal" (`baseBeforeDiscountClp`, tachado), "Descuento (`durationLabel`)" (`−discountClp`), "Pagas" (`totalClp`). Todos los montos **server-priced**.
  - **Consentimiento R4.2** = el boton "Confirmar y pagar con descuento" → `confirmCouponAndCheckout()`: `POST redeem-coupon-signup` con `{ commit: true }` (escribe la redencion). Errores `ALREADY_HAS_COUPON`/`ALREADY_REDEEMED` se tratan como exito (reintento). Si el commit falla por red, sigue al checkout igual (reconcile/cron ajusta el cupon). Luego `startCheckoutFromRegister()`.
  - Boton "Continuar sin codigo" → `startCheckoutFromRegister()` directo.

**Camino B — vuelta del checkout (con preapproval o no-register):**
- `confirmNow()`: `POST /api/payments/confirm-subscription` con `{ preapprovalId }` (o body vacio → usa `subscription_mp_id` guardado). Respuestas:
  - `scheduled: true` → `handleScheduled()`: detiene el poll, llama `fetchCurrentPeriodEnd()` (`GET subscription-status` → `coach.current_period_end`) y muestra el estado **"Cambio agendado"** con la fecha del corte (downgrade / cambio de ciclo: el tier vivo NO cambia hasta el corte; pollear seria un timeout falso).
  - `subscriptionStatus === 'active'` → `window.location.href = '/coach/dashboard?subscription=active'`.
- **Poll cada 5s** re-llamando `confirm-subscription` (idempotente) — NO `subscription-status` (la fila del coach solo avanza por el confirm/webhook; el sandbox nunca entrega webhook). 5s (no 3s) para holgura de rate budget; `confirm-subscription` NO esta rate-limited a proposito (su vector de fuerza bruta lo cierra el ownership guard fail-closed).
- **Timeout (5 min):** detiene el poll, hace un ultimo `GET subscription-status`. Si `subscription_status === 'pending_payment'` → mensaje fuerte ("Hubo un problema... vuelve a reactivacion o contacta soporte si el cargo aparece en MP"). Sino → mensaje suave ("esta tardando... haz clic en Verificar acceso"). Setea `canRetry`.

**Estados visibles (funcional):**
- Spinner + chip `tierLabel · cycleLabel` + "Procesando tu suscripcion" / "Esperando confirmacion...".
- "Cambio agendado" (check ✓, fecha del corte, "conservas tu plan actual hasta esa fecha", boton "Volver a mi suscripcion").
- "Confirma tu descuento" (disclosure del cupon).
- Error: "Problema al procesar". Botones: si `fromRegister && !preapprovalId` → "Reintentar" (re-dispara checkout). Sino → "Ir a reactivacion". Siempre hay un link secundario "Ir a reactivacion".

### 2.B.2 `/upgrade-processing` — `UpgradeProcessingPage` (one-shot de upgrade de tier)

**Lectura URL:** `extractPaymentId` = `payment_id` (fallback `collection_id`) del back_url; `tier` objetivo opcional (la pagina de suscripcion lo agrega al success_url para match exacto).

**`confirmNow()`:**
- Sin `paymentId` → no se puede confirmar sincrono; fija `baselineRef = await fetchCurrentTier()` (`GET subscription-status` → `coach.subscription_tier`) y deja que el poll/webhook detecten.
- Con `paymentId` → `POST /api/payments/confirm-upgrade` con `{ paymentId }`:
  - `status === 'active'` → `router.replace('/coach/subscription?upgrade=success')`.
  - Pendiente → "Tu pago esta siendo procesado..." + fija baseline.

**Poll cada 3s:** `fetchCurrentTier()`; `activated = targetTier ? tier === targetTier : (baseline !== null && tier !== baseline)`. Si activo → redirige al success_url. Timeout 5 min → error + `canRetry` ("Volver a mi suscripcion").

**Backend `confirm-upgrade` (resumen money-safety):** resuelve el `payment` por `fetchPaymentSnapshot(paymentId)`; si `status != active` → no activa nada (abandono = tier intacto). Parsea `parseTierUpgradeReference` del `external_reference`; el `ref.coachId` DEBE == `user.id` (anti-escalacion). Guards: sin `subscription_mp_id` → 409; `canceled`/`expired` → NO resucita (P0-4). **REPLAY GUARD:** si ya existe `subscription_events.provider_event_id = tier_upgrade:${paymentId}` → no-op (impide re-jugar un paymentId viejo para regalar tier tras un downgrade). **RANK-GUARD:** solo sube `subscription_tier`/`max_clients`/`billing_cycle` si `getTierRank(currentTier) < getTierRank(ref.newTier)` (idempotente con el webhook). Luego `updateCheckoutAmountAndRef`: PUT del preapproval al **nuevo compuesto** (`getCompositeAmountClp(ref.newTier, ref.cycle, toBillableAddons(live), discountSpec).totalClp`) + reescribe el `external_reference` al nuevo tier|cycle + add-ons vivos (P0-1 stale-ref revert) — sin cobro inmediato (el one-shot ya cobro la diferencia prorrateada). Con cupon vivo → agrega `buildAmountPutIdempotencyKey`. Escribe evento dedup `tier_upgrade:${paymentId}` y `clearUpgradeInFlight`. El `billing_snapshot` lo escribe SOLO el webhook (no compite). NO es self-service-gated (upgrade de tier es billing core).

### 2.B.3 `/addon-processing` — `AddonProcessingPage` (one-shot de add-on)

**Lectura URL:** `payment_id` (fallback `collection_id`).

**`confirmNow()`:**
- Sin `paymentId` → fija `baselineRef = (await fetchLiveModuleKeys()) ?? new Set()` (`GET subscription-status` → `addons[].moduleKey` como Set) y cae al poll.
- Con `paymentId` → `POST /api/payments/confirm-addon` con `{ paymentId }`:
  - `status === 'active'` → `router.replace('/coach/subscription?addon=success')`.
  - Pendiente → "Tu pago esta siendo procesado..." + fija baseline.

**Poll cada 3s:** `fetchLiveModuleKeys()`; `grew = baseline ? live.size > baseline.size : live.size > 0`. Si crecio → redirige. Timeout 5 min → error + "Volver a mi suscripcion".

**Backend `confirm-addon` (resumen):** **gated por `SELF_SERVICE_ADDONS_ENABLED`** (403 `FEATURE_DISABLED` si OFF). Resuelve `fetchPaymentSnapshot`; `status != active` → no otorga nada. `parseOneShotAddonReference(external_reference)` → `ref.coachId == user.id`. Sin `subscription_mp_id` → 409 (backstop; el alta ya bloquea antes de cobrar). `materializeAddonFromOneShot(admin, payments, {coachId, tier, cycle, subscriptionMpId}, ref.moduleKey, ref.termsVersion, paidAt=now)` — **idempotente** via el indice unico parcial `coach_addons_one_live_per_module` (llamarlo dos veces, esta ruta + webhook, no duplica filas ni dispara dos PUT). El `billing_snapshot` lo escribe SOLO el webhook (dedup por `provider_payment_id`).

### 2.B.4 Cuadro comparativo de las tres pantallas

| | `/processing` | `/upgrade-processing` | `/addon-processing` |
|---|---|---|---|
| Id que lee | `preapproval_id` | `payment_id`/`collection_id` | `payment_id`/`collection_id` |
| Endpoint confirm | `confirm-subscription` | `confirm-upgrade` | `confirm-addon` |
| Senal de exito | `subscriptionStatus === 'active'` | tier == target / cambio vs baseline | set de modulos crecio |
| Intervalo poll | 5s | 3s | 3s |
| Estado especial | "Cambio agendado" (scheduled) | — | — |
| Success URL | `/coach/dashboard?subscription=active` | `/coach/subscription?upgrade=success` | `/coach/subscription?addon=success` |
| Timeout | 5 min (consulta status final) | 5 min | 5 min |
| Self-service gate | no | no (billing core) | si (`SELF_SERVICE_ADDONS_ENABLED`) |

---

## 2.C Reactivacion (`/coach/reactivate`) — rescate de churn

Coach sin plan activo (`pending_payment`/`expired`/`canceled`). Compara planes, elige tier/ciclo, re-suma ex-modulos, aplica cupon, opcionalmente activa plan gratuito o ve el puente a EVA Teams.

### 2.C.1 `reactivate.queries.ts` — datos que trae (`getReactivatePageData`, `React.cache`)

- Auth via `getClaims()` (verificacion local del JWT ES256, sin `/user`; el proxy ya valido/refresco). Si no hay user → todo vacio.
- **`Promise.all` de 3 queries:**
  1. `coaches`: `SELECT subscription_tier, subscription_status, max_clients, subscription_mp_id WHERE id = user.id`.
  2. `clients`: `count exact head` de no-archivados del coach → `activeClientCount`.
  3. `listAll(supabase, user.id)` (coach-addons repository, SELECT propio user-scoped via RLS) — tolerante a fallos (`.catch(() => [])`; si falla, reactivacion sigue sin pre-marcado).
- **Calculo de `recentlyCancelledAddons`** (plan 05 F5.6, pre-marca deseleccionable): ventana `RECENT_CANCELLED_WINDOW_DAYS = 60`. `cutoff = now - 60 dias`. `liveKeys` = set de add-ons con `status !== 'cancelled'`. Se incluyen las keys que cumplen TODO: `source === 'self_service'` Y `status === 'cancelled'` Y `!liveKeys.has(key)` (no esta ya activo por otra fila) Y `cancelledAt != null` Y `cancelledAt >= cutoff`. Dedup con `Set`. **El precio NO se hereda** — la fila nueva re-congela el precio de lista vigente al materializar (server-side).
- Retorna `{ user, coach, activeClientCount, recentlyCancelledAddons }`.

`reactivate/page.tsx` (RSC): si no `user` → `redirect('/login')`. Calcula `currentTier` (default `starter`), `subscriptionStatus`, y `couponsEnabled = process.env.COUPON_REDEMPTION_ENABLED === 'true'` (mismo gate fail-closed que el endpoint). Renderiza `ReactivateClient` en `<Suspense>`.

### 2.C.2 `ReactivateClient` — eleccion de plan y precio en vivo

**Tier inicial (`initialTier`, `SaleTier`):** lee `tier` del query (`starter_lite`→`starter`); si es `SaleTier` valido lo usa; sino si `currentTier` es sale-tier lo usa; sino `elite`. **D4: la reactivacion publica NUNCA resucita un tier muerto** (growth/scale). Si el candidato no cubre `activeClientCount`, sube al minimo `SaleTier` que si lo cubra (o `elite`). Solo se ofertan `SALE_TIERS` (free/starter/pro/elite; growth/scale fuera).

**Ciclo inicial:** del query `cycle` si valido, sino `monthly`. Effect: si el ciclo no es permitido para el tier → `getDefaultBillingCycleForTier(tier)`.

**Add-ons seleccionados (`selectedAddons`):** inicializa con `recentlyCancelledAddons` SOLO si `SELF_SERVICE_ADDONS_ENABLED`. Effect de purga: al cambiar de tier, quita `nutrition_exchanges` si el tier no tiene nutricion (D8).

**Precio en vivo (todo client-side, mero display; el COBRO real lo recalcula `create-preference`):**
- `selectedPrice = getTierPriceClp(tier, billingCycle)`.
- `monthlyBase = TIER_CONFIG[tier].monthlyPriceClp`.
- `addonsCycleTotal`: por cada add-on, `gross = ADDON_CONFIG[key].priceClpMensual * months`, descontado `(1 - discountPercent/100)` del `BILLING_CYCLE_CONFIG[billingCycle]`, redondeado. El precio se re-congela a lista VIGENTE en la fila nueva (no hereda el viejo — eso es server-side).
- Total mostrado = `selectedPrice + addonsCycleTotal`.

**Guards de capacidad:**
- `tierBlockedByClients = getTierMaxClients(tier) < activeClientCount` → bloque rojo "Plan insuficiente" ("debes archivar N alumnos", link a `/coach/clients`) + boton de pago deshabilitado.
- `exceedsTopSaleTier = activeClientCount > getTierMaxClients('elite')` → bloque "Tu cartera supera el plan mas alto" → **puente a EVA Teams** (mailto `contacto@eva-app.cl?subject=Quiero conocer EVA Teams`) + pago deshabilitado.

**Comparativa de planes:** tabla con `tierOptions` (label, `TIER_STUDENT_RANGE_LABEL`, `monthlyPriceClp`, `getTierBillingCycleSummary`, `getTierNutritionSummary`). Botones de tier deshabilitan los que no cubren `activeClientCount` (`tooSmall`).

**Seccion "Volver a sumar tus modulos"** (solo `SELF_SERVICE_ADDONS_ENABLED && recentlyCancelledAddons.length > 0`): checkboxes pre-marcados (deseleccionables) de los ex-add-ons; `nutrition_exchanges` se deshabilita si el tier no tiene nutricion ("Requiere un plan con nutricion (Pro o superior)").

### 2.C.3 Acciones de `ReactivateClient`

**`handleCheckout()` (boton "Continuar al pago con Mercado Pago"):**
- `POST /api/payments/create-preference` con `{ tier, billingCycle, addons: selectedAddons? }`.
- Add-ons pre-marcados viajan en el `external_reference` del preapproval nuevo (D4: sin one-shot — el preapproval nace con el ciclo completo compuesto).
- Si ok → `window.location.href = checkoutUrl`. Deshabilitado si `isLoading || tierBlockedByClients || exceedsTopSaleTier`.
- **Backend (reactivacion en `create-preference`):** un coach `canceled`/`expired` cae al **camino compuesto completo** (NO al branch de upgrade activo). `mustUseFreshStart` para `canceled`/`expired` → `reactivationStartDate = now + 60s` (P2.6: no heredar un `start_date` previo de MP). Cancela el preapproval viejo si existe (`superseded`, P0-2/P1-6). Calcula `composite = getCompositeAmountClp(tier, billingCycle, billableAddons, discountSpec)` donde `billableAddons` = add-ons vivos + solicitados (los solicitados con `ADDON_MONTHLY_PRICE_CLP`; los nuevos del body se IGNORAN si `SELF_SERVICE_ADDONS_ENABLED` OFF). `discountSpec` = `resolveActiveDiscountSpec` (cupon vivo desde `coaches.active_coupon_redemption_id`). Guard O1: si `!isChargeableNetClp(amountClp)` (100%-off) → 400 `NET_NOT_CHARGEABLE` (un 100% va por admin_grant, no por MP). Setea `subscription_status = 'pending_payment'`, `subscription_tier`, `billing_cycle`, `max_clients`, `subscription_mp_id`. Success URL → `/coach/subscription/processing`; failure/pending → `/coach/reactivate?payment=failure|pending&tier=...&cycle=...`.

**`confirmSubscription(preapprovalId, silent)` (boton "Ya pague, verificar acceso"):**
- `POST /api/payments/confirm-subscription` con `{ preapprovalId? }`. Si `subscriptionStatus === 'active'` → `/coach/dashboard?subscription=active`. Sino (no silent) → "Tu pago fue creado pero aparece pendiente. Reintenta en unos segundos."
- **Auto-verificacion al volver del checkout exitoso** (`fromSuccessfulCheckout`, detectado de `subscription=success`/`success?preapproval_id=...` en la URL): dispara `confirmSubscription(silent)` + un poll cada 4s de `GET subscription-status`; si `active` → dashboard.
- **Auto-start del checkout** (`from === 'register' && !fromSuccessfulCheckout && !paymentStatus`): dispara `handleCheckout()` automaticamente una vez.
- Backend `confirm-subscription` (relevante a reactivacion): guard que rechaza "Ya pague" con un `subscription_mp_id` viejo cuando el estado es `expired`/`paused` y no vino un `preapproval_id` fresco del redirect (403). El ownership se valida contra el `external_reference` (`parsedRef.coachId == user.id`) o, si el ref es null/legacy, contra el `subscription_mp_id` guardado.

**`handleActivateFree()` (boton "Activar plan gratuito (sin costo)"):**
- Visible si `canActivateFree = activeClientCount <= getTierMaxClients('free') && (subscriptionStatus === 'pending_payment' || subscriptionStatus === 'expired')`.
- `POST /api/payments/activate-free` (sin body) → `/coach/dashboard`.
- **Backend `activate-free`:** `canViewBilling` (solo standalone). Solo estados `pending_payment`/`expired` (403 sino). Re-cuenta clients standalone (`org_id IS NULL`, `is_archived=false`); si `> freeLimit` → 400 con cuanto archivar. **Cancela el preapproval viejo en MP** (best-effort, ignora "already cancelled"). `UPDATE coaches SET subscription_status='active', subscription_tier='free', billing_cycle='monthly', max_clients=freeLimit, subscription_mp_id=null, current_period_end=null`. Inserta `subscription_events` (`activate-free:...`) y `admin_audit_logs` (`coach.activate_free`).

### 2.C.4 `ReactivateCouponCard` — canje de cupon en reactivacion

`'use client'`. Solo se muestra si `couponsEnabled && tier !== 'free'`. Mismo flujo SERNAC que el cupon del registro pero pasando el tier/ciclo ELEGIDOS (`previewTier`/`previewCycle`) para que el precio mostrado = el que cobrara `create-preference` (un coach reactivando sigue en `tier='free'` en DB hasta pagar).

Fases: `idle` → `checking` → `preview` → `applying` → `done`.

- **`onAplicar()`**: `post(false)` = `POST /api/payments/redeem-coupon-signup` con `{ code, commit: false, previewTier, previewCycle }`. Si ok → muestra el `preview` (disclosure bloqueante con focus-trap, role=dialog aria-modal).
- El disclosure muestra `termsText`, "Precio normal" (tachado), "Descuento (`durationLabel`)", "Pagas" (`totalClp`) — server-priced.
- **`onConfirmar()`** (consentimiento): `post(true)` = `{ commit: true }` → escribe la redencion. `phase='done'`, guarda `activeCode`. Mensaje: "El descuento se reflejara en el monto al continuar al pago."
- **Invalidacion:** al cambiar tier/ciclo, un `preview` pre-commit deja de coincidir → se vuelve a `idle` (debe re-aplicar). Una redencion YA confirmada (`activeCode`) es %-based y vale para cualquier plan (`create-preference` recalcula el % sobre el plan final), asi que se conserva.
- Focus-trap: Tab cicla dentro del dialog; Escape cierra.

**Backend `redeem-coupon-signup` (relevante a reactivacion):**
- Guards: auth (con email), `canViewBilling`, `rateLimitCouponRedeem(user.id, ip)` fail-closed, gate `COUPON_REDEMPTION_ENABLED === 'true'` (403 `COUPONS_DISABLED` si OFF) — gate de dinero SEPARADO de `SELF_SERVICE_ADDONS_ENABLED`.
- Zod `RedeemCouponSchema` (`@eva/schemas`).
- Carga coach `subscription_tier, subscription_status, billing_cycle, active_coupon_redemption_id`.
- **Gatea por ESTADO, no por tier:** `PRE_CHECKOUT_STATUSES = {pending_payment, expired, canceled}`. Si el estado no esta ahi → 422 `NO_PENDING_SIGNUP`. (Un coach ACTIVO usa el otro endpoint `/redeem-coupon` que PUTea el descuento al preapproval vivo.)
- Un solo codigo por registro: si `active_coupon_redemption_id` ya existe → 409 `ALREADY_HAS_COUPON`.
- **Pricing del preview:** `pricingTier = previewTier (si es saleTier) ?? persistedTier`; `pricingCycle` = `previewCycle` validado, sino `persistedCycle` validado, sino `getDefaultBillingCycleForTier`. Esto resuelve el problema de que el coach reactivando esta en `free` en DB: se precia sobre el plan elegido.
- `redeemCoupon(admin, {...code, coachId, coachEmail, tier: pricingTier, cycle: pricingCycle, billable: toBillableAddons(listLive), commit})`. El `commit=false` es preview (no escribe); `commit=true` escribe la redencion (`coaches.active_coupon_redemption_id` la apunta via trigger).
- **El descuento NO se PUTea a MP aqui** (no hay preapproval vivo en reactivacion): la redencion queda escrita y el primer checkout (`create-preference`) la threadea sola en el monto (via `resolveActiveDiscountSpec`).
- Mapa de error → HTTP: `CODE_NOT_FOUND` 404; `EXPIRED`/`NOT_ELIGIBLE`/`MODULE_DEFERRED`/`MIN_AMOUNT`/`NET_NOT_CHARGEABLE`/`NO_PENDING_SIGNUP` 422; `ALREADY_REDEEMED`/`CAP_REACHED`/`ALREADY_HAS_COUPON` 409; `INSERT_FAILED` 500.

### 2.C.5 Estados/mensajes de reactivacion segun query param

| Param | Mensaje |
|---|---|
| `reason=subscription_blocked` | "Acceso restringido... al completar el pago recuperaras el acceso." |
| `from=register` | "Cuenta creada. Te falta completar el pago..." (+ auto-start checkout) |
| `payment=failure` | "El pago no se completo. Puedes intentarlo nuevamente." |
| `payment=pending` | "Tu pago quedo pendiente. Espera unos minutos y vuelve a verificar." |
| `subscription=success[?preapproval_id=...]` | auto-confirma + poll (4s) → dashboard |

---

## 2.D Notas de feature-parity (que NO se puede perder al rediseñar)

1. **El gate de dinero es server-side en cada endpoint.** `CHANGE_CARD_ENABLED`, `SELF_SERVICE_ADDONS_ENABLED`, `COUPON_REDEMPTION_ENABLED` se chequean en la API (no solo en la UI). Un rediseño que solo oculte botones NO basta.
2. **El cliente nunca envia montos.** Todo precio (base, add-ons, prorrateo, cupon) lo recalcula el server (`getCompositeAmountClp`, `getTierUpgradeProrationClp`, `resolveActiveDiscountSpec`). La UI solo muestra estimaciones display.
3. **Idempotencia obligatoria** en los confirms: `confirm-subscription`/`confirm-upgrade`/`confirm-addon` son re-llamables por el poll sin doble efecto (rank-guard, replay-guard `tier_upgrade:${paymentId}`, indice unico parcial de coach_addons, supersede-cancel idempotente). El cambio de tarjeta deduplica por la idempotency key sin timestamp.
4. **El swap de tarjeta NO cobra y NO mueve el ciclo** — body de UNA key + guard Q1 (CYCLE_DRIFT) + marcador P0-7 para el webhook. Cualquier rediseño que toque el flujo de cambio de tarjeta debe preservar estas 3 invariantes (es exposicion SERNAC directa).
5. **Consentimiento SERNAC versionado y persistido**: cambio de tarjeta (`CARD_CHANGE_DISCLOSURE.version`, texto integro en `subscription_events`) y cupon (preview→consent bloqueante→commit). El boton de confirmacion ES el consentimiento.
6. **Reactivacion no resucita tiers muertos** (D4: growth/scale fuera de venta → puente a EVA Teams) ni hereda `start_date` viejo (P2.6: fresh start +60s).
7. **El poll es la red de seguridad del sandbox/webhook tardio** — sin el, el sandbox MP nunca activaria nada (no entrega webhooks). Conservar el confirm sincrono + poll en cualquier rediseño.
8. **Pre-marca de ex-modulos** en reactivacion (ventana 60 dias, `self_service` + `cancelled` + no-vivo) con precio RE-congelado a lista vigente, no heredado.
