# Pagos multi-gateway (Flow.cl + MercadoPago) - PLAN

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-07-04
**Spec:** `specs/pagos-multigateway-flow/SPEC.md`

> Rutas relativas a `apps/web/src` salvo que se indique lo contrario.

---

## Architecture

### Principio rector

Flow entra **detras del puerto `PaymentsProvider` ya existente** (`lib/payments/types.ts:153`).
MercadoPago **no se toca**. Todo lo que hoy es provider-agnostico aguas abajo del webhook
(ramas money-safety, dunning, snapshots, entitlements por trigger D1) **se reusa sin cambios**,
alimentado por un `WebhookProcessResult` bien poblado que produce el `FlowProvider`. Flow es una
segunda implementacion del mismo contrato, seleccionable **por request** segun el parametro
`gateway` elegido por el coach.

### Piezas y como enchufan

1. **`FlowProvider implements PaymentsProvider`** (`lib/payments/providers/flow.ts`, molde:
   `providers/stripe.ts`). Implementa los 11 metodos del puerto hablando el REST de Flow
   (fetch crudo, sin SDK, igual que `mercadopago.ts`), con firma HMAC-SHA256 propia de Flow.
   `name` pasa a ser `'mercadopago' | 'stripe' | 'flow'`.

2. **Factory por request** (`lib/payments/provider.ts`). Firma nueva:
   `getPaymentsProvider(gateway?: PaymentProvider): PaymentsProvider`.
   - `gateway === 'flow'` -> `new FlowProvider()`.
   - `gateway === 'mercadopago'` o ausente/invalido -> `new MercadoPagoProvider()` (**default = MP,
     cero regresion**; el env `PAYMENT_PROVIDER` sigue como fallback histrico para `stripe`).
   - El `gateway` **nunca** viaja como monto ni como secreto: es solo un selector validado por Zod
     (`z.enum(['mercadopago','flow'])`) en el endpoint. El monto siempre lo calcula el server
     (`getCompositeAmountClp`).

3. **Enum de dominio** (`domain/coach/types.ts:5`): `PaymentProvider = 'mercadopago' | 'stripe' | 'admin' | 'flow'`.
   `coaches.payment_provider` ya existe y el webhook escribe `provider.name`, asi que Flow persiste
   `'flow'` en esa columna sin migracion de tipo (es `text`).

4. **Pipeline de webhook compartido** (`lib/payments/webhook-pipeline.ts`, **extraido** del actual
   `app/api/payments/webhook/route.ts`). Hoy `handleWebhook` mezcla dos responsabilidades:
   (a) **auth + normalizacion de la notificacion** (especifica de MP: token, HMAC x-signature,
   `extractMercadoPagoNotificationId`), y (b) **el pipeline agnostico** (desde
   `provider.processWebhook(payload)` hacia abajo: idempotencia por `subscription_events`, ramas
   recurring/one-shot/tier-upgrade/refund/canonico, hooks de add-ons, snapshots). Se separan:
   - `runWebhookPipeline(request, { provider, payload, notificationId })` -> el bloque (b) tal cual
     esta hoy, **sin cambios de comportamiento**, reusable por ambas rutas.
   - La ruta MP (`app/api/payments/webhook/route.ts`) conserva su auth MP y llama
     `runWebhookPipeline` con `getPaymentsProvider('mercadopago')`. Comportamiento identico al actual.
   - La ruta Flow (`app/api/payments/flow/webhook/route.ts`, **nueva**) hace su auth Flow, construye
     el payload y llama `runWebhookPipeline` con `getPaymentsProvider('flow')`.

5. **Auth del webhook Flow** (`lib/payments/flow-webhook-authorization.ts`, hermano de
   `webhook-authorization.ts`). Modelo de confianza de Flow: la notificacion entrante es un **POST
   con un unico campo `token`** (el token del pago) al `urlConfirmation` (one-time) o al `urlCallback`
   del plan (recurrente). **No se confia en el body**. La autorizacion real es un **round-trip
   server-to-server**: se llama `payment/getStatus` / `invoice/get` **firmando la peticion con
   nuestro `secretKey`**; la respuesta autenticada es el payload que se pasa a
   `FlowProvider.processWebhook`. Ademas se exige un **token compartido propio** en la URL
   (`?token=<FLOW_WEBHOOK_TOKEN>`, mismo patron que MP), fail-closed en produccion. Sintesis:
   confianza = re-fetch firmado, no el POST crudo.

