# SANDBOX MP — CHECKLIST (add-ons self-service)

**Status:** ESCRITO — NO EJECUTAR fuera del gate
**Owner:** Juan V.
**Last updated:** 2026-06-12
**Spec:** `specs/addons-billing/SPEC.md` · **Plan:** `specs/addons-billing/PLAN.md`
**Plan maestro:** `docs/plans/estrategia/05-PLAN-billing-addons-selfservice.md` §F3 / Riesgos

---

> ⚠️ **NO EJECUTAR EN ESTA TANDA.** Estos 9 ítems tocan red y MercadoPago. Se corren
> **SOLO en el GATE del plan**, con autorización explícita del usuario (regla 2026-06-10),
> usando token de prueba `MERCADOPAGO_ACCESS_TOKEN` que empieza con `TEST-` y el pagador
> sandbox `MERCADOPAGO_TEST_PAYER_EMAIL`. NUNCA con credenciales de producción.
>
> **Por qué bloqueante:** el riesgo real del plan vive en supuestos sobre MercadoPago que NO
> están documentados (timing del PUT, payload de cobros recurrentes, evento `updated`). Cada
> supuesto se VERIFICA acá antes de exponer la compra a un solo coach real. Sin estos 9 ítems
> verdes + el hardening RLS del plan 03 confirmado en prod, NO se prende
> `SELF_SERVICE_ADDONS_ENABLED` (se estaría vendiendo algo tomable gratis por API — doc fuente §2.2).

## Preparación

- [ ] Entorno con token `TEST-...` y `MERCADOPAGO_TEST_PAYER_EMAIL` configurados (Preview, no prod).
- [ ] Cuenta de prueba standalone con plan pago activo (juanmvr — memoria `project-test-accounts`).
- [ ] Webhook apuntando al entorno de prueba; capturar payloads crudos de cada evento (log).
- [ ] Migración `coach_addons` + `billing_snapshots` aplicada en el branch efímero del gate.

## Los 9 ítems (plan F3, Riesgos 1-2-9)

- [ ] **1 — PUT de monto: ¿cuándo aplica?** `PUT /preapproval/{id}` con `auto_recurring.transaction_amount`
      nuevo. Verificar: ¿el nuevo monto aplica al **próximo cobro** sin cargo inmediato? ¿genera algún
      cargo en el acto? ¿MP envía email al pagador notificando el cambio? **Bloqueante (Riesgo 1):** si
      generara cargo inmediato o no aplicara al próximo cobro, las reglas 2-4 cambian de mecánica.

- [ ] **2 — Payload real de un cobro recurrente: campo de match robusto.** Capturar el payload crudo de
      un cobro recurrente aprobado y elegir el campo que matchea de forma fiable con el preapproval.
      ⚠️ `payment.order.id` puede NO ser el preapproval id (`mercadopago.ts:203`). Candidatos a evaluar:
      `metadata.preapproval_id`, `external_reference`. **Bloqueante (Riesgo 2):** un mal match marcaría
      `first_charged_at` con un pago ajeno. No asumir el campo — fijarlo con el payload real.

- [ ] **3 — Alta in-app MENSUAL → próximo cobro trae el compuesto.** Coach mensual agrega un add-on:
      INSERT + PUT, sin checkout nuevo, sin cargo inmediato (fracción = cortesía). Verificar que el
      siguiente cobro recurrente trae el monto compuesto (base + add-on) y que se inserta el snapshot.

- [ ] **4 — Supersede con add-ons → preapproval viejo cancelado, nuevo cobra compuesto.** Upgrade/downgrade
      o cambio de ciclo con add-ons activos: el preapproval viejo se cancela (webhook), el nuevo nace con
      el monto compuesto y `external_reference` extendido; el webhook re-upserta las filas (no-op si existen).

- [ ] **5 — Baja → el cobro siguiente excluye el add-on.** Baja de un add-on ya cobrado: PUT bajando el
      monto YA; el próximo cobro recurrente NO incluye el add-on; acceso ON hasta `expires_at`.

- [ ] **6 — Compromiso mínimo MENSUAL → el corte cobra aunque la baja esté solicitada.** Baja con
      `first_charged_at IS NULL`: `cancel_pending` SIN PUT; el corte cobra el add-on igual; recién ahí
      `markFirstCharged` + PUT que lo excluye + `expires_at`.

- [ ] **7 — PUT sobre preapproval `paused`/`cancelled` → error esperado y manejo.** Disparar el PUT contra
      un preapproval pausado (dunning) y uno cancelado: registrar el error que devuelve MP y verificar que
      el código lo maneja (no rompe el request; el reconcile/dunning lo recoge).

- [ ] **8 — Evento preapproval `updated` tras el PUT (mejora aprobada).** Tras un PUT exitoso, verificar
      que MP envía un evento de preapproval `updated`, que el payload trae el `auto_recurring.transaction_amount`
      nuevo, y que sirve como confirmación de que el PUT aplicó. El webhook lo compara contra
      `getCompositeAmountClp` esperado; si difiere → alerta drift.

- [ ] **9 — Alta in-app TRIMESTRAL/ANUAL → one-shot prorrateado (Riesgo 9).** Coach trim/anual agrega un
      add-on: se crea una preference de **pago único** (Checkout Pro, NO preapproval) con monto prorrateado
      correcto (`getAddonProrationClp`) y `external_reference` dedicado `addon_oneshot|...`. Verificar:
      (a) el pago aprobado materializa la fila (`first_charged_at` = fecha del one-shot) + ejecuta el PUT
      que suma el add-on a la renovación + inserta snapshot `kind='addon_proration'`; (b) la renovación
      siguiente cobra el compuesto; (c) **abandono del one-shot = cero filas, cero módulos, cero PUT**;
      (d) doble clic (dos preferences vivas) → la 2ª aprobación choca con el índice único / idempotencia
      por `provider_payment_id` y se maneja como no-op amable.

## Resultado del gate

- [ ] Los 9 ítems verdes (con los hallazgos de los ítems 1, 2 y 8 documentados en `RUNBOOK.md`).
- [ ] Hardening RLS del plan 03 confirmado en prod.
- [ ] Recién con ambos → prender `SELF_SERVICE_ADDONS_ENABLED` (switch de lanzamiento MANUAL).
