# Pagos multi-gateway (Flow.cl + MercadoPago) - TASKS

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-07-04
**Spec:** `specs/pagos-multigateway-flow/SPEC.md`
**Plan:** `specs/pagos-multigateway-flow/PLAN.md`

> Rutas relativas a `apps/web/src` salvo que se indique lo contrario.
> Tareas atomicas agrupadas por Ola (siguen las fases del PLAN). Cada tarea: checkbox, archivo(s) reales, y Definition of Done.

---

## Dependencias entre olas

```
Ola 0 (config) ───┐
                  ▼
            GATE Fase 0 (Webpay REAL en sandbox) ── BLOQUEANTE ──┐
                                                                 │
Ola 1 (puerto/factory/migracion/enum) ── no depende del GATE ───┘ (puede ir en paralelo a Ola 0/GATE)
                  ▼
Ola 2 (FlowProvider alta) ── REQUIERE GATE Fase 0 OK + Ola 1
                  ▼
Ola 3 (webhook + normalize + reconcile) ── REQUIERE Ola 2
                  ▼
Ola 4 (UI dos botones) ── REQUIERE Ola 1 (schema `gateway`); QA real REQUIERE Ola 3
                  ▼
Ola 5 (add-ons line-items + changePlan) ── REQUIERE Ola 2 + Ola 3
                  ▼
Ola 6 (QA money-safety, los 5 pins) ── REQUIERE Ola 5
                  ▼
Ola 7 (go-live + re-inscripcion MP) ── REQUIERE Ola 6 verde + autorizacion CEO
```

---

## Ola 0 — Config: cuentas y credenciales (sin codigo)

- [ ] T0.1 - Registrar cuenta sandbox de Flow y obtener credenciales
  - Scope: alta en `sandbox.flow.cl/app/web/register.php`; capturar `apiKey` + `secretKey` desde dashboard -> Mis Datos.
  - Verification: credenciales guardadas en gestor de secretos del equipo (NO en repo); ping firmado a `https://sandbox.flow.cl/api` responde 200.
- [ ] T0.2 - Cargar envs `FLOW_*` por entorno en Vercel
  - Scope: `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_BASE_URL` (sandbox en Preview / prod en Production), `FLOW_WEBHOOK_TOKEN` (all envs). `NEXT_PUBLIC_FLOW_ENABLED` sin setear (OFF) en todos los entornos.
  - Verification: `vercel env ls` muestra las 5 vars con scope correcto (Preview=sandbox, Production=prod); ningun secreto en `.env` versionado.
- [ ] T0.3 - Documentar envs Flow en MANUAL_TASKS
  - Scope: `docs/operations/MANUAL_TASKS.md` (§MT nueva) — tabla de envs Flow + instrucciones de rotacion; nota de que `NEXT_PUBLIC_FLOW_ENABLED` es build-time inlined (flip = redeploy, fail-closed).
  - Verification: doc actualizado; incluido en el PR de Ola 0.
- [ ] T0.4 - Preparar `MERCADOPAGO_ACCESS_TOKEN` de la cuenta MP de la SpA (sin flip)
  - Scope: dejar el token de la SpA listo en el gestor de secretos; NO cambiar el env productivo aun (el cutover + re-inscripcion de subs MP vivas es Ola 7).
  - Verification: token SpA validado con un GET firmado read-only a MP sandbox; documentado el paso de cutover en RUNBOOK como pendiente Ola 7.

**DoD transversal Ola 0:** MP sigue cobrando sin regresion en Preview y Prod; credenciales Flow validan un ping firmado a sandbox; cero secretos hardcodeados en el repo.

---

## GATE Fase 0 — Webpay REAL (BLOQUEANTE, precede a Ola 2)

- [ ] G0.1 - Confirmar empiricamente que Flow presenta Webpay REAL en checkout sandbox
  - Scope: crear un `payment/create` firmado a mano contra sandbox (curl/script en scratchpad, NO codigo del repo) y abrir la `url` devuelta; verificar que el checkout de Flow ofrece **Webpay** como medio real.
  - Verification: captura del checkout mostrando Webpay; anotar en `specs/pagos-multigateway-flow/` el resultado del gate. **Si NO muestra Webpay real: STOP** — la premisa de negocio (confianza chilena) cae y la feature se replantea con el CEO antes de continuar.

**DoD GATE:** resultado documentado (OK/NO-GO). Ola 2 no arranca sin OK explicito.

---

## Ola 1 — Puerto, factory por request, migracion DB, enum

> No depende del GATE; puede ir en paralelo a Ola 0. MP debe quedar intacto.

