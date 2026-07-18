# Inventario assets CEO — 2026-07

Assets generados por el CEO (ChatGPT/imagen), copiados al repo en `feat/t10-assets`. Licencia para
TODO lo listado: generado por el CEO vía ChatGPT, uso comercial del output permitido, sin
copyright exclusivo de terceros (política estándar de OpenAI para imágenes generadas).

## 1. Fotos de platos chilenos (Storage, bucket `food-media`)

- 24 platos chilenos generados, **6 ya vinculados** a filas de `foods` vía tabla `food_media`
  (kind `eva_illustration`, migración `20260714220000_food_catalog_v2_schema.sql`).
- Estado: **staged parcial** — 18 sin vincular todavía. No verificado en esta tanda contra Storage
  remoto (fuera de alcance: doc-only); confirmar conteo real con `mcp__supabase__list_storage_buckets`
  antes de dar por cerrado.
- Superficie: catálogo de alimentos (`/coach` nutrición, scanner RN y PWA), `food_media.is_primary`
  decide la imagen mostrada por alimento.

## 2. Illustrations — `apps/web/public/illustrations/` (8 empty states + 3 onboarding, +@2x)

Sin referencias en código (`grep` en `apps/web/src` y `apps/mobile` = 0 matches) → **staged, no
integradas**. Clasificación por nombre (a confirmar con producto):

**Empty states (8):** `sin-alumnos`, `sin-plan`, `sin-conexion`, `sin-resultados`,
`catalogo-vacio`, `historial-vacio`, `error-amable`, `dia-completado`.

**Onboarding (3):** `alumno-scan`, `coach-plan`, `progreso`.

- Superficie: pantallas vacías de coach (`/coach/clients` sin alumnos, `/coach/nutrition` catálogo
  vacío) y de alumno (`/c/[slug]` sin plan, historial vacío, sin conexión, búsqueda sin resultados);
  onboarding = welcome/first-run coach y alumno.
- Backlog: no existe pantalla de bienvenida dedicada en web ni RN hoy — las 3 de onboarding
  quedan sin hogar hasta que se especifique esa feature (falta spec nueva en `specs/`).

## 3. Badges — `apps/web/public/badges/` y `apps/mobile/assets/badges/` (12 + @2x, duplicados en ambas apps)

`constancia`, `dia-cerrado`, `diez-registros`, `explorador`, `mes-constante`, `meta-proteina`,
`plan-asignado`, `primer-escaneo`, `primer-plan`, `primer-registro`, `regreso`, `semana-completa`.

- Estado: **staged, sin feature** — no existe sistema de logros/gamificación en el código (grep sin
  resultados para achievement/badge UI en `apps/web/src` más allá de `client/app-badge.ts`, que es
  el badge de ícono de la PWA, no relacionado).
- Backlog: feature "logros del alumno" (gamificación) — pendiente de SPEC.md antes de implementar
  (regla SDD del proyecto). Candidatos de trigger obvios por nombre: primer registro/plan/escaneo,
  racha semanal/mensual, regreso tras inactividad.

## 4. Module icons — `apps/web/public/module-icons/` (4 + @2x)

`body-composition`, `cardio`, `movement`, `nutrition-pro`.

- Estado: **staged, no integradas** — las superficies actuales que listan estos módulos
  (`entitlements.service.ts`, `ModulosPro.tsx`, `coach/settings/modules`) no referencian estos
  archivos; hoy usan iconos Lucide/emoji.
- Backlog: swap de iconos Lucide → estos assets en tarjetas de módulos (settings, subscription,
  landing `ModulosPro`) — cambio cosmético acotado, no requiere SPEC (no es feature nueva).

## 5. Stickers — `apps/mobile/assets/stickers/` (8 + @2x, SOLO mobile)

`a-moverse`, `comida-check`, `descanso`, `despegue`, `fist-bump`, `fuerza`, `hidratate`, `logro`.

- Estado: **staged, sin feature aún** (confirmado por el orquestador).
- Backlog: feature futura de "reacciones del coach" (el coach reacciona a un registro/día del
  alumno con un sticker) — requiere SPEC.md nuevo antes de construir; no hay tabla ni endpoint hoy.

## Resumen de estado

| Grupo | Cantidad | Integrado | Staged sin feature |
|---|---|---|---|
| Platos chilenos (Storage) | 24 | 6 | 18 |
| Illustrations | 11 (8 empty + 3 onboarding) | 0 | 11 |
| Badges | 12 | 0 | 12 |
| Module icons | 4 | 0 | 4 |
| Stickers (mobile) | 8 | 0 | 8 |

Ningún asset de `illustrations/`, `badges/`, `module-icons/` o `stickers/` tiene wiring a
componentes todavía (verificado por grep en esta tanda). El único grupo con integración parcial
real es el catálogo de platos chilenos vía `food_media`.