6. **Normalizacion invoice/payment -> `WebhookProcessResult`** (`providers/flow-normalize.ts`,
   funciones **puras** con tests, invocadas desde `FlowProvider.processWebhook`). Traduce cada forma
   de Flow al result normalizado que el pipeline ya sabe procesar:
   - `invoice status=1` (cobro recurrente pagado) -> `{ eventKind:'payment',
     isRecurringAuthorizedPayment:true, providerStatus:'approved', coachId, providerPaymentId,
     paidAt, currentPeriodEnd }`.
   - `payment/getStatus` de un one-shot (add-on trim/anual o tier-upgrade) -> `{ eventKind:'payment',
     oneShotAddon | tierUpgrade }` parseando `commerceOrder` (== nuestro `externalReference`) con los
     helpers existentes (`parseCheckoutExternalReference`, refs `addon_oneshot|...` / `tier_upgrade|...`).
   - lifecycle de suscripcion (creada / cancelada / vencida) -> `{ eventKind:'preapproval',
     providerAmountClp, providerStatus }`.
   - refund/chargeback -> `{ eventKind:'payment', providerStatus:'refunded'|'charged_back' }`.
   - **Resolucion de coachId** (money-safety): en one-shots viene del `commerceOrder` que nosotros
     controlamos. En cobros recurrentes Flow puede NO traer nuestro ref -> se resuelve por
     `subscriptionId -> coaches.subscription_provider_external_id` o
     `customerId -> coaches.provider_customer_id` (espejo del fallback MP por `preapprovalId`).

### Data flow (respeta clean-arch)

```text
UI (dos botones)  -> POST /api/payments/create-preference { gateway, tier, cycle, addons }
  -> getCompositeAmountClp (services/billing/addons.service)   [monto server-side, unica fuente]
  -> getPaymentsProvider(gateway).createCheckout / createOneShotPayment
  -> Flow REST (customer/plan/subscription | payment)          [infrastructure equivalente]

Flow -> POST /api/payments/flow/webhook { token }
  -> flow-webhook-authorization (token propio + re-fetch firmado)
  -> FlowProvider.processWebhook -> flow-normalize (WebhookProcessResult)
  -> runWebhookPipeline (agnostico)
     -> services/billing/* (insertBillingSnapshot, applyFirstChargeToAddons, materialize...)
     -> coach_addons  -> trigger D1 sync_coach_enabled_modules -> coaches.enabled_modules
```

---

## Mapeo Flow <-> EVA por operacion del puerto

