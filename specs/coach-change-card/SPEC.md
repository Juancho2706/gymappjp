# Coach Change Card (MercadoPago) - SPEC

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-06-15
**Related plan:** `~/.claude/plans/necesito-que-investigues-en-vast-diffie.md` (plan maestro + veredicto panel 14 roles)

---

## Problem

Un coach standalone que paga su suscripcion recurrente por MercadoPago (pre-approval) **no puede cambiar la tarjeta** desde EVA. Si la tarjeta vence o cambia, la unica salida es cancelar, perder acceso y reactivar (resetea el ciclo). La tarjeta vencida es la causa #1 de fallos de cobro recurrente → churn involuntario y perdida de ingresos.

## Users

- **Primary:** coach standalone con suscripcion activa de pago (tier starter/pro/elite) que necesita actualizar su medio de pago.
- **Secondary:** coach en estado `paused`/`pending_payment` por dunning que quiere recuperar su suscripcion cambiando la tarjeta (fase 2 — recuperacion de pago fallido, diferido).
- **Internal/operator:** soporte/CSM que hoy resuelve a mano estos casos; admin que audita cambios de medio de pago (evidencia SERNAC).

## Goals

- Cambio de tarjeta **in-place**: misma suscripcion (`subscription_mp_id`), mismo ciclo, misma fecha de cobro, sin cortar acceso, sin cancelar.
- **Sin obligar cuenta MercadoPago** (tokenizacion client-side con Secure Fields; muchos coaches pagaron como invitado).
- **Reutilizable por la futura app RN** (la pagina web se abre en navegador externo; pago fuera de la app por politica Apple/Google).
- Mostrar la tarjeta activa ("{brand} ···· {last4}").

## Non-Goals

- Recuperacion de pago fallido (resume de `paused`/`pending_payment`) — fase 2.
- Cambio de tarjeta nativo en mobile RN — fase 2 (la web cubre via navegador externo).
- Tarjeta secundaria de respaldo, `advancedFraudPrevention`, funnel PostHog — diferidos.
- Coaches managed por org/team (excluidos por guard; pagan por otro canal).

## User Stories

- Como **coach standalone con sub activa**, quiero cambiar mi tarjeta desde EVA, para que mi suscripcion siga sin interrupcion cuando mi tarjeta vence o cambia.
- Como **coach sin cuenta MercadoPago**, quiero poder cambiar la tarjeta sin crear una cuenta MP, para no tener friccion extra.
- Como **operador/CSM**, quiero un registro auditable de cada cambio de tarjeta, para tener evidencia ante un reclamo (SERNAC) y no resolver a mano.

## Acceptance Criteria

- [ ] El swap usa `PUT /preapproval/{id}` con body **exactamente** `{ card_token_id }` (+ `X-Idempotency-Key`), nunca reusando `updateCheckoutAmount`.
- [ ] **Q1 (SERNAC, hard gate):** el swap NO mueve `next_payment_date`/`transaction_amount`/`status`, NO escribe `billing_snapshot`, NO muta `current_period_end`. Guard durable en CI (fixture grabado) + assert post-PUT.
- [ ] La tarjeta se tokeniza client-side (Secure Fields, `iframe:true`); **el PAN nunca toca el server** (PCI SAQ-A); el token nunca se persiste ni se loggea (solo hash SHA-256).
- [ ] La ruta resuelve el coach por `auth.uid()` (service-role); **ignora cualquier `mp_id`/`checkoutId` del body** (anti-IDOR).
- [ ] Guards: 403 para los 4 workspaces no-standalone (`canViewBilling`); 409 si upgrade in-flight o `superseded_mp_preapproval_id` no null o `subscription_mp_id` null; status `{cancelled,expired}` → `PREAPPROVAL_TERMINAL` (sin PUT) → fallback reactivate.
- [ ] **Consentimiento (Ley 19.496/21.398):** constante `CARD_CHANGE_DISCLOSURE` versionada propia (NO `ADDON_PAYMENT_RULES`); el POST exige `acceptedTermsVersion` y da 400 si stale; el texto aceptado se persiste en `subscription_events.payload`.
- [ ] Rate-limit **fail-closed** dedicado (`rateLimitCardChange`).
- [ ] `coaches.card_last4`/`card_brand`/`card_payment_method_id` columnas aditivas service-role-write-only (sin GRANT a `authenticated`); pobladas autoritativamente server-side; UI muestra la tarjeta activa, con estado vacio para coaches legacy.
- [ ] Webhook: un `updated` de cambio de tarjeta (monto sin cambio) es **no-op total** (early-return antes del bloque de recomputo de periodo).
- [ ] **Mobile viewport:** `dvh`, safe areas; los iframes de Secure Fields heredan estilo via `fields.create()` (no Tailwind).
- [ ] **Dark mode** soportado en la pagina.
- [ ] **CSP:** orígenes MP enumerados en `vercel.json`; test estatico de CI; smoke de iframe en Vercel Preview (release gate).
- [ ] Feature detras de flag **server-only** `CHANGE_CARD_ENABLED` (fail-closed): la ruta da 403 si OFF sin importar la sesion.
- [ ] **Observabilidad/soporte:** fila `subscription_events` por cada cambio; runbook + macros de soporte; email de confirmacion (informativo, no recibo).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| El PUT mueve `next_payment_date` o dispara micro-cobro → re-facturacion silenciosa | ALTO (incidente SERNAC) | Q1 hard gate + assert post-PUT + Q9 captura de webhooks 24h antes de prod |
| Webhook re-emitido tras swap re-deriva periodo/expira coach (`webhook/route.ts:670-756`) | ALTO | P0-7 early-return no-op para card-only `updated` |
| Consentimiento insuficiente para modificar instrumento de pago | MED (legal) | `CARD_CHANGE_DISCLOSURE` versionada + firma JP del delta de T&C/privacidad antes de prod |
| Coach sin cuenta MP no puede usar el portal MP | (resuelto) | Secure Fields no requiere cuenta MP |
| CSP sin orígenes MP → iframes en blanco (falla invisible) | MED | orígenes en `vercel.json` + test CI + smoke en preview |
| Rate-limit fail-open en endpoint de dinero | MED | `rateLimitCardChange` fail-closed |

## Open Questions

- [ ] **Q1:** ¿`PUT { card_token_id }` preserva el ciclo (no mueve `next_payment_date`/`transaction_amount`/`status`)? (sandbox, hard gate)
- [ ] **Q9:** ¿el PUT dispara un `payment`/`authorized`/micro-charge de verificacion que el webhook lea como cobro? (captura de webhooks 24h, antes de prod)
- [ ] **Q10:** ¿MP acepta el PUT con sub `paused`/`pending_payment` (dunning-recovery) o lo rechaza? (define el allowlist de status; fase 2)
- [ ] **Legal:** ¿los T&C/privacidad publicados ya autorizan modificar el instrumento de pago almacenado y listan last4/marca? (firma JP antes de prod)
