# Pagos multi-gateway (Flow.cl + MercadoPago) - SPEC

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-07-04
**Related plan:** `specs/pagos-multigateway-flow/PLAN.md`

---

## Resumen ejecutivo

Se agrega **Flow.cl (Webpay) como segunda pasarela de pago en paralelo a MercadoPago**, no como reemplazo. En todos los flujos de dinero del coach (alta/registro, reactivacion, cambio de plan, add-ons) aparecen **dos botones**: "Pagar con Webpay (Flow)" y "Pagar con MercadoPago". El objetivo es la **confianza del cliente chileno**: Webpay es el metodo bancario reconocido en Chile, y ofrecerlo baja la friccion de conversion sin perder el rail recurrente ya productivo de MP. Toda la implementacion vive **detras del puerto `PaymentsProvider` ya existente**, de modo que MP no se toca y el resto del sistema (webhook, money-safety, dunning, snapshots) permanece **provider-agnostico**.

---

## Problem

Hoy el unico gateway es MercadoPago. Un segmento de coaches chilenos desconfia de MP o prefiere pagar con su tarjeta bancaria via Webpay (el estandar de facto en Chile). Esa desconfianza es friccion directa de conversion en el alta y en la compra de add-ons. Necesitamos ofrecer **Webpay via Flow.cl** como alternativa de primera clase, con **paridad total** frente a lo que hoy hace MP (suscripcion base, add-ons que suben/bajan el total, upgrades/downgrades de tier, dunning con reintentos, cancelacion y refunds), **sin degradar ni arriesgar** el rail de MP que ya cobra en produccion.

## Users

- **Primario:** coach standalone que paga su suscripcion EVA (tier + ciclo) y sus add-ons de modulos.
- **Secundario:** coach en reactivacion o cambio de plan/ciclo que quiere elegir con que pasarela reengancha.
- **Interno/operador:** CEO/soporte que audita cobros (evidencia SERNAC via `billing_snapshots`), concilia pagos y opera cortesias/refunds. El motor de entitlements (`coach_addons` -> trigger D1 -> `coaches.enabled_modules`) permanece igual, sin importar la pasarela.

## Goals

- Ofrecer **Flow (Webpay) y MercadoPago en paralelo** en los 4 flujos de dinero: alta/registro, reactivacion, cambio de plan/ciclo, y add-ons.
- **Paridad funcional total** de Flow con MP: suscripcion recurrente base, add-ons como line-items que suben/bajan el total, cambio de tier con prorrateo, dunning (reintentos), cancelacion, y refunds/chargebacks.
- Implementar Flow como una clase que satisface el puerto **`PaymentsProvider`**, seleccionable **por request** (parametro `gateway`), sin modificar la logica de MP.
- Reusar sin cambios las ramas money-safety aguas abajo del webhook, alimentandolas con un `WebhookProcessResult` bien poblado producido por el `FlowProvider`.
- **Cero regresion** en el flujo MP existente (default se mantiene `mercadopago`).

## Non-Goals

- **Boleta/factura SII (DTE):** se resuelve con un proveedor DTE aparte, ortogonal al gateway. Esta feature solo deja **normalizado el hook del evento** (el `WebhookProcessResult` de un cobro aprobado) para que la emision de DTE se enganche despues. No se construye emision de boleta aqui.
- **Marketplace de pagos alumno -> coach:** fuera de scope. Esta feature es exclusivamente el pago coach -> EVA.
- **Pagos en mobile (RN):** los flujos de dinero siguen siendo **web-only**. La app RN no gana checkout con esta feature.
- **Migracion de suscripciones MP existentes a Flow:** los coaches que ya pagan por MP siguen en MP; no se migra automaticamente a nadie.
- **Nuevos metodos dentro de Flow** mas alla de Webpay (ej. cuotas, otros medios de Flow) no son objetivo de la v1.

## Decisiones de diseno

