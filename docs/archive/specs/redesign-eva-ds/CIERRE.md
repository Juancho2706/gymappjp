# CIERRE — Rediseño total EVA con el nuevo Design System

**Estado:** ✅ Diseño completo implementado en `feat/redesign-eva-design-system` (off master). Master nunca tocado.
**Fecha:** 2026-06-29.

## Resumen
Las 9 fases de construcción + extracción + specs, todas **gateadas y commiteadas**. Cada fase pasó: web `typecheck` + `build`, mobile `tsc` + `expo export`. Cierre: **vitest suite completa exit 0** (cero regresiones), lint sin errores nuevos.

| Commit | Fase |
|--------|------|
| a6ddfd83 | 0 — Tokens (web @theme + mobile NativeWind + brand-kit `deriveSportTokens` ramp + Archivo/Hanken/JetBrains) |
| 4b97f0bf | 1 — 13 componentes core × web/mobile |
| b864a7a5 | 2 — Shell + navegación (CoachTopBar, navbar nuevo, mini-menú módulos, @utility shorthands) |
| 67bc9bb5 | 3 — Dashboards coach + alumno (anillos compliance) |
| 1604ec69 | 4 — Alumnos directorio + ficha 6 tabs |
| 2018d19b | 5 — Programas + constructor 3-paneles |
| 7c7ad951 | 6 — Nutrición coach + alumno (ember accent) |
| 1a85e0d2 | 7 — Módulos cardio/movimiento/composición (+ empty-states = fix crash 0-alumnos) |
| eb2e46db | 8 — Opciones/Mi Marca/suscripción/teams/soporte/perfil |
| 411a5e4b | 9 — Auth + rutina + historial + aprender + check-in |

## Invariantes respetados
- **Presentación-only:** cero cambios a `_data`/`_actions`/server actions, reducers, engines (`@eva/nutrition-engine`, plan-builder), RLS, DB, pagos/MercadoPago, entitlements. Única extensión de lógica: D2 (`@eva/brand-kit deriveSportTokens`, aditiva).
- **RN ≡ web responsive:** ambos desde `ui_kits/eva-app`, mismos tokens semánticos. Desktop (`eva-desktop`) propio; `<md` = app móvil.
- **White-label:** rampa `--sport-*` derivada por coach (OKLCH + WCAG), web (`coach/layout` + `/c/[slug]`) y mobile (`brandVars`). Contrato DB intacto.
- **Dark:** `.dark` (next-themes / RN), solo flipea aliases semánticos.

## Deuda diferida ("ahí mejoramos") — NADA bloqueante
**Decisiones deliberadas (no bugs):**
- Tab bars = restyle docked (no floating-capsule todavía). Capsule = follow-up (evita churn de offsets).
- Breakpoint `md` (768), no exact-760.
- Cardio coach = layout 3-tools apilado (no SegmentedControl switcher del diseño).
- Búsqueda global del `CoachTopBar` = placeholder no funcional (requiere endpoint de búsqueda).
- Directorio coach desktop = tabla+grilla restyleada (no master-detail literal embebiendo la ficha — rompía routing).

**Restyle parcial (legacy styling, no rompen):**
- Coach dashboard: `CoachOnboardingChecklist`, `DashboardCharts` (recharts), `BillingBanners`, bodies de sheets (ClientStats/Revenue/CreateClient/QuickAddPayment) — solo reposicionados.
- Alumno nutrición web: `HabitsTracker` (identidades de color por hábito).
- Internals de charts (recharts/victory): leen vars shadcn ya mapeadas o hex en atributo SVG (CSS var no resuelve ahí) — documentado.
- Acentos de estado sueltos (amber/sky/violet/emerald) en nutrición/builder — parity fina de color.

**Parity debt mobile (requiere BUILD, fuera del scope de rediseño):**
- Módulos cardio/movimiento/composición **no existen** en `apps/mobile` (0 pantallas).
- Alumno mobile: sin pantallas movimiento/bodycomp; sin capa de entitlements (tab Plan siempre visible).

**Huérfanas de la feature-matrix (preservadas, ubicación decidida):**
- NewsBell → campana del `CoachTopBar` ✅. Grupos de alimentos → tab Alimentos. Bloqueo biométrico → perfil alumno. Toggle push coach → Opciones. (Ver `feature-matrix.md`.)

## Próximos pasos (requieren tu OK)
1. **QA visual** light+dark (correr la app + capturas) — comparar 1:1 con el kit.
2. **Paridad RN≡web a 390px** — checklist lado a lado en pantallas clave.
3. **E2E** flujos críticos (login, rutina+offline, comida, check-in, branding) en preview — **regla IO budget: solo con OK explícito**.
4. **White-label live** — coach Pro custom + free system.
5. Merge a master (tras QA + tu visto bueno) + actualizar docs canónicos.
6. Iterar la deuda diferida de arriba.