- [ ] T1.1 - Agregar `'flow'` al enum de dominio `PaymentProvider`
  - Scope: `domain/coach/types.ts:5` -> `PaymentProvider = 'mercadopago' | 'stripe' | 'admin' | 'flow'`.
  - Verification: `pnpm typecheck` verde; grep confirma que no hay `switch` exhaustivo roto por el nuevo miembro.
- [ ] T1.2 - Ampliar la union `name` del puerto
  - Scope: `lib/payments/types.ts:154` -> `name: 'mercadopago' | 'stripe' | 'flow'`.
  - Verification: `pnpm typecheck` verde.
- [ ] T1.3 - Factory por request en `getPaymentsProvider`
  - Scope: `lib/payments/provider.ts` -> firma `getPaymentsProvider(gateway?: PaymentProvider): PaymentsProvider`. `gateway==='flow'` -> `new FlowProvider()` (import perezoso / stub temporal hasta Ola 2); `'mercadopago'` o ausente/invalido -> `MercadoPagoProvider` (default = MP, cero regresion; `PAYMENT_PROVIDER` sigue como fallback historico de stripe).
  - Verification: test unitario del factory (`provider.test.ts`) — flow/mp/ausente/invalido devuelven la clase correcta; `pnpm typecheck` verde.
- [ ] T1.4 - Escribir migracion aditiva DB
  - Scope: `supabase/migrations/<ts>_payments_multigateway_flow.sql`. `coaches`: `subscription_provider text NOT NULL DEFAULT 'mercadopago'`, `subscription_provider_external_id text`, `provider_customer_id text`, `provider_plan_id text` (todas `IF NOT EXISTS`, service-role-only, **SIN** `GRANT UPDATE` a `authenticated` — grant invertido a proposito). `billing_snapshots`: `provider text NOT NULL DEFAULT 'mercadopago'`; **SOLO AGREGAR** el unique compuesto (`CREATE UNIQUE INDEX IF NOT EXISTS billing_snapshots_provider_paymentid_ux ON billing_snapshots(provider, provider_payment_id)`) **SIN dropear** el UNIQUE simple `billing_snapshots_provider_payment_id_key` (money-safety: código y migración son relojes no atómicos; dropear deja ventana de pérdida silenciosa — ver PLAN §Data Model. Con Flow OFF ambos índices coexisten. El DROP se difiere a Ola 7 → T7.5). `coach_addons`: sin columnas nuevas en v1.
  - Verification: migracion **idempotente** (re-ejecutable sin error/efecto destructivo); revisada localmente con `EXPLAIN`/dry-run; sin DROP/rename destructivo.
- [x] T1.5 - Aplicar migracion por flujo canonico y regenerar tipos ✅ 2026-07-05
  - Scope: aplicar via snapshot prod (`_bak_*`) + tx-rollback + `get_advisors` (sin branches, ver CLAUDE.md); `npx supabase db pull`; regenerar `lib/database.types.ts`.
  - Verification: `get_advisors` (security+performance) 0 criticos; `database.types.ts` muestra las columnas nuevas; suite `tests/separation/module-grants.sql` **sin drift** (las columnas nuevas NO aparecen con UPDATE para `authenticated`).
  - HECHO: MCP Supabase — snapshot _bak (31 coaches + 2 snapshots) → apply_migration aditiva (sin DROP) → verificado cero perdida + backfill 'mercadopago' + constraint simple viva + indice compuesto + sin UPDATE grant en cols nuevas → advisors 0 criticos (los 2 ERROR eran las _bak, dropeadas) → types regenerados (insercion quirurgica) + casts Ola 1 limpiados. 265 tests verdes.
- [ ] T1.6 - `insertBillingSnapshot` con `provider` + onConflict compuesto
  - Scope: `services/billing/addon-webhook.service.ts` — `insertBillingSnapshot` escribe `provider` y usa `onConflict: 'provider,provider_payment_id'`. Barrer cualquier otro `onConflict: 'provider_payment_id'` (webhook route) al compuesto.
  - Verification: `pnpm test` de `addon-webhook.service` verde; grep confirma cero `onConflict: 'provider_payment_id'` residual.
- [ ] T1.7 - Extraer `runWebhookPipeline` (agnostico) sin cambio de comportamiento
  - Scope: crear `lib/payments/webhook-pipeline.ts` con `runWebhookPipeline(request, { provider, payload, notificationId })` = bloque (b) actual de `app/api/payments/webhook/route.ts` (idempotencia `subscription_events`, ramas recurring/one-shot/tier-upgrade/refund/canonico, hooks add-ons, snapshots). Re-cablear `app/api/payments/webhook/route.ts` para conservar su auth MP y llamar `runWebhookPipeline(getPaymentsProvider('mercadopago'), ...)`.
  - Verification: **comportamiento MP identico** — la suite de webhook MP existente pasa sin cambios; diff no altera logica de las ramas, solo extrae.