| Metodo del puerto | Operacion(es) Flow | Notas de paridad / money-safety |
|---|---|---|
| `createCheckout` (alta recurrente) | `customer/create` (si no hay `provider_customer_id`) -> `customer/register` (enrola tarjeta via **Webpay**, devuelve url+token = **checkoutUrl** que redirige al coach) -> `plans/create` (idempotente por `planId` deterministico `eva_<tier>_<cycle>`; `amount` = base del tier al ciclo via `getTierPriceClp`; mensual `interval=3`, trimestral `interval_count=3`, anual `interval=4`) -> `subscription/create` (`planId`, `customerId`, `planAdditionalList[]` = add-ons, `couponId?`) | El **total que Flow cobra debe igualar `getCompositeAmountClp`**: base en el plan + cada add-on como item de 9.990/ciclo. `subscriptionId` -> `coaches.subscription_provider_external_id`; `subscription_provider='flow'`. El monto crudo NO se manda: se compone de plan+items para que Flow cobre exactamente el compuesto. Cupon EVA (N ciclos disclosed) -> pin en sandbox (couponId de Flow vs. ajuste de amount). |
| `createOneShotPayment` (proration add-on alta trim/anual, diferencia de tier-upgrade) | `payment/create` (`amount`=amountClp server-side, `commerceOrder`=externalReference, `urlConfirmation`=webhookUrl, `urlReturn`=successUrl) -> url+token = checkoutUrl (**Webpay**) | Muestra Webpay (confianza). `commerceOrder` transporta el ref dedicado; el webhook lo parsea a `oneShotAddon`/`tierUpgrade`. Pin: si conviene `customer/charge` (cargo directo a tarjeta enrolada, sin re-entry) vs. `payment/create` (Webpay visible). v1 = `payment/create`. |
| `processWebhook` | POST `token` -> `payment/getStatus` (one-shot) / `invoice/get` (recurrente) firmado -> `flow-normalize` | Produce `WebhookProcessResult`; todas las ramas del pipeline se reusan. |
| `fetchCheckoutSnapshot` | `subscription/get` | -> `ProviderCheckoutSnapshot { id, status, next_payment_date=proxima invoice due_date, auto_recurring.transaction_amount=monto sub, start_date }`. Lo usa `confirm-subscription` (reconcile sincrono). |
| `fetchPaymentSnapshot` | `payment/getStatus` | -> `{ id, status, external_reference=commerceOrder }`. Lo usa `confirm-addon`. |
| `cancelCheckoutAtProvider` | `subscription/cancel` | Conserva acceso hasta `current_period_end` (la maquina de estados EVA no cambia). |
| `updateCheckoutAmount` (sube/baja el proximo cobro) | Flow no tiene "PUT monto" de la sub: el monto = plan + items + coupon. Se traduce a `subscription/addItem` / `subscription/deleteItem` o `subscription/changePlan` segun el diff | **Punto de mayor impedancia** (ver Ola 5). Caso cupon-expira del webhook (subir al precio lleno) = quitar el descuento (deleteItem/changePlan/coupon). Determinista/idempotente. |
| `updateCheckoutAmountAndRef` | Igual que `updateCheckoutAmount`; el "rewrite del external_reference" es **no-op en Flow** | Flow **elimina la clase de bug MP "stale-ref revert"**: EVA es la fuente de verdad del tier en subs Flow (no se re-deriva de un ref del provider). El tier vive en `coaches`, no en el objeto Flow. |
| `updateCardAtProvider` (cambio de tarjeta) | `customer/register` de nuevo (re-enrola tarjeta via Webpay, **redirect asincrono**) | Divergente de MP (que es token sincrono, Modalidad A). En Flow el cambio de tarjeta es un flujo redirect. El endpoint/UI de change-card **bifurca por gateway**. Pin: `customer/getRegisterStatus`. |
| `fetchCardTokenSummary` | `customer/get` (o `customer/getRegisterStatus`) -> last4 de la tarjeta enrolada | Display-only, best-effort (igual que MP). |
| add-on **sube** total (Ola 5) | `subscription/addItem` (line item en la misma sub viva) | NO cancel+resubscribe. |
| add-on **baja** total (Ola 5) | `subscription/deleteItem` | Prorrateo correcto en la misma sub. |
| cambio de tier (Ola 5) | `subscription/previewChangePlan` (calcula prorrateo) -> `subscription/changePlan` | Espejo del upgrade/downgrade MP. |
| ciclo trimestral | `interval=3 + interval_count=3` | **No nativo**: multiplicador. Pin obligatorio (cobra cada 3 meses real). |
| refund/chargeback | `refund/create` | Dispara la rama refund existente (expira coach + revierte cupon + cancela sub). |
| dunning (reintentos) | `charges_retries_number` (def 3) + `invoice attemp_count`/`chargeAttemps` + `invoice/getOverdue` + `invoice/retry` | Estado terminal tras agotar reintentos = **pin** (past_due vs cancelled). Mapear a `subscription_status` EVA conservando `current_period_end`. |

### Flujo de DOS FASES: registro de tarjeta -> suscripcion (createCheckout) — CORRECCION

⚠️ Supera la fila compacta de `createCheckout` de la tabla. En Flow la tarjeta se registra por
**REDIRECT** (`customer/register` = el coach entra la tarjeta en **Webpay**) ANTES de poder crear la
suscripcion (`subscription/create` exige un `customerId` con tarjeta ya enrolada). Por eso
`createCheckout` **NO es una sola llamada sincrona** como el `init_point` de MP:

- **Fase 1 — `createCheckout` (server):** `customer/create` (solo si no hay `provider_customer_id`) ->
  `customer/register` -> devuelve la **URL de enrolamiento como `checkoutUrl`** (aca el coach ve
  **Webpay** y entra su tarjeta). **La suscripcion NO se crea todavia.** Se persiste `customerId` ->
  `provider_customer_id` (service-role) para la fase 2.
