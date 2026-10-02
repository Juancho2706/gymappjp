---
status: draft
owner: product-engineering
last_verified: "2026-09-26"
canonical: false
---

# TASKS — Píxel de compra por servidor

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md). **Ningún checkbox se marca sin gate real o QA del owner.**
Push y deploy **solo a pedido del owner**.

- [x] **T0** Owner responde D1–D4 (SPEC §4). — 26-09: solo el primer cobro, guardar cookies de Meta + navegador sin IP, `Purchase`, sin espejo en el navegador.
- [x] **T1** Timeout de 3 s en `sendMetaCapiEvent` (`lib/meta/capi.ts`) + `testEventCode` + resultado `{ ok }`;
  `lib/meta/capi.test.ts`.
- [x] **T2** Intent con `meta: { fbp, fbc, ua }` en `persistCheckoutIntent` y sus llamadas (create-preference
  MP/Flow y registro con plan pago); `checkout-intent.test.ts`.
- [x] **T3** `services/billing/meta-purchase.service.ts` + tests (primer pago, no-primero, ya enviado, prueba,
  interna/beta, monto 0, contexto del intent sin IP, fallo de Meta sin marca, error de base sin lanzar).
- [x] **T4** Enganche después de los 4 `insertBillingSnapshot` de cobro `recurring` (3 del webhook + Fase 2 de
  Flow). `inserted` no sirve (siempre true): ver SPEC §6 bis. Test del enganche en `confirm-enrollment`.
- [x] **T4b** Prueba manual con código de Events Manager: Admin → Sistema → «Píxel de compra · prueba».
- [x] **T5** Gates 02-10: typecheck web limpio; vitest de pagos + billing + lib (147 archivos, 2010 tests);
  eslint 0 errores.
- [ ] **T6** Deploy solo a pedido del owner; QA con el próximo pago real (SPEC §7) ⇒ SDD `done`.
