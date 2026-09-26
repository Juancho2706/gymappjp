---
status: draft
owner: product-engineering
last_verified: "2026-09-26"
canonical: false
---

# PLAN — Píxel de compra por servidor

Ver [SPEC](SPEC.md) · [TASKS](TASKS.md). Supone D1–D4 = (a).

## 1. Piezas

| Pieza | Archivo | Cambio |
|---|---|---|
| Timeout del helper | `lib/meta/capi.ts:187` | `signal: AbortSignal.timeout(3000)` en el `fetch`; el catch ya existe. |
| Contexto guardado | `lib/payments/checkout-intent.ts` + sus dos llamadas: `app/api/payments/create-preference/route.ts:639` (MP y Flow desde «Elige cómo pagar») y `app/(auth)/register/_actions/register.actions.ts:456` (alta con plan pago) | el intent guarda `meta: { fbp, fbc, ua }` leídos de `collectMetaCapiContext()` en ESE request (que sí es del coach). |
| Servicio nuevo | `services/billing/meta-purchase.service.ts` | `sendFirstPurchaseToMeta(admin, { coachId, provider, providerPaymentId, totalClp, tier, cycle })`: filtra prueba/cortesía, verifica que sea el primer snapshot del coach, lee email y contexto del intent, envía con `context` explícito, escribe `admin_audit_logs`. Nunca lanza. |
| Enganche | los 5 `insertBillingSnapshot` (§1 del SPEC) | `if (snap.inserted) await sendFirstPurchaseToMeta(...)` dentro del try/catch que ya traga errores de hooks. |

«Primer pago» = el coach no tenía ningún `billing_snapshots` antes de este (`count` por `coach_id` = 1
después del insert). Un coach que volvió a pagar tras meses en Free cuenta como cobro repetido.

## 2. Riesgos

| Riesgo | Mitigación |
|---|---|
| El webhook se cuelga esperando a Meta | Timeout de 3 s + la llamada va después de persistir todo lo de plata. |
| IP/UA de MP en el evento | `context` explícito siempre; test que lo prueba. |
| Doble evento (confirm-enrollment + webhook Flow con el mismo `invoice:<id>`) | Solo envía quien obtuvo `inserted: true`; el UNIQUE de la base decide. |
| Cuentas de prueba contaminan Meta | `isTestCoachEmail` + `payment_provider = 'internal'`. |

## 3. Tests

Unitarios del servicio (primer pago sí, segundo no, prueba no, contexto explícito, timeout no lanza) y un
test de cada llamada que verifique que `inserted: false` no envía nada. Sin E2E (no hay sandbox de Meta).

## 4. Presupuesto

~1 día-agente + QA del owner con el próximo pago real.