- **Fase 2 — al volver (en `confirm-subscription` / return handler):** `customer/getRegisterStatus`
  (confirma tarjeta OK) -> `plans/create` (idempotente por `planId` deterministico `eva_<tier>_<cycle>`)
  -> `subscription/create` (`planId`, `customerId`, `planAdditionalList[]`, `couponId?`) -> persistir
  `subscriptionId` -> `subscription_provider_external_id`, `planId` -> `provider_plan_id`,
  `subscription_provider='flow'`.
- **Coach con tarjeta YA registrada** (`provider_customer_id` con card activa): se puede saltar la
  Fase 1 y crear la suscripcion directo (sin redirect ni Webpay). Decision UX v1: reusar la tarjeta si
  existe (menos friccion); si se quiere mostrar Webpay siempre, forzar re-registro. Depende del pin T6.4.

**Consecuencia clave:** el `confirm-subscription` de Flow NO solo LEE estado (como el de MP) — ademas
**CREA la suscripcion** post-enrolamiento. Es una divergencia de comportamiento respecto a MP que vive
detras del puerto (MP: confirm lee; Flow: confirm lee + subscribe). El reconcile/cron cubre el caso de
que el coach cierre el navegador tras enrolar la tarjeta pero antes de que corra la fase 2.

### Semantica de items vs. monto (decision Ola 5)

El puerto de hoy es **MP-shaped** (`updateCheckoutAmount` = un unico monto mutable del preapproval).
Flow modela el monto como plan + items + coupon. Para no filtrar logica de gateway a `services/`, se
recomienda **extender el puerto con metodos semanticos** en Ola 5:
`addSubscriptionItem`, `removeSubscriptionItem`, `changeSubscriptionPlan(preview)`.
- **MP** los implementa sobre su `updateCheckoutAmount`/`updateCheckoutAmountAndRef` existentes (el
  monto lo recompone el service con `getCompositeAmountClp`; comportamiento MP intacto).
- **Flow** los implementa nativamente (`addItem`/`deleteItem`/`changePlan`+`previewChangePlan`).
El caso `updateCheckoutAmount` del webhook (cupon-expira) se conserva en el puerto: MP = PUT, Flow =
changePlan/quitar coupon. Asi `services/billing/*` sigue agnostico.

---

## Files

| Action | Path | Notes |
|---|---|---|
| CREATE | `lib/payments/providers/flow.ts` | `FlowProvider implements PaymentsProvider`. Fetch crudo al REST de Flow. |
| CREATE | `lib/payments/providers/flow-signature.ts` (+ `.test.ts`) | Firma HMAC-SHA256 Flow: params orden alfabetico (excl. `s`), concat `nombreValor` sin separador, hex. Vectores de prueba. |
| CREATE | `lib/payments/providers/flow-normalize.ts` (+ `.test.ts`) | Puras: invoice/payment/refund -> `WebhookProcessResult`. Money-safety. |
| CREATE | `lib/payments/flow-webhook-authorization.ts` (+ `.test.ts`) | Token propio + verificacion del round-trip firmado. |
| CREATE | `lib/payments/webhook-pipeline.ts` | `runWebhookPipeline` extraido (agnostico, sin cambio de comportamiento). |
| CREATE | `app/api/payments/flow/webhook/route.ts` | POST+GET -> auth Flow -> `runWebhookPipeline` con provider flow. |
| CREATE | `app/api/cron/flow-reconcile/route.ts` | Backstop diario Flow (espejo de `mp-reconcile`): coaches con `subscription_provider='flow'` -> `invoice/get`/`payment/getStatus`. Protegido por `CRON_SECRET`. |
| CREATE | `supabase/migrations/<ts>_payments_multigateway_flow.sql` | Columnas nuevas + composite unique + grants (ver Data Model). |
| UPDATE | `lib/payments/provider.ts` | Factory por request (`gateway`). |
| UPDATE | `lib/payments/types.ts` | `name: 'mercadopago' | 'stripe' | 'flow'`. |
| UPDATE | `domain/coach/types.ts` | `PaymentProvider += 'flow'`. |
| UPDATE | `app/api/payments/webhook/route.ts` | Usar `runWebhookPipeline` (comportamiento MP identico). |
| UPDATE | `app/api/payments/create-preference/route.ts` | `gateway` en el schema Zod -> `getPaymentsProvider(gateway)`. |
| UPDATE | `app/api/payments/addons/route.ts` | Idem `gateway`. |
| UPDATE | `app/api/payments/confirm-subscription/route.ts`, `confirm-addon/route.ts`, `confirm-upgrade/route.ts` | Elegir provider por `coaches.subscription_provider` (persistido), NO por body. |
| UPDATE | `app/api/payments/cancel-subscription/route.ts`, `addons/cancel/route.ts`, `change-card/route.ts` | Idem: provider por `subscription_provider` guardado. change-card bifurca por gateway. |
| UPDATE | `services/billing/addon-webhook.service.ts` | `insertBillingSnapshot` escribe `provider` y usa `onConflict: 'provider,provider_payment_id'`. |
| UPDATE | `app/coach/subscription/_components/SubscriptionContent.tsx` | Dos botones + `gateway` en el POST (linea ~354). |
| UPDATE | `app/coach/reactivate/ReactivateClient.tsx` | Dos botones + `gateway` (linea ~203). |
| UPDATE | `lib/database.types.ts` | Regenerar tras la migracion. |
| UPDATE | `docs/operations/MANUAL_TASKS.md`, `docs/operations/RUNBOOK.md` | Envs Flow + runbook de reconcile/incidentes. |