**DoD transversal Ola 1:** `pnpm typecheck` verde; `pnpm test` de archivos tocados verde; suite MP existente sin regresion; migracion idempotente + grant correcto (columnas billing FUERA de allowlist); `get_advisors` 0 criticos; cero secretos hardcodeados.

---

## Ola 2 — FlowProvider (sandbox): firma + createCheckout/suscripcion

> REQUIERE GATE Fase 0 OK + Ola 1.

- [ ] T2.1 - Firma HMAC-SHA256 de Flow
  - Scope: `lib/payments/providers/flow-signature.ts` (+ `.test.ts`). Params orden alfabetico (excluye `s`), concatenar `nombreValor` sin separador, HMAC-SHA256 con `secretKey`, hex como param `s`. Helpers para GET (query+s) y POST (body form-urlencoded+s).
  - Verification: `.test.ts` con vectores conocidos (orden alfabetico, exclusion de `s`, concat sin separador); `npx vitest run lib/payments/providers/flow-signature.test.ts` verde.
- [ ] T2.2 - Esqueleto `FlowProvider implements PaymentsProvider`
  - Scope: `lib/payments/providers/flow.ts` (molde `providers/stripe.ts`). Cliente REST fetch crudo (sin SDK, base = `FLOW_BASE_URL`) firmando cada request con T2.1. `name='flow'`. Metodos aun-no-implementados lanzan `NotImplemented` explicito (se completan en Ola 3/5).
  - Verification: `pnpm typecheck` verde (satisface la interface completa); factory de T1.3 instancia `FlowProvider` sin error.
- [ ] T2.3a - `createCheckout` FASE 1 (registro de tarjeta -> checkoutUrl)
  - Scope: en `flow.ts`: `customer/create` (solo si no hay `provider_customer_id`) -> `customer/register` -> devolver la **URL de enrolamiento como `checkoutUrl`** (el coach ve **Webpay** y entra su tarjeta). Persistir `customerId` -> `coaches.provider_customer_id` (service-role). **NO crear la suscripcion aun** (ver Flujo de dos fases del PLAN). Coach con `provider_customer_id` + card activa: puede saltar a Fase 2 directo (pin T6.4).
  - Verification: en sandbox, `createCheckout` de un coach nuevo devuelve una `checkoutUrl` que muestra **Webpay real** para enrolar tarjeta; `provider_customer_id` persistido; suscripcion aun NO creada.
- [ ] T2.3b - `createCheckout` FASE 2 (post-enrolamiento -> suscripcion) en confirm-subscription
  - Scope: en `flow.ts` + `app/api/payments/confirm-subscription/route.ts`: al volver del enrolamiento, `customer/getRegisterStatus` (confirma tarjeta) -> `plans/create` (idempotente por `planId` deterministico `eva_<tier>_<cycle>`; `amount`=`getTierPriceClp(tier,cycle)`; mensual `interval=3`, trimestral `interval=3`+`interval_count=3`, anual `interval=4`) -> `subscription/create` (`planId`, `customerId`, `planAdditionalList[]`=add-ons, `couponId?`). Persistir `subscriptionId`->`subscription_provider_external_id`, `planId`->`provider_plan_id`, `subscription_provider='flow'` (service-role). **Divergencia vs MP:** el confirm de Flow ADEMAS de leer, CREA la sub; el cron reconcile cubre el coach que cierra el navegador antes de la fase 2.
  - Verification: alta base end-to-end en sandbox: tras enrolar tarjeta, la sub se crea y el **total que Flow agenda == `getCompositeAmountClp`** (base plan + cada add-on 9.990/ciclo como item); ids persistidos; el monto NO se manda crudo (se compone de plan+items).
- [ ] T2.4 - `createOneShotPayment` (proration alta trim/anual, diferencia tier-upgrade)
  - Scope: en `flow.ts`: `payment/create` (`amount`=amountClp server-side, `commerceOrder`=externalReference, `urlConfirmation`=webhookUrl, `urlReturn`=successUrl) -> url+token = checkoutUrl (Webpay). v1 usa `payment/create` (Webpay visible), NO `customer/charge`.
  - Verification: one-shot en sandbox muestra Webpay; `commerceOrder` transporta el ref dedicado (`addon_oneshot|...` / `tier_upgrade|...`) parseable por los helpers existentes.
