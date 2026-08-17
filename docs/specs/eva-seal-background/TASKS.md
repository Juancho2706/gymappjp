# TASKS — Sello EVA v2 (worker-ready)

> **CERRADA — 2026-08-17.** Todas las waves de esta tabla (S1-S4) quedan cerradas: implementación
> verificada en el árbol (auditoría specs-vs-código). Este archivo usa formato de tabla sin
> checkboxes; no hay casillas individuales que marcar.

Convenciones de la casa (Opus implementa guiado, Sonnet mecánico, jefe juzga; DoD +
typecheck local antes de DONE; guardia backend-cero). Referencia visual normativa: artifact
«Variaciones del Sello» — sección finalistas (V1 remix B) con sus valores exactos.

## S1 — Fundaciones

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| S1.1 | Opus | helper `sealPair` en `@eva/brand-kit` (junto a `presets.ts`) + tests | D3 v2: `sealPair(resolvedTheme)` devuelve `{primary, secondary}` tomando el `secondaryColor` DEL TEMA RESUELTO (los 14 presets ya lo curan; respetar `accentLight/accentDark` si el resolutor los aplica por modo — hoy solo llegan del acordeón manual, ningún preset los trae); fórmula `H+38°, S×.85, L+14 top 68` SOLO como fallback cuando el brand no trae secundario. Golden: 3 presets reales (verificando que sale el par curado, no el derivado) + 2 fallbacks custom (wrap de hue). | vitest verde; misma salida desde import web y RN (test en tests/ raíz). |
| S1.2 | Opus | `AppSeal` web (nuevo, ubicación coherente con el repo) + tokens `--seal-*` en `globals.css` + espejo `theme.ts` + stories harness `?seal=1` | Variantes `b` (blobs derivados con deriva `motion-safe`, keyframes 46/58s de 3 puntos, + grano) y `grain`. Alphas por tema de la SPEC D5. Capas fixed detrás del contenido, `pointer-events:none`. | typecheck + `check:tokens` verdes; stories montan. |

## S2 — Montajes web + gate

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| S2.1 | Opus | coach shell (`app/coach/layout.tsx`/`CoachMainWrapper`), alumno shell, `QuickEditPlanView` (capa `grain`) | Montar `AppSeal b` en los 2 shells logueados (actualizar el comentario «fondo limpio» citando SPEC D6); `AppSeal grain` dentro del overlay del editor. PRE-AUTH INTACTO: cero montajes en layouts de login/registro/landing (verificar por árbol de layouts, no por pathname). | Diff de rutas pre-auth = cero; editor sin blobs. |
| S2.2 | Sonnet | `scripts/cabina-visual-check.mjs` | Asserts del PLAN §4: colores derivados (2 marcas), contraste WCAG sin cambio, reduced-motion congela, capturas dark/light×2 marcas. | Script completo EXIT 0. |

## S3 — RN

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| S3.1 | Opus | `apps/mobile/components/AppBackground.tsx` (+ helper S1.1) | v2: retirar el pattern `appgrid`; `SKY` fijo → secundario derivado; deriva Reanimated UI-thread (transform de los círculos Skia, 46/58s, `withRepeat`) gateada por reduce-motion y prop `animated` (default true); grano intacto (jamás anima). Comentario del contrato actualizado citando SPEC D4. | tsc + `expo export --platform android` verdes; sin trabajo en JS thread (verificado por código: solo shared values). |

## S4 — Cierre (jefe + dueño)

| ID | Quién | Qué |
|---|---|---|
| S4.1 | jefe | Gates completos + juicio contra el artifact + `CURRENT`/`MOBILE_PARITY` + docs:check |
| S4.2 | dueño | QA visual web (preview) + device Android (batería/fluidez de la deriva — si molesta, kill-switch `animated=false` queda a un flag) → entra al OTA acumulado vigente |
