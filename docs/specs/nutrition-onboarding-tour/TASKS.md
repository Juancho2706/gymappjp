# TASKS — Guía Viva (worker-ready)

Convenciones de la casa: Sonnet = mecánico bien especificado; Opus = implementación guiada;
jefe = juicio. DoD por tarea + `pnpm typecheck` del paquete tocado antes de DONE. Gates
completos por wave según [PLAN](PLAN.md). Guardia backend-cero en TODAS. Referencia visual y
de motor: artifact «Guía Viva EVA» (aprobado por el dueño 2026-08-17).

## G1 — Motor web

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| G1.1 | Opus | `apps/web/src/components/nutrition-v2/tour/tour-engine.tsx` + `tour-flags.ts` + `tours.ts` + `TourHelpButton.tsx` (nuevos) + barrel | Portar el motor del artifact según PLAN §1 con D2/D3/D5 de la SPEC (clamp+flip+scrollIntoView, dock <768, focus trap, Esc, motion-reduce, flags SSR-safe versionados). Guiones cerrados de la SPEC en `tours.ts`. | vitest nuevo del posicionador (clamp: target en esquina ⇒ tarjeta ⊆ viewport simulado; flip; dock) + flags (set/get/versión). `typecheck` verde. |
| G1.2 | Sonnet | `apps/web/src/app/dev-harness/nutrition-editor/` | Stories `?tour=editor\|hub`: montar overlay+«?» sobre el harness sin flag (coachId fijo `qa-tour`), targets `data-tour` de mentira estables. | Harness responde 200 y el tour abre/avanza/salta. |

## G2 — Montaje web + gates

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| G2.1 | Opus | `QuickEditPlanView.tsx` (+`EditorRibbon`/`PublishBar`/`EditableSlotCard`/`EditableItemRow`/`EditorDayRail`/`EditorPalette` SOLO atributos) | `data-tour` en los 8 targets del guion + montar `TourHelpButton floating` (esquina inferior izquierda del lienzo, D2) y `TourOverlay` solo modo editor; auto-arranque 1ª vez sin `creation`; guion 6 pasos <768. CERO cambios de estilo/comportamiento de las superficies. | Tour completo operable en harness real 1536→390; auto-arranque respeta flag y creación. |
| G2.2 | Opus | hub `app/coach/nutrition-v2/page.tsx` + componentes de la pestaña Alumnos (solo atributos) | «?» inline junto al título + overlay guion hub (6). | Tour hub operable 1280/390. |
| G2.3 | Sonnet | `scripts/cabina-visual-check.mjs` | Asserts D2/D3 del PLAN §4 (BLOQUEANTES): «?» 0 solapes con interactivos; recorrido completo por paso con tarjeta ⊆ viewport; flag evita re-auto-arranque. | Script EXIT 0 con TODO lo previo + lo nuevo; probar un assert en rojo forzando un solape artificial (y revertirlo). |

## G3 — RN

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| G3.1 | Opus | `apps/mobile/components/nutrition-v2/tour/` (nuevos: `TourOverlay.tsx`, `TourTargets.tsx`, `tour-flags.ts`, `tours.ts`) | Motor RN del PLAN §3 (Modal + measureInWindow + dock + back=Saltar + reduce-motion + storage del kit). Pressable style estático. Iconos: assets `action-icons` ya bundleados. | `tsc` mobile verde + test de lógica de flags en `tests/`. |
| G3.2 | Opus | `QuickEditMode.tsx` + hub `index.tsx` (+ registros de target en mini-cinta/franja/porciones/PublishBar/tablist/fila) | Montajes según PLAN §3 con «?» D2 (sobre PublishBar lado izquierdo con safe-area; hub junto al título). | `tsc` + `expo export --platform android` verdes; smoke en device del owner queda para QA. |

## G4 — Cierre (jefe + owner)

| ID | Quién | Qué |
|---|---|---|
| G4.1 | jefe | Gates completos + diff-guard (builder/alumno/_actions/_data/services intactos) + juicio contra el artifact |
| G4.2 | jefe | `CURRENT.md` + `MOBILE_PARITY.md` (entrada Guía Viva) + `docs:check` |
| G4.3 | owner | QA preview + device (fundible con el QA del paquete vigente) → entra al OTA android acumulado |