- [ ] T2.5 - `fetchCheckoutSnapshot` / `fetchPaymentSnapshot` / `cancelCheckoutAtProvider`
  - Scope: en `flow.ts`: `fetchCheckoutSnapshot` -> `subscription/get` -> `ProviderCheckoutSnapshot{ id, status, next_payment_date=proxima invoice due_date, auto_recurring.transaction_amount, start_date }`; `fetchPaymentSnapshot` -> `payment/getStatus` -> `{ id, status, external_reference=commerceOrder }`; `cancelCheckoutAtProvider` -> `subscription/cancel` (conserva acceso hasta `current_period_end`).
  - Verification: snapshots mapeados correctamente contra respuestas reales de sandbox; cancel deja la sub cancelada en Flow sin adelantar fin de periodo en EVA.

**DoD transversal Ola 2:** `pnpm typecheck` + `pnpm test` (flow-signature) verdes; alta base end-to-end en sandbox con Webpay real; `subscriptionId`/`customerId`/`planId` persistidos; `getCompositeAmountClp` == total agendado (pin trimestral incluido, ver T6.3); cero secretos hardcodeados (todo por env).

---

## Ola 3 — Webhook Flow + normalizacion + reconcile

> REQUIERE Ola 2.

- [x] T3.1 - Auth del webhook Flow (round-trip firmado) ✅ 2026-07-05 (9 tests; gate + extractFlowToken)
  - Scope: `lib/payments/flow-webhook-authorization.ts` (+ `.test.ts`). Exigir `?token=<FLOW_WEBHOOK_TOKEN>` (fail-closed en prod). **No confiar en el body**: la autorizacion real es re-fetch firmado (`payment/getStatus`/`invoice/get`) — la respuesta autenticada es el payload.
  - Verification: `.test.ts` — token invalido/ausente rechaza (fail-closed prod); el payload de confianza proviene del re-fetch firmado, no del POST crudo; `npx vitest run` verde.
- [x] T3.2 - Normalizacion invoice/payment/refund -> `WebhookProcessResult` (puras) ✅ Ola 2 (flow-normalize) + parseFlowRecurringCommerceOrder Ola 3
  - Scope: `lib/payments/providers/flow-normalize.ts` (+ `.test.ts`). Funciones puras: `invoice status=1` -> `{eventKind:'payment', isRecurringAuthorizedPayment:true, providerStatus:'approved', coachId, providerPaymentId, paidAt, currentPeriodEnd}`; `payment/getStatus` one-shot -> `oneShotAddon|tierUpgrade` (parsea `commerceOrder` con `parseCheckoutExternalReference`); lifecycle sub -> `{eventKind:'preapproval', providerAmountClp, providerStatus}`; refund/chargeback -> `{eventKind:'payment', providerStatus:'refunded'|'charged_back'}`. **Resolucion coachId:** one-shots via `commerceOrder`; recurrentes via `subscriptionId -> coaches.subscription_provider_external_id` o `customerId -> coaches.provider_customer_id`.
  - Verification: `.test.ts` cubre cada forma (invoice paid, one-shot addon, one-shot tier, sub lifecycle, refund) + resolucion de coachId por ambos fallbacks; `npx vitest run flow-normalize.test.ts` verde.
- [x] T3.3 - `FlowProvider.processWebhook` ✅ 2026-07-05 (re-fetch firmado + coachId por DB; 6 tests; panel-fix: throw ante error de lookup)
  - Scope: en `flow.ts`: POST `token` -> `payment/getStatus`/`invoice/get` firmado -> `flow-normalize` -> `WebhookProcessResult`. Discrimina one-shot (ref propio) vs recurrente (ref Flow sus_<subId>_<invId>_ → resolveCoachIdBySubscriptionId por DB).
  - Verification: dado un token de sandbox, produce un `WebhookProcessResult` bien poblado que el pipeline procesa; idempotencia por `provider_event_id`.
- [x] T3.4 - Ruta webhook Flow ✅ 2026-07-05 (auth + parseo urlencoded + delega pipeline; 4 tests)
  - Scope: `app/api/payments/flow/webhook/route.ts` (POST+GET) -> auth Flow (T3.1) -> construye payload -> `runWebhookPipeline(getPaymentsProvider('flow'), ...)`. Ruta separada de la de MP (aislamiento).
  - Verification: un cobro recurrente sandbox produce **exactamente un** `billing_snapshot` con `provider='flow'`, avanza `current_period_end`, y prende el modulo via trigger D1; replay del webhook y confirm+webhook simultaneos son idempotentes. (⚠️ el e2e completo del cobro recurrente entrante = PIN Ola 6: falta capturar el payload real del urlCallback recurrente.)
- [x] T3.5 - Cron reconcile Flow (backstop diario) ✅ 2026-07-05 (ALERT-ONLY, 6 tests; revisar en proximo gate)
  - Scope: `app/api/cron/flow-reconcile/route.ts` (espejo de `mp-reconcile`, ALERT-ONLY nunca auto-fix). Coaches con `subscription_provider='flow'` -> `fetchCheckoutSnapshot` firmado -> alerta divergencia de estado + periodo-no-avanzado (webhook perdido). Protegido por `CRON_SECRET`.
  - Verification: 401 sin `CRON_SECRET`; detecta divergencia de estado y de periodo; un fetch que tira no tumba el cron. (Auto-reconcile snapshot+periodo = refinamiento futuro; el primer corte alerta, no auto-escribe.)