---

## Data Model

Migracion **aditiva, forward-only, idempotente** (`IF NOT EXISTS` / `IF EXISTS`, re-ejecutable sin
efectos destructivos — obligatorio por el reset del merge, ver CLAUDE.md).

**`coaches`** (todas **service-role-only**):
- `subscription_provider text NOT NULL DEFAULT 'mercadopago'` — que gateway posee la sub viva.
- `subscription_provider_external_id text` — id generico de la sub (Flow `subscriptionId`; MP sigue
  usando `subscription_mp_id` por compatibilidad).
- `provider_customer_id text` — Flow `cus_xxx` (tarjeta enrolada reusable).
- `provider_plan_id text` — Flow `planId`.

**Gotcha GRANT invertido (critico):** `coaches` usa **grants de UPDATE a nivel de columna**
(allowlist). Una columna **nueva** queda **automaticamente fuera** de la allowlist -> `authenticated`
NO puede escribirla. Aqui el patron habitual se **invierte**: en vez de agregar `GRANT UPDATE(col)`,
**deliberadamente NO lo agregamos** (son compra-only / billing). No hacer nada = correcto y seguro.
La escritura pasa solo por service-role (checkout + webhook + confirm + cron).

**`billing_snapshots`**:
- `provider text NOT NULL DEFAULT 'mercadopago'` — desambigua gateway (evidencia SERNAC).
- **Unique compuesto** `(provider, provider_payment_id)` (resuelve Open Question del SPEC): evita
  colision de ids entre gateways (un id numerico de MP podria chocar con un id de Flow).
  Idempotente: `DROP CONSTRAINT IF EXISTS billing_snapshots_provider_payment_id_key;
  CREATE UNIQUE INDEX IF NOT EXISTS billing_snapshots_provider_paymentid_ux ON billing_snapshots(provider, provider_payment_id);`
  Backfill: filas MP existentes toman `provider='mercadopago'` por el default.
  **Consecuencia de codigo:** todo `onConflict: 'provider_payment_id'` (webhook + `insertBillingSnapshot`)
  pasa a `onConflict: 'provider,provider_payment_id'`. Se cambia en Ola 1 junto con la migracion.
- RLS: intacta (SELECT propio, escritura solo service-role).

**`coach_addons`**: **sin columnas nuevas en v1** (resuelve Open Question del SPEC). Con line-items en
la sub Flow, una columna `provider`/`provider_external_id` por add-on es **redundante**:
`coaches.subscription_provider` ya dice el gateway y el trigger D1 recomputa `enabled_modules` igual.
Se deja como opcion diferida si el reporting lo exige.

**`subscription_events`**: `provider` ya existe (agnostico). Sin cambios de esquema. Los eventos Flow
usan `provider='flow'` y un `provider_event_id` estable namespaced (`flow:invoice:<id>`,
`flow:payment:<flowOrder>`) para la idempotencia por replay.

