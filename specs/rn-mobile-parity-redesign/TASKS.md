---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-07-21 @ f5301858"
canonical: live-backlog
source_of_truth: docs/status/MOBILE_PARITY.md
---

# TASKS — Backlog vivo de paridad RN

Solo contiene trabajo accionable. La matriz histórica E0–E8 permanece en Git y no debe usarse para decidir qué sigue.

## Estado heredado

- [x] Sección 1 cerrada en código/revisión estática.
- [x] Sección 2 cerrada en código/revisión estática.
- [x] Sección 3 cerrada en código/revisión estática (14/14 unidades).
- [x] Ola 2R cerrada en código/revisión estática.
- [ ] Certificar Secciones 1–3 y 2R en dispositivo real.

## Ola 4A — Nutrición alumno

### Aplicadas; falta QA device

- [x] `4A-01` — ruteo y chrome.
- [x] `4A-02` — vista Hoy: estructura.
- [x] `4A-07` — kit e ilustraciones.
- [x] `4A-10` — registro y buscador.
- [x] `4A-11` — scanner.
- [ ] QA device de estas cinco unidades.

### Wave C

- [ ] `4A-06` — editar cantidad y retirar registro.
- [ ] `4A-08` — `AuraHero`, macros y white-label.
- [ ] `4A-09` — porciones y equivalencias.
- [ ] Revisión adversarial + lente de lógica de Wave C.
- [ ] Gates estáticos/export de Wave C.

### Wave D

- [ ] `4A-03` — vista Plan.
- [ ] `4A-12` — celebraciones y residuos aprobados.
- [ ] Revisión adversarial + lente de lógica de Wave D.
- [ ] Gates estáticos/export de Wave D.

### Wave E

- [ ] `4A-04` — historial.
- [ ] `4A-05` — shell y tab bar, secuencial si comparte `index.tsx`.
- [ ] Revisión adversarial + lente de lógica de Wave E.
- [ ] Gates estáticos/export de Wave E.

### Cierre 4A

- [ ] Barrido integral contra web responsive actual.
- [ ] Cero P0/P1/P2 accionables.
- [ ] Estados loading/empty/error/offline/pending/domain-off verificados.
- [ ] Light/dark × EVA/custom brand.
- [ ] QA Android real.
- [ ] QA iOS real.
- [ ] Regresión dirigida de Secciones 1–3 y 2R.
- [ ] Actualizar `MOBILE_PARITY.md` y specs de unidad con resultado final.

## Build gate actual

- [x] Android `previewv2` compiló y subió artefacto en el run `29766013009` sobre `c6743ef3`.
- [x] iOS `previewv2` compiló y subió IPA en el run `29765692202` sobre `c6743ef3`.
- [x] Registrar ambos runs, su expiración y el fallo de submit iOS en los documentos canónicos.
- [x] Añadir `submit.previewv2` en `f5301858` para alinear el workflow con `eas.json`.
- [ ] Generar y retener artefactos firmados del candidato actual.
- [ ] Completar el submit TestFlight y verificar procesamiento en App Store Connect.
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

- [ ] Inventario/spec de 4B — nutrición coach y catálogos.
- [ ] Inventario/spec de 5 — builder y programas.
- [ ] Inventario de dominios restantes en lotes de 10–15 superficies.
- [ ] Certificación transversal de rutas, branding, accesibilidad, offline y deep links.
- [ ] Release estable a stores después de todos los gates.

## Regla de cierre de tarea

Marcar `[x]` solo cuando el alcance indicado esté implementado y verificado al nivel que declara la sección. Las tareas “aplicadas” de 4A no implican certificación hasta completar sus checks de QA device.