- [~] T3.6 - confirm-* eligen provider por `subscription_provider` (no por body) — PARCIAL: helper `getPaymentsProviderForCoach` HECHO + tests; cableado de rutas confirm-*/cancel/change-card = Ola 4/5 (el confirm-subscription de Flow ademas CREA la sub, flujo de dos fases)
  - Scope: `lib/payments/provider.ts` helper por `coaches.subscription_provider` persistido, NUNCA del body. Cableo de rutas cuando esas rutas tengan logica Flow (Ola 4/5).
  - Verification: helper cubre flow/mercadopago/null; default MP = cero regresion con Flow OFF.
- [ ] T3.7 - ⚠️ MONEY-SAFETY: refund/chargeback de Flow DEBE cancelar la sub en el provider (panel Ola 2, D1)
  - Scope: en la ruta/processWebhook de Flow, ante un refund `refunded` (o chargeback), llamar EXPLICITAMENTE `provider.cancelCheckoutAtProvider(coach.subscription_provider_external_id)` (= Flow `subscription/cancel`) + escribir la fila de auditoria `coach.payment_refunded_or_chargeback`, ANTES de que el pipeline expire al coach y nulee sus ids. Motivo: el camino canonico de expire NO cancela en el provider, y la rama FIX-7 es MP-shaped (matchea `subscription_mp_id`, columna que un coach Flow NO tiene) → INALCANZABLE para Flow. Sin esto, la sub Flow sigue VIVA y RE-COBRA la tarjeta el proximo ciclo (P1-3). Ver docstring de `normalizeFlowRefund`.
  - Verification: test que dado un refund `refunded` de un coach Flow, se llama `subscription/cancel` en Flow + se escribe la fila de auditoria + el coach queda expired; NO se re-cobra el proximo ciclo (reconcile no revive).

**DoD transversal Ola 3:** `pnpm typecheck` + `pnpm test` (flow-normalize, flow-webhook-authorization) verdes; un cobro recurrente = un snapshot `provider='flow'` + avance de periodo + modulo prendido por trigger; replay/doble-confirm idempotentes; cron reconcile funcional; cero secretos hardcodeados.

---

## Ola 4 — UI dos botones en todos los flujos

> REQUIERE Ola 1 (schema `gateway`). QA real de checkout REQUIERE Ola 3.

- [ ] T4.1 - `gateway` en el schema Zod de create-preference
  - Scope: `app/api/payments/create-preference/route.ts` — schema suma `gateway: z.enum(['mercadopago','flow']).default('mercadopago')` -> `getPaymentsProvider(gateway)`. Con `NEXT_PUBLIC_FLOW_ENABLED` OFF, `'flow'` se rechaza fail-closed (fallback MP o 400). `getCompositeAmountClp` sigue siendo la unica fuente del monto.
  - Verification: Zod valida `gateway` en servidor; `'flow'` con flag OFF => rechazado; sin `gateway` => MP; `pnpm test` del route verde.
- [ ] T4.2 - `gateway` en el schema Zod de addons
  - Scope: `app/api/payments/addons/route.ts` — idem `gateway` + fail-closed con flag OFF.
  - Verification: mismo criterio que T4.1 aplicado a addons.
- [ ] T4.3 - Dos botones en `SubscriptionContent` (cambio plan + add-ons)
  - Scope: `app/coach/subscription/_components/SubscriptionContent.tsx` (~L354) — parametrizar el handler de checkout con `gateway`; renderizar "Pagar con Webpay (Flow)" y "Pagar con MercadoPago" llamando al mismo handler con distinto `gateway`. Boton Flow solo si `NEXT_PUBLIC_FLOW_ENABLED === 'true'`. Copy legal (metodo + base+Σaddons+descuento + cadencia), reusando el desglose existente (server-computed, no duplicar montos). `<Image>` para logos Webpay/MP.
  - Verification: con flag OFF UI identica a hoy (solo MP); con ON aparecen ambos botones y rutean con el `gateway` correcto; movil = apilados, `md:` = lado a lado; `h-dvh`/safe-areas; dark mode.
- [ ] T4.4 - Dos botones en `ReactivateClient` (alta/reactivacion/signup)
  - Scope: `app/coach/reactivate/ReactivateClient.tsx` (~L203) — mismo patron de dos botones + `gateway` + flag + copy legal + `<Image>`.
  - Verification: mismos criterios que T4.3 para el flujo de alta/reactivacion; auto-checkout respeta el `gateway` elegido.

