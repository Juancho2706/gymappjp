---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-07-25 @ a59acfd1"
canonical: live-backlog
source_of_truth: docs/status/MOBILE_PARITY.md
---

# TASKS — Backlog vivo de paridad RN

Solo contiene trabajo accionable. La matriz histórica E0–E8 permanece en Git y no debe usarse para decidir qué sigue. El estado consolidado por ola vive en [`docs/status/MOBILE_PARITY.md`](../../docs/status/MOBILE_PARITY.md); este archivo no duplica ese detalle.

## Estado heredado

- [x] Sección 1 cerrada en código/revisión estática — luego rediseñada a **ejecutor V3 + cardio A-D** e integrada en PR #170 (`60090f90`); specs en [`specs/executor-v3/`](../executor-v3/) y [`specs/cardio-ejes-y-fixes/`](../cardio-ejes-y-fixes/).
- [x] Sección 2 cerrada en código/revisión estática.
- [x] Sección 3 cerrada en código/revisión estática (14/14 unidades).
- [x] Ola 2R cerrada en código/revisión estática.
- [ ] Certificar Secciones 1–3 y 2R en dispositivo real.

## Ola 4A — Nutrición alumno (cerrada estática)

- [x] 12/12 unidades aplicadas: waves iniciales + wave C (`73f6aa82`), wave D (`3efa1a75`), wave E (`7c6684fa`). Detalle por unidad en [`docs/rn-port/specs/seccion-4a/`](../../docs/rn-port/specs/seccion-4a/).
- [ ] QA device de la ola (Android/iOS, light/dark, EVA/custom, estados loading/empty/error/offline).
- [ ] Regresión dirigida de Secciones 1–3 y 2R después del QA.

## Ola 4B — Nutrición coach y catálogos (cerrada estática)

- [x] 15/15 unidades de rama aplicadas en waves 4B.1–4B.6 (`bce2eb3b`, `76d8ea2f`, `8f8161cb`, `2cdc0c79`, `a9b8958e`, `6338f4a4`). Detalle en [`docs/rn-port/specs/seccion-4b/`](../../docs/rn-port/specs/seccion-4b/).
- [ ] QA device de la ola.
- [ ] 4B-16 — deuda transversal nutrition-pro: consolidar en `@eva/nutrition-v2` desde una rama de web, no aquí.

## Build gate actual

- [x] Vía `production` validada end-to-end: build + submit Android (Play internal testing) e iOS (TestFlight) verdes en el run `29885773193` sobre `4382ff6c` (2026-07-22).
- [ ] Reparar el build iOS `production` (falló en `b7e5e34d` y `335c88da`; logs expirados).
- [ ] Generar y retener artefactos firmados del corte integrado actual.
- [ ] Instalar/probar ambos artefactos; build verde no equivale a QA.

## Supabase — solo si una unidad requiere DB

- [ ] Confirmar si Branching Pro está disponible antes de mutar schema/RLS.
- [ ] Usar branch efímero y borrarlo el mismo día; si no está disponible, protocolo aditivo-en-LIVE.
- [ ] Migración aditiva, idempotente y forward-only.
- [ ] Seed sintético + pruebas RLS con roles reales; no `service_role` como prueba.
- [ ] Advisors sin críticos y snapshot de tablas afectadas.
- [ ] Después del merge/cambio: `db pull`, regenerar tipos y validar web/mobile.
- [ ] Nunca `db push` ciego ni DDL destructiva.

## Cola posterior

- [x] Inventario/spec de 4B — hecho; vive en [`docs/rn-port/specs/seccion-4b/`](../../docs/rn-port/specs/seccion-4b/).
- [ ] Inventario/spec de la ola 5 — builder y programas del coach (siguiente frente; contrastar contra el código ya integrado del ejecutor V3).
- [ ] Inventario de dominios restantes en lotes de 10–15 superficies.
- [ ] Certificación transversal de rutas, branding, accesibilidad, offline y deep links.
- [ ] Release estable a stores después de todos los gates.

## Regla de cierre de tarea

Marcar `[x]` solo cuando el alcance indicado esté implementado y verificado al nivel que declara la sección. Las olas “cerradas estáticas” no implican certificación hasta completar sus checks de QA device.
