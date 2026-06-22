# Coach Settings / "Mi Marca" Restructure - TASKS

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-06-22
**Spec:** `specs/coach-settings-restructure/SPEC.md`
**Plan:** `specs/coach-settings-restructure/PLAN.md`

> Quick wins de copy/visual del audit YA aplicados (fuera de este backlog): tildes en Funciones, vocab unificado "De pago/Desbloquear" + Lock, eliminación de `WhatChangesList`, helper logo=ícono, header de subpágina unificado (ArrowLeft+chip+font-display), ancho free-tier hub, dedupe DangerZone, botón ayuda mobile reapuntado a `/coach/settings/brand`.

---

## Tasks

- [ ] **T1 — Flatten hub (F1)**
  - Scope: `app/coach/settings/page.tsx` — eliminar `<section> "Opciones Coach"`; promover Módulos/Áreas/Funciones a cards de 1er nivel con el patrón de card completo (tile icono `text-primary`); agrupar Suscripción+Módulos como zona "lo que pago". Revisar coherencia con la variante `team_managed` (ya plana).
  - Verification: typecheck; vitest; visual en standalone + team; sin "Opciones Coach" en el DOM.

- [ ] **T2 — Preview único (F2)**
  - Scope: quitar link "Vista previa" del FAB en `BrandSettingsForm.tsx` (o toggle "Expandir" del preview inline); remover/redirect `app/coach/settings/preview/*`; ajustar guard de team.
  - Verification: typecheck; el preview inline refleja estado dirty; no quedan referencias a /preview; `awareness.spec` del guard sincronizado.

- [ ] **T3 — Cross-link Módulos → Funciones (F3, read-only)**
  - Scope: `modules/_data/modules.queries.ts` aporta visibilidad por módulo (lee feature-prefs vía service, sin Supabase directo en `_data`); `ModulesForm.tsx` muestra "Activo · Visible" / "Activo · Oculto → Mostrar". Módulos sigue read-only.
  - Verification: typecheck; vitest del resolver de visibilidad; cero writes authenticated en Módulos.

- [ ] **T4 — Funciones: lock de módulos no comprados (F3)**
  - Scope: `FeaturePrefsPanel.tsx` — toggles de secciones cuyo módulo no está entitled → deshabilitados con "Comprar en Módulos →" (no permitir prender no-entitled; el gate real ya es server-side).
  - Verification: typecheck; no se puede activar una sección Pro sin entitlement; CTA enlaza a Módulos.

- [ ] **T5 — Empty-states de módulo (F4)**
  - Scope: superficies `coach/cardio`, `coach/movement` (+ nutrición Pro): distinguir "oculto por toggle" (banner "lo tenés activo, está oculto — Mostrar →") de "0 alumnos" (empty-state propio). Cierra el crash conocido con 0 alumnos.
  - Verification: typecheck; repro con coach módulo ON + 0 alumnos = empty-state, no crash; módulo ON + toggle OFF = banner.

- [ ] **T6 — Auto-ON visibilidad en compra (F5, billing path)**
  - Scope: materializador de `coach_addons` (webhook/`services/billing/addons.service.ts`): al activar un módulo, encender la pref de visibilidad del dominio correspondiente en feature-prefs (service-role, idempotente, sin pisar toggles ya elegidos por el coach salvo el `_enabled` del dominio recién comprado). Respetar trigger D1 (no escribir el jsonb de enabled_modules directo).
  - Verification: typecheck; vitest de idempotencia + dominio correcto; integration mock service-role; flujo sandbox: compra → módulo visible sin tocar Funciones.

- [ ] **T7 — Mover Áreas + renames (F6, depende de Open Questions)**
  - Scope: sacar `Áreas del builder` del bucket de entitlements (acceso desde builder/Entrenamiento), manteniendo `/coach/settings/areas` viva (deep-links). Aplicar rename "Funciones" → "Visibilidad de nutrición" si se aprueba.
  - Verification: typecheck; ruta vieja sigue accesible; labels sincronizados en specs.

- [ ] **T8 — Docs + E2E gate**
  - Scope: actualizar `docs/architecture/FLOWS_AND_COMPONENTS.md` (nueva IA + flujo compra→visibilidad); correr la tanda Playwright `tests/separation/*` + smokes de marca **al cierre, con OK explícito**.
  - Verification: docs al día; E2E verde con personas.

## Universal Definition of Done

- [ ] `pnpm typecheck`
- [ ] Targeted tests for touched domain (vitest por tanda)
- [ ] No direct feature-data Supabase calls in `_data` (cross-link lee vía service)
- [ ] Server actions validate with Zod (si se agrega alguna)
- [ ] Mutations call `revalidatePath()` where needed
- [ ] Mobile viewport uses `dvh`, not `vh`/`h-screen`
- [ ] Fixed edge UI uses safe-area utilities
- [ ] Dark mode checked when UI changes
- [ ] New atomic UI has Storybook story (si aplica; preferir route-local)
- [ ] Docs updated when routes, flows, DB, tests, or priorities change
- [ ] `Módulos` permanece compra-only/read-only; gate de dinero server-side intacto

## Notes

- Orden de riesgo: F1/F2 (presentación) → F3/F4 (cross-link + empty-states) → **F5 (billing) último, con gate propio**.
- E2E + cualquier SQL contra Supabase: SOLO al cierre del plan y con OK explícito (regla de la casa / IO budget).
- Preservar telemetría `module_interest_cta_clicked` al reacomodar CTAs.