**DoD transversal Ola 4:** `pnpm typecheck` + `pnpm test` verdes; **dos botones visibles** en los 4 flujos con flag ON; UI identica a hoy con flag OFF; `h-dvh` (no `h-screen` fuera de `md:`), `<Image>` (no `<img>`), dark mode; Zod cliente+servidor valida `gateway`; cero secretos hardcodeados.

---

## Ola 5 — Add-ons (line-items) + cambio de tier (changePlan)

> REQUIERE Ola 2 + Ola 3.

- [ ] T5.1 - Extender el puerto con metodos semanticos
  - Scope: `lib/payments/types.ts` — agregar `addSubscriptionItem`, `removeSubscriptionItem`, `changeSubscriptionPlan(preview?)` al puerto `PaymentsProvider`. Mantener `updateCheckoutAmount`/`updateCheckoutAmountAndRef` para el caso cupon-expira del webhook.
  - Verification: `pnpm typecheck` verde; interface documentada; ambos providers deben implementarla (fuerza T5.2/T5.3).
- [ ] T5.2 - Adapter MP de los metodos semanticos
  - Scope: `lib/payments/providers/mercadopago.ts` — implementar `addSubscriptionItem`/`removeSubscriptionItem`/`changeSubscriptionPlan` sobre el `updateCheckoutAmount`/`updateCheckoutAmountAndRef` existente (el monto lo recompone el service con `getCompositeAmountClp`). Comportamiento MP intacto.
  - Verification: `pnpm test` MP sin regresion; los metodos nuevos producen el mismo PUT-de-monto que hoy.
- [ ] T5.3 - Impl Flow nativa de los metodos semanticos
  - Scope: `lib/payments/providers/flow.ts` — `addSubscriptionItem` -> `subscription/addItem`; `removeSubscriptionItem` -> `subscription/deleteItem`; `changeSubscriptionPlan` -> `subscription/previewChangePlan` (prorrateo) + `subscription/changePlan`. `updateCheckoutAmount`/`AndRef` de Flow: el "AndRef" es **no-op** (EVA es fuente de verdad del tier, elimina el bug MP stale-ref); el "amount" se traduce a addItem/deleteItem/changePlan/quitar-coupon segun el diff. NO cancel+resubscribe.
  - Verification: add/quitar add-on y upgrade/downgrade de tier en sandbox cobran el prorrateo correcto en la **misma sub viva**; spelling de `addItem`/`deleteItem`/`changePlan` confirmado (ver T6.1).
- [ ] T5.4 - Endpoints de add-ons/cancel/cambio eligen provider por `subscription_provider`
  - Scope: `app/api/payments/addons/route.ts`, `addons/cancel/route.ts`, `cancel-subscription/route.ts` — provider por `coaches.subscription_provider` guardado, no por body; ruteo a los metodos semanticos.
  - Verification: sub Flow usa metodos Flow; sub MP usa MP; sin regresion.
- [ ] T5.5 - change-card bifurca por gateway
  - Scope: `app/api/payments/change-card/route.ts` (+ UI de change-card) — `updateCardAtProvider` MP = token sincrono (Modalidad A, intacto); Flow = `customer/register` re-enroll (redirect asincrono). El endpoint/UI bifurca por `subscription_provider`.
  - Verification: change-card de una sub Flow inicia el flujo redirect de re-enroll; MP conserva su flujo sincrono; `pnpm typecheck` verde.

**DoD transversal Ola 5:** `pnpm typecheck` + `pnpm test` verdes; add/quitar add-on y upgrade/downgrade cobran prorrateo correcto en la misma sub viva (sin cancel+resubscribe); MP sin regresion; `services/billing/*` sigue agnostico (sin logica de gateway filtrada); cero secretos hardcodeados.

---

## Ola 6 — QA money-safety en sandbox (los 5 pins)

> REQUIERE Ola 5. E2E Playwright/SQL solo con autorizacion explicita del CEO (regla de trabajo).

- [ ] T6.1 - PIN spelling de endpoints inestables
  - Scope: verificar contra sandbox el spelling exacto de `subscription/addItem`, `subscription/deleteItem`, `invoice/getOverdue`, `invoice/retry`, `invoice/outsidePayment`, `subscription/modifyTrialPeriod` (docs inconsistentes). Corregir `flow.ts` si difiere.
  - Verification: cada endpoint responde (no 404/param error) en sandbox; spelling final anotado en el SPEC/PLAN; `flow.ts` alineado.
