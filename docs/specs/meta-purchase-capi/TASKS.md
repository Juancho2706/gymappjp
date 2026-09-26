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
- [ ] **T1** Timeout de 3 s en `sendMetaCapiEvent` (`lib/meta/capi.ts`) + test.
- [ ] **T2** Intent con `meta: { fbp, fbc, ua }` en `persistCheckoutIntent` y sus llamadas (MP y Flow).
- [ ] **T3** `services/billing/meta-purchase.service.ts` + tests (primer pago, repetido, prueba, cortesía,
  contexto explícito, fallo de red).
- [ ] **T4** Enganche después de los 5 `insertBillingSnapshot` con `inserted: true`.
- [ ] **T5** Gates: typecheck web, vitest de lo tocado (pagos + meta), eslint.
- [ ] **T6** Deploy solo a pedido del owner; QA con el próximo pago real (SPEC §7) ⇒ SDD `done`.