- DB changes: **migration required** (aditiva).
- RLS impact: **none** (columnas service-role-only; no tocan policies).
- Generated types impact: **update `database.types.ts`** tras la migracion.

---

## Envs (nuevas, separadas por entorno, patron MP)

| Variable | Uso | Donde |
|---|---|---|
| `FLOW_API_KEY` | apiKey (dashboard Flow -> Mis Datos) | Prod/Preview (separadas: sandbox en preview) |
| `FLOW_SECRET_KEY` | secretKey (firma HMAC) | Prod/Preview (separadas) |
| `FLOW_BASE_URL` | `https://sandbox.flow.cl/api` (preview) / `https://www.flow.cl/api` (prod) | Por entorno |
| `FLOW_WEBHOOK_TOKEN` | token compartido propio en `?token=` del callback | All envs |
| `NEXT_PUBLIC_FLOW_ENABLED` | switch de lanzamiento (`'true'` exacto = ON; fail-closed). Build-time inlined -> flip = redeploy. Gatea el boton Flow (cliente) Y la aceptacion de `gateway='flow'` (server). | Opcional (default OFF) |

Ola 0 tambien contempla el **swap del `MERCADOPAGO_ACCESS_TOKEN` a la cuenta MP de la SpA**
(config/ops, ver Fases). La re-inscripcion de subs MP vivas es Ola 7.

---

## Server Actions / endpoints

- **create-preference**: schema Zod suma `gateway: z.enum(['mercadopago','flow']).default('mercadopago')`.
  Con `NEXT_PUBLIC_FLOW_ENABLED` OFF, `'flow'` se rechaza fail-closed (fallback MP o 400). El resto
  intacto: `getCompositeAmountClp` sigue siendo la unica fuente del monto. Revalidacion: N/A (redirige
  a `checkoutUrl`).
- **addons**: idem `gateway`.
- **confirm-subscription / confirm-addon / confirm-upgrade**: provider por `coaches.subscription_provider`
  (persistido en el alta), NO del body -> el reconcile sincrono usa el gateway correcto sin confiar en
  el cliente.
- **cancel-subscription / addons/cancel / change-card**: idem, provider por `subscription_provider`.
- Validacion: Zod v4 cliente + servidor (el `gateway` se valida en ambos).

---

## UI/UX

- **Dos botones** en los 4 flujos (SPEC AC): "Pagar con Webpay (Flow)" y "Pagar con MercadoPago".
  - `SubscriptionContent.tsx` (cambio de plan + add-ons) y `ReactivateClient.tsx` (alta/reactivacion):
    el handler de checkout ya existe (`fetch('/api/payments/create-preference')` ->
    `window.location.href = checkoutUrl`). Se parametriza con `gateway` y se renderizan dos botones que
    llaman al mismo handler con distinto `gateway`.
  - El boton Flow se muestra solo con `NEXT_PUBLIC_FLOW_ENABLED === 'true'` (si OFF, UI = solo MP,
    identica a hoy).
- **Copy legal** junto a los botones: metodo (Webpay via Flow / MercadoPago), que se cobra (base + Σ
  add-ons + descuento), cadencia. Reusar el desglose ya existente; no duplicar montos (server-computed).
- **Mobile viewport**: `h-dvh` / safe-areas (nunca `h-screen` fuera de `md:`). Los botones apilados en
  movil, lado a lado en `md:`.
- **Dark mode**: variantes obligatorias en los botones nuevos.
- **`<Image>`** para cualquier logo de medio de pago (Webpay/MP), nunca `<img>`.
- **Componentes**: route-local primero (viven en `_components/` de cada flujo); atomic solo si se reusa
  en 3+ domains (no es el caso).

---

## Phases (OLAS)

### Ola 0 — Config: cuentas y credenciales (sin codigo)
- **Objetivo:** dejar operativas las credenciales de Flow (sandbox + prod) y la cuenta MP de la SpA.
- **Entregable:** envs `FLOW_*` cargados por entorno (sandbox en preview, prod en produccion); registro
  en `sandbox.flow.cl`; `MERCADOPAGO_ACCESS_TOKEN` de la SpA preparado (el flip productivo y la
  re-inscripcion de subs MP vivas son Ola 7). `NEXT_PUBLIC_FLOW_ENABLED` OFF en prod.