- [ ] T6.2 - PIN estado terminal tras agotar reintentos
  - Scope: provocar el agotamiento de `charges_retries_number` (def 3) en sandbox; observar estado terminal real de la sub (past_due vs cancelled). Mapear a `subscription_status` de EVA **conservando `current_period_end`** (dunning inline del webhook).
  - Verification: estado terminal documentado; el mapeo preserva `current_period_end` (no adelanta/retrocede); Open Question del SPEC cerrada.
- [ ] T6.3 - PIN ciclo trimestral cobra a 3 meses
  - Scope: verificar en sandbox que `interval=3 + interval_count=3` (multiplicador, no nativo) produce 1ra y 2da factura a 3 meses reales.
  - Verification: cadencia confirmada en sandbox; si NO cobra cada 3 meses, buscar el mapeo correcto ANTES de exponer el ciclo trimestral en UI.
- [ ] T6.4 - PIN reuso de tarjeta sin re-entry
  - Scope: verificar que `customer/create` + `customer/register` producen un `cus_xxx` reusable en `subscription/create` y en add-ons sin re-ingresar tarjeta.
  - Verification: una segunda operacion (add-on/sub nueva) reusa `provider_customer_id` sin re-enroll; documentado.
- [ ] T6.5 - PIN codigos de error -1 / -8
  - Scope: reproducir `-1` (firma invalida) y `-8` (expirada) via `payment/getStatusExtended` (`lastError`); mapearlos a manejo explicito en el reconcile.
  - Verification: ambos codigos reproducidos y mapeados a error handling explicito (no silencioso) en `flow-reconcile` / `flow-normalize`.
- [ ] T6.6 - Matriz money-safety en sandbox
  - Scope: verificar de punta a punta: idempotencia (replay del webhook + doble confirm no duplican snapshot ni periodo); dunning preserva periodo; **un** snapshot por cobro (`provider='flow'`, base+addons+total); refund dispara expire coach + revert cupon + cancel sub; entitlement por trigger D1 (sin escritura directa al jsonb).
  - Verification: matriz documentada verde; cada rama observada en sandbox con evidencia (snapshot rows, estado coach, coach_addons).

**DoD transversal Ola 6:** los 5 pins resueltos y anotados en el SPEC (Open Questions cerradas); matriz money-safety verde en sandbox; `pnpm typecheck` + `pnpm test` verdes; E2E Playwright solo con OK explicito del CEO.

---

## Ola 7 — Go-live gradual + re-inscripcion MP

> REQUIERE Ola 6 verde + autorizacion CEO.

- [ ] T7.1 - Flip de `NEXT_PUBLIC_FLOW_ENABLED` en prod (redeploy)
  - Scope: setear `NEXT_PUBLIC_FLOW_ENABLED='true'` en Production (build-time inlined -> redeploy). Monitorear primeros cobros Flow.
  - Verification: en prod aparecen ambos botones en los 4 flujos; primer coach real cobra por Webpay/Flow con `billing_snapshot` (`provider='flow'`) + entitlement (`coach_addons` -> trigger) correctos.
- [ ] T7.2 - Cutover `MERCADOPAGO_ACCESS_TOKEN` a la cuenta SpA + re-inscripcion
  - Scope: cambiar el env productivo al token de la SpA (preparado en T0.4) y **re-inscribir** las suscripciones MP vivas en la cuenta nueva (protocolo re-inscripcion, ver memoria stack pagos Chile). Documentar en RUNBOOK.
  - Verification: subs MP re-inscritas siguen renovando (primer cobro post-cutover OK); ningun coach pierde cobro; `docs/operations/RUNBOOK.md` actualizado.
- [ ] T7.3 - Rollback probado (kill-switch)
  - Scope: verificar que `NEXT_PUBLIC_FLOW_ENABLED` != `'true'` (redeploy) deja UI solo-MP y server fail-closes `gateway='flow'`; restaurar `MERCADOPAGO_ACCESS_TOKEN` anterior si la re-inscripcion falla (cutover reversible por env, sin tocar DB).
  - Verification: con flag OFF Flow es inalcanzable y MP intacto; procedimiento de reversa MP documentado y probado en Preview.
- [ ] T7.4 - Actualizar docs canonicos
  - Scope: `docs/architecture/FLOWS_AND_COMPONENTS.md` (flujo dual de pago), `docs/operations/RUNBOOK.md` (incidentes Flow: reconcile, webhook caido, error -1/-8), `docs/operations/MANUAL_TASKS.md` (envs + cutover).
  - Verification: docs reflejan el estado dual-gateway; incluido en el PR de Ola 7.