1. **Paridad total, no MVP recortado.** Flow debe cubrir el ciclo de vida completo que MP cubre hoy. Nada de "solo alta" en v1.
2. **Dos botones en todos los flujos.** Alta/registro, reactivacion, cambio de plan y add-ons muestran ambas pasarelas. El usuario elige explicitamente; el server nunca asume la pasarela por el.
3. **Detras del puerto `PaymentsProvider`.** Se agrega `FlowProvider` (molde: `stripe.ts`) que implementa la interface completa. La factory `getPaymentsProvider()` pasa de elegir por env `PAYMENT_PROVIDER` a **elegir por request segun `gateway`** ('mercadopago' | 'flow'). Se agrega `'flow'` al enum de dominio `PaymentProvider`.
4. **El server siempre calcula el monto.** `getCompositeAmountClp` (tier + Σ add-ons + cupon) sigue siendo la **unica** fuente del monto para ambas pasarelas. El cliente jamas manda montos. Flow recibe montos ya calculados.
5. **Webhook agnostico.** El `FlowProvider.processWebhook` traduce la notificacion de Flow (POST `token` -> GET `payment/getStatus` / `invoice/get`) a un `WebhookProcessResult` normalizado; **todas** las ramas money-safety (recurring authorized, one-shot addon, tier upgrade, refund/chargeback, canonico) se reusan sin cambios.
6. **Reconcile obligatorio, no depender del ACK.** El estado de la transaccion en Flow **no depende** del ACK del webhook (webhook caido = pago sigue valido). Se reusa el patron `confirm-*` sincrono + cron backstop (hoy para MP) para reconciliar por `getStatus`/`invoice/get`.
7. **Entitlements por trigger, no por TS.** Flow solo debe producir la fila `coach_addons` correcta; `coaches.enabled_modules` lo recomputa el trigger D1 (`sync_coach_enabled_modules`). Ninguna escritura directa al jsonb.
8. **DB aditiva, forward-only, idempotente.** Columnas nuevas (`subscription_provider`, `subscription_provider_external_id`, `provider_customer_id`, `provider_plan_id` en `coaches`; `provider` en `billing_snapshots`; opcional `provider`/`provider_external_id` en `coach_addons`) son **compra-only / service-role-only** — quedan fuera de la allowlist de `GRANT UPDATE`, y por eso NO requieren grant a `authenticated`.
9. **Gate Fase 0 bloqueante:** antes de escribir el `FlowProvider`, confirmar empiricamente en sandbox que Flow presenta el **Webpay REAL**. Si Flow no muestra Webpay real, la premisa de negocio (confianza chilena) cae y la feature se replantea.

## User Stories

- Como **coach**, quiero **ver dos botones de pago (Webpay/Flow y MercadoPago) en el alta**, para **elegir la pasarela en la que confio** y completar mi suscripcion sin friccion.
- Como **coach chileno**, quiero **pagar mi suscripcion con Webpay via Flow**, para **usar mi tarjeta bancaria por el medio que reconozco**.
- Como **coach**, quiero **agregar un add-on de modulo pagando por Flow**, para que **mi total mensual suba en la misma suscripcion viva** sin cancelar ni recontratar.
- Como **coach**, quiero **quitar un add-on**, para que **mi total baje** en la misma suscripcion, cobrandose el prorrateo correcto.
- Como **coach**, quiero **cambiar de tier (upgrade/downgrade) pagando por Flow**, para **ajustar mi plan** con el prorrateo correcto sobre el periodo vigente.
- Como **coach**, quiero que **si un cobro recurrente falla, Flow me reintente** (dunning), para **no perder el servicio por un rechazo transitorio** de tarjeta.
- Como **coach**, quiero **cancelar mi suscripcion de Flow**, para **dejar de pagar** conservando el acceso hasta el fin del periodo ya cobrado.
- Como **coach**, quiero **pedir un refund**, para **recuperar un cobro indebido**, y que el sistema revierta correctamente mi acceso y el cupon aplicado.
- Como **operador (CEO/soporte)**, quiero **un `billing_snapshot` por cada cobro aprobado con su pasarela identificada**, para **tener evidencia SERNAC** de que se cobro y por que, sin importar el gateway.

## Acceptance Criteria

**Funcional / paridad**
- [ ] Los 4 flujos (alta/registro, reactivacion, cambio de plan/ciclo, add-ons) muestran **ambos botones** de pasarela.
- [ ] `FlowProvider` implementa **todos** los metodos del puerto `PaymentsProvider` (createCheckout, createOneShotPayment, processWebhook, fetchCheckoutSnapshot, fetchPaymentSnapshot, cancelCheckoutAtProvider, updateCheckoutAmount, updateCheckoutAmountAndRef, updateCardAtProvider, fetchCardTokenSummary).
- [ ] La factory selecciona provider **por request** segun `gateway`; sin `gateway` valido, el default sigue siendo MP (cero regresion).
- [ ] Add-on que **sube** el total => `subscription/addItem` (line item en la misma sub viva), no cancel+resubscribe.
- [ ] Add-on que **baja** el total => `subscription/deleteItem`, con prorrateo correcto.
- [ ] Cambio de tier => `subscription/changePlan` con `previewChangePlan` para calcular el prorrateo antes de aplicar.
- [ ] Ciclo trimestral mapeado a `interval=3 + interval_count=3` y **verificado** que cobra cada 3 meses.
- [ ] Cancelacion => `subscription/cancel`, conservando acceso hasta `current_period_end`.
- [ ] Refund => `refund/create`, disparando la rama refund existente (expira coach + revierte cupon).