- **DoD:** MP sigue cobrando sin regresion (preview + prod); credenciales Flow validan un ping firmado
  a sandbox.

### GATE Fase 0 (bloqueante, precede a Ola 2)
- Confirmar **empiricamente en sandbox** que Flow presenta el **Webpay REAL** en el checkout
  (SPEC decision 9). Si no lo muestra, la premisa de negocio cae y la feature se replantea.

### Ola 1 — Puerto, factory por request, migracion DB, enum
- **Objetivo:** el andamiaje agnostico listo, MP intacto.
- **Entregable:** `PaymentProvider += 'flow'`; `PaymentsProvider.name` union ampliada; factory por
  `gateway`; migracion aditiva (columnas `coaches`/`billing_snapshots` + composite unique) aplicada
  por el flujo canonico (snapshot + tx-rollback + advisors, sin branches — ver CLAUDE.md);
  `database.types.ts` regenerado; `insertBillingSnapshot` con `provider` + `onConflict` compuesto;
  extraccion de `runWebhookPipeline` (ruta MP re-cableada, **comportamiento identico** verificado).
- **DoD:** `pnpm typecheck` + `pnpm test` verdes; suite MP existente sin regresion; `get_advisors`
  0 criticos.

### Ola 2 — FlowProvider (sandbox): firma + createCheckout/suscripcion
- **Objetivo:** dar de alta una suscripcion recurrente base por Flow en sandbox.
- **Entregable:** `flow-signature.ts` (+ tests con vectores), `flow.ts` con `createCheckout`
  (customer/create -> register -> plans/create -> subscription/create), `createOneShotPayment`
  (payment/create), `fetchCheckoutSnapshot`, `fetchPaymentSnapshot`, `cancelCheckoutAtProvider`.
- **DoD:** alta base end-to-end en sandbox mostrando Webpay real; `subscriptionId`/`customerId`/`planId`
  persistidos; `getCompositeAmountClp` == total que Flow agenda (pin trimestral incluido).

### Ola 3 — Webhook Flow + normalizacion + reconcile
- **Objetivo:** cerrar el lazo de confirmacion sin depender del ACK.
- **Entregable:** `flow-webhook-authorization.ts`, `app/api/payments/flow/webhook/route.ts`,
  `flow-normalize.ts` (+ tests), `flow-reconcile` cron; confirm-subscription/addon/upgrade eligiendo
  provider por `subscription_provider`.
- **DoD:** un cobro recurrente sandbox produce **exactamente un** `billing_snapshot` con `provider='flow'`,
  avanza `current_period_end`, y el modulo se prende via trigger D1; replay del webhook y confirm+webhook
  simultaneos son idempotentes.

### Ola 4 — UI dos botones en todos los flujos
- **Objetivo:** exponer Flow y MP en paralelo (detras del flag).
- **Entregable:** dos botones + `gateway` en `SubscriptionContent.tsx` y `ReactivateClient.tsx`;
  `create-preference`/`addons` aceptan `gateway`; copy legal; dark mode + `dvh`.
- **DoD:** con `NEXT_PUBLIC_FLOW_ENABLED` OFF la UI es identica a hoy; con ON aparecen ambos botones en
  los 4 flujos y ruteo correcto.

### Ola 5 — Add-ons (line-items) + cambio de tier (changePlan)
- **Objetivo:** paridad del ciclo de vida que sube/baja el total y cambia de tier.
- **Entregable:** metodos semanticos del puerto (`addSubscriptionItem`/`removeSubscriptionItem`/
  `changeSubscriptionPlan`) con adapter MP (via PUT) e impl Flow nativa (`addItem`/`deleteItem`/
  `changePlan`+`previewChangePlan`); `updateCheckoutAmount`/`AndRef` de Flow traducidos; change-card
  bifurcado por gateway (re-enroll Flow).
- **DoD:** add/quitar add-on y upgrade/downgrade de tier en sandbox cobran el prorrateo correcto en la
  **misma sub viva** (sin cancel+resubscribe); MP sin regresion.