- [ ] T7.5 - DROP diferido del UNIQUE simple de `billing_snapshots` (destructivo, atomico)
  - Scope: migracion `... _drop_billing_snapshots_simple_unique.sql` con `ALTER TABLE billing_snapshots DROP CONSTRAINT IF EXISTS billing_snapshots_provider_payment_id_key;` (el compuesto ya existe desde Ola 1). Se difiere hasta ACA porque con Flow LIVE un `provider_payment_id` de Flow SI puede colisionar con uno de MP → el simple debe morir. **NO es aditiva ni revertible por solo-codigo:** migracion + deploy del codigo (que ya usa `onConflict` compuesto desde Ola 1) deben ir **atomicos** en un release monitoreado; el codigo compuesto ya vive en prod desde Ola 1, asi que aca solo se dropea el simple (sin ventana: el compuesto cubre el arbiter en todo momento).
  - Verification: `\d billing_snapshots` sin el constraint simple; un replay de cobro MP sigue deduplicando por el compuesto; snapshot writes MP y Flow OK post-drop; snapshot + `get_advisors` (0 criticos).

**DoD transversal Ola 7:** primer coach real cobra por Flow con snapshot+entitlement correctos; subs MP re-inscritas renovando; rollback probado (flag OFF = cero regresion); docs canonicos actualizados.

---

## Checklist money-safety pre-go-live

> Bloqueante antes del flip productivo (Ola 7). Cada item verificado en sandbox y anotado.

- [ ] **Monto server-side unico:** el cliente NUNCA envia montos; `getCompositeAmountClp` es la unica fuente para ambos gateways (Flow recibe montos ya calculados).
- [ ] **Idempotencia doble-webhook:** reprocesar el mismo cobro de Flow (replay del POST) NO genera un segundo `billing_snapshot` ni un segundo avance de periodo (guard `subscription_events.provider_event_id` namespaced `flow:*` + `billing_snapshots(provider,provider_payment_id)`).
- [ ] **Cero doble-cobro confirm+webhook:** confirm sincrono y webhook son idempotentes entre si (mismo cobro, dos rutas, un solo efecto).
- [ ] **Reconcile no depende del ACK:** el estado real se obtiene por `getStatus`/`invoice/get` firmado; el cron backstop concilia cobros no notificados (webhook caido = pago sigue valido).
- [ ] **Un snapshot por cobro aprobado:** exactamente un `billing_snapshot` con `provider='flow'`, desglose `base_clp` + `addons[]` + `total_clp` (evidencia SERNAC).
- [ ] **Dunning preserva `current_period_end`:** cobro fallido pasa a `past_due` sin adelantar/retroceder la fecha de fin de periodo; estado terminal tras reintentos mapeado (T6.2).
- [ ] **Refund/chargeback:** `refund/create` dispara la rama refund existente (expira coach + revierte cupon + cancela sub).
- [ ] **Entitlements por trigger:** Flow SOLO escribe la fila `coach_addons`; `coaches.enabled_modules` lo recomputa el trigger D1 (verificado: sin escritura directa al jsonb).
- [ ] **Columnas billing service-role-only:** `subscription_provider`, `subscription_provider_external_id`, `provider_customer_id`, `provider_plan_id`, `billing_snapshots.provider` fuera de la allowlist `GRANT UPDATE`; `tests/separation/module-grants.sql` sin drift.
- [ ] **Firma HMAC verificada:** en request saliente (todos los endpoints Flow) y en la verificacion del webhook entrante (round-trip firmado, no body crudo).
- [ ] **Cero regresion MP:** default sigue MP; suite MP verde; subs MP renovando (incl. post re-inscripcion Ola 7).

---

## Universal Definition of Done (por PR)

- [ ] `pnpm typecheck` verde
- [ ] `pnpm test` de los archivos tocados verde
- [ ] Sin llamadas directas a Supabase en `_data` (respeta repository layer)
- [ ] Server actions / endpoints validan con Zod v4 (cliente + servidor para `gateway`)
- [ ] Mutaciones llaman `revalidatePath()` donde aplica
- [ ] Mobile viewport usa `dvh`, no `vh`/`h-screen` (fuera de `md:`)
- [ ] UI fija en bordes usa utilidades safe-area
- [ ] Dark mode revisado cuando cambia UI
- [ ] Migracion idempotente + GRANT correcto (columnas billing FUERA de allowlist)
- [ ] Sin secretos hardcodeados (todo por env `FLOW_*` / `MERCADOPAGO_*`)
- [ ] Docs canonicos actualizados cuando cambian rutas, flujos, DB o tests

## Notes

- Cambios acotados por ola; PR por ola.
- Preferir componentes route-local (`_components/`); atomic solo si se reusa en 3+ domains (no es el caso).
- Preservar comportamiento MP salvo que el SPEC lo cambie explicitamente.
- Los 5 pins (Ola 6) son verificaciones empiricas en sandbox: documentar el resultado real, NO hardcodear supuestos.