**Money-safety**
- [ ] **El monto lo calcula siempre el server** via `getCompositeAmountClp`; el cliente nunca envia montos.
- [ ] **Idempotencia por `(provider, provider_payment_id)`:** un mismo cobro de Flow reprocesado no genera un segundo `billing_snapshot` ni un segundo avance de periodo.
- [ ] **Exactamente un `billing_snapshot` por cobro aprobado**, con `provider='flow'`, desglose `base_clp` + `addons[]` + `total_clp`.
- [ ] **Dunning preserva `current_period_end`:** un cobro fallido pasa el coach a `past_due` sin adelantar/retroceder la fecha de fin de periodo.
- [ ] **Cero doble-cobro:** el confirm sincrono y el webhook son idempotentes entre si (guard por `subscription_events.provider_event_id` + `billing_snapshots.provider_payment_id`).
- [ ] **Reconcile por `getStatus`/`invoice/get`:** el estado real de la transaccion no depende del ACK del webhook; el cron backstop concilia pagos no notificados.
- [ ] Entitlements: Flow **solo** escribe la fila `coach_addons`; `coaches.enabled_modules` lo recomputa el trigger D1 (verificado: sin escritura directa al jsonb).

**Seguridad / observabilidad**
- [ ] Firma HMAC-SHA256 de Flow (params orden alfabetico excl. `s`, concatenacion `nombreValor`, hex) implementada y verificada en request saliente y en verificacion de webhook entrante.
- [ ] Columnas de billing nuevas son **service-role-only** (fuera de la allowlist `GRANT UPDATE`); ningun `authenticated` puede escribirlas.
- [ ] Migracion **aditiva, forward-only, idempotente**; re-ejecutable sin efectos destructivos.
- [ ] Todo cobro/refund/cancelacion queda registrado en `subscription_events` con `provider='flow'`.

**Mobile/responsive y a11y**
- [ ] La UI de seleccion de pasarela respeta `h-dvh`/safe-areas (no `h-screen` fuera de `md:`), `<Image>` (no `<img>`), dark mode y es usable en movil web.

## Scope y NON-GOALS (explicito)

**En scope:** Flow como segunda pasarela en paralelo a MP, paridad total del ciclo de vida (base + add-ons + tier change + dunning + cancel + refund), detras de `PaymentsProvider`, seleccion por request, DB aditiva, money-safety y reconcile reusando la maquinaria existente, UI de dos botones en los 4 flujos.

**NON-GOALS:** emision de boleta/factura DTE (feature aparte; aqui solo se deja normalizado el hook del evento), marketplace alumno -> coach, pagos en mobile RN (web-only), migracion forzada de suscripciones MP existentes a Flow, y metodos de Flow distintos de Webpay.

## Risks

Los 5 gaps a **pinear empiricamente en sandbox** antes/durante la implementacion (documentar como tareas de verificacion, NO hardcodear supuestos):

| Risk | Impact | Mitigation |
|---|---|---|
| **Gate Fase 0:** que Flow no presente el Webpay REAL en checkout | Alto — cae la premisa de negocio (confianza chilena) | Verificar en sandbox con checkout real ANTES de escribir `FlowProvider`; si no muestra Webpay real, replantear la feature |
| **Spelling exacto de endpoints inestables** (add/delete item, invoice getOverdue/retry/outsidePayment, modifyTrial — docs inconsistentes) | Medio — llamadas fallan en runtime | Confirmar cada endpoint contra sandbox real; apoyarse solo en los estables (plans/create, subscription/create/cancel/changePlan/previewChangePlan, customer/create/register, payment/getStatus, invoice/get/cancel) hasta verificar el resto |
| **Estado terminal de la sub tras agotar reintentos** (past_due vs cancelled, no documentado) | Alto — define si dunning corta acceso o solo marca past_due | Provocar el agotamiento de `charges_retries_number` en sandbox y observar el estado real; mapear a la maquina de estados EVA en consecuencia |
| **Ciclo trimestral** (`interval=3 + interval_count=3`) puede no cobrar cada 3 meses (no es nativo, es multiplicador) | Alto — cobro en cadencia incorrecta = money-safety | Verificar en sandbox que la primera y segunda factura caen a 3 meses; si no, buscar el mapeo correcto antes de exponer el ciclo trimestral |
| **Reuso de tarjeta sin re-entry** (customerId persistente reusable en subs/add-ons nuevos) | Medio — friccion o doble enrolamiento de tarjeta | Verificar en sandbox que `customer/create` + `customer/register` producen un `cus_xxx` reusable en `subscription/create` y en add-ons sin re-ingresar tarjeta |
| **Codigos de error `-1` (firma invalida) / `-8` (expirada)** via `getStatusExtended` | Bajo-Medio — mal manejo de errores oculta fallos | Reproducir ambos en sandbox y mapearlos a manejo de error explicito en el reconcile |

## Open Questions

- [ ] Gate Fase 0: ¿Flow muestra el Webpay real en el checkout de sandbox? (bloqueante)
- [ ] ¿El `billing_snapshots.provider_payment_id` UNIQUE debe pasar a UNIQUE compuesto `(provider, provider_payment_id)` para evitar colision de ids entre gateways?
- [ ] ¿`coach_addons` necesita columnas `provider`/`provider_external_id`, o con line-items en la sub de Flow es redundante?
- [ ] ¿Estado terminal exacto de la sub Flow tras agotar reintentos, y su mapeo a `subscription_status` de EVA?