### Ola 6 — QA money-safety en sandbox (los 5 pins)
- **Objetivo:** cerrar los riesgos empiricos del SPEC.
- **Entregable:** verificacion documentada de: (1) spelling de endpoints inestables (add/delete item,
  invoice getOverdue/retry/outsidePayment, modifyTrial); (2) estado terminal tras agotar
  `charges_retries_number` (past_due vs cancelled) y su mapeo a `subscription_status` conservando
  `current_period_end`; (3) trimestral cobra a 3 meses (1ra y 2da factura); (4) reuso de tarjeta sin
  re-entry (`cus_xxx` reusable); (5) errores `-1`/`-8` via `getStatusExtended` mapeados en el reconcile.
  Ademas: idempotencia (replay + doble confirm), dunning preserva periodo, un snapshot por cobro,
  refund dispara expire+revert cupon.
- **DoD:** los 5 pins resueltos y anotados; matriz money-safety verde en sandbox; E2E Playwright solo
  con autorizacion explicita del CEO (regla de trabajo).

### Ola 7 — Go-live gradual + re-inscripcion MP
- **Objetivo:** habilitar Flow en prod sin arriesgar el rail MP.
- **Entregable:** flip de `NEXT_PUBLIC_FLOW_ENABLED` (redeploy), monitoreo de primeros cobros Flow;
  cutover del `MERCADOPAGO_ACCESS_TOKEN` a la cuenta SpA con **re-inscripcion** de las suscripciones
  MP vivas (protocolo de re-inscribir subs en cuenta nueva, ver memoria stack pagos Chile).
- **DoD:** primer coach real cobra por Webpay/Flow con snapshot+entitlement correctos; subs MP
  re-inscritas siguen renovando; rollback probado (flag OFF).

---

## Test Plan

- **Unit (Vitest):** `flow-signature` (vectores HMAC conocidos); `flow-normalize`
  (invoice paid -> recurring result, payment one-shot -> addon/tier result, refund -> refunded);
  `flow-webhook-authorization` (token invalido, re-fetch no firmado); factory por `gateway`
  (flow/mp/ausente); `getCompositeAmountClp` sin cambios (regresion). Correr por tanda:
  `npx vitest run <archivo>`.
- **Integration / sandbox (Flow):** alta base, one-shot add-on, add/delete item, changePlan, cancel,
  refund; confirm sincrono (`fetchCheckoutSnapshot`/`fetchPaymentSnapshot`); cron reconcile sobre un
  cobro no notificado. Cubre los 5 pins (Ola 6).
- **E2E (Playwright):** los dos botones renderizan y rutean en los 4 flujos con el flag ON.
  **Solo al gate y con autorizacion explicita** (regla de trabajo: E2E/SQL no por tanda).
- **Manual:** pago Webpay real en sandbox de punta a punta; verificar `billing_snapshot`
  (`provider='flow'`, base+addons+total), `coach_addons` prendiendo el modulo via trigger,
  `current_period_end`, dunning (past_due conserva periodo), cancel, refund.
- **DB:** migracion validada con snapshot + tx-rollback + `get_advisors` (0 criticos) antes de prod;
  suite `tests/separation/module-grants.sql` sin drift (las columnas nuevas NO deben aparecer con
  UPDATE para `authenticated`).

---

## Rollback Plan

Revert mas chico y seguro, en capas:

1. **Flag** `NEXT_PUBLIC_FLOW_ENABLED` != `'true'` (redeploy) -> la UI muestra **solo MP** y el server
   fail-closes `gateway='flow'` (fallback MP / 400). Flow queda inalcanzable. Es el kill-switch primario.
2. **Factory:** sin `gateway='flow'` desde el request, el default es MP -> **cero regresion** aun con el
   codigo Flow desplegado.
3. **Webhook Flow:** la ruta `app/api/payments/flow/webhook` puede quedar desplegada sin trafico si no
   hay subs Flow; no afecta a MP (rutas separadas).
4. **Migracion:** aditiva -> **no requiere revert**; las columnas quedan sin uso si Flow esta OFF. El
   composite unique de `billing_snapshots` es superset del anterior (no rompe MP).
5. **Envs:** `FLOW_*` sin setear -> `FlowProvider` falla en la primera llamada, pero nunca se invoca con
   el flag OFF.

Reversa MP (Ola 7): si la re-inscripcion a la cuenta SpA falla, se restaura el `MERCADOPAGO_ACCESS_TOKEN`
anterior (los preapprovals viejos siguen bajo esa cuenta) — cutover reversible por env, sin tocar DB.
