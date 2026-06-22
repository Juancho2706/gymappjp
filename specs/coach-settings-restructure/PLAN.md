# Coach Settings / "Mi Marca" Restructure - PLAN

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-06-22
**Spec:** `specs/coach-settings-restructure/SPEC.md`

---

## Architecture

Cambio mayormente de **presentación + IA** (presentación) más UN cambio de **servicio/billing** (auto-ON visibilidad). Respeta los 4 pilares y el flujo de datos obligatorio:

```text
app/coach/settings/**/_data/*.queries.ts   (React.cache)
  -> services/{entitlements,billing,feature-prefs}.service.ts
  -> infrastructure/db/*.repository.ts (o service-role client donde ya se usa)
  -> Supabase
```

Invariantes que NO se tocan:
- `Módulos` = **compra-only / read-only** (writes service-role; RLS: SELECT propio). El hub/cards nunca escriben entitlements.
- `coaches.enabled_modules` se sincroniza por el **trigger D1** desde `coach_addons` — nadie escribe el jsonb directo.
- `Funciones` (feature-prefs) = única capa con toggles authenticated; jamás es la frontera de capability (el gate de dinero es server-side).

## Files

| Action | Path | Notes |
|---|---|---|
| UPDATE | `apps/web/src/app/coach/settings/page.tsx` | Aplanar: quitar `<section> "Opciones Coach"`; promover Módulos/Áreas/Funciones a cards de 1er nivel; co-locar Suscripción+Módulos; mismo patrón visual; aplica a variante standalone (y revisar team_managed que ya es plano). |
| UPDATE | `apps/web/src/app/coach/settings/modules/_components/ModulesForm.tsx` | Cross-link: por módulo activo, mostrar estado de visibilidad ("Activo · Visible" / "Activo · Oculto → Mostrar" link a Funciones). Sigue read-only. |
| UPDATE | `apps/web/src/app/coach/settings/modules/_data/modules.queries.ts` | Aportar el estado de visibilidad por módulo (lee feature-prefs vía service; sin Supabase directo). |
| UPDATE | `apps/web/src/components/coach/FeaturePrefsPanel.tsx` | Toggles de módulos NO comprados → deshabilitados con "Comprar en Módulos →"; rename de copy si se decide "Visibilidad de nutrición". |
| UPDATE | `apps/web/src/app/coach/settings/funciones/page.tsx` | Posible rename de título/desc (Open Question). |
| UPDATE | `services/billing/addons.service.ts` (o el materializador del webhook) | **Auto-ON visibilidad:** al activar un módulo, set `_enabled`/sección del dominio correspondiente en feature-prefs (service-role, idempotente). |
| UPDATE | superficies de módulo: `app/coach/cardio/**`, `app/coach/movement/**` (+ nutrición Pro) | Empty-state: distinguir "oculto por toggle" (banner "Mostrar →") de "0 alumnos" (empty-state propio, no crash). Cierra bug conocido. |
| UPDATE | `apps/web/src/app/coach/settings/BrandSettingsForm.tsx` | Quitar el link "Vista previa" del FAB (o convertir en toggle "Expandir" del preview inline). |
| DELETE/UPDATE | `apps/web/src/app/coach/settings/preview/*` | Borrar la ruta /preview (o dejar redirect). Ajustar guard de team. |
| UPDATE | `apps/web/src/app/coach/settings/areas/*` + hub | Mover acceso a Áreas hacia builder/Entrenamiento; mantener ruta viva (deep-links). |
| UPDATE | `tests/separation/*.spec.ts`, `tests/separation/awareness.spec.ts` | Sincronizar asserts de IA/labels y del guard /preview. |
| UPDATE | `docs/architecture/FLOWS_AND_COMPONENTS.md` | Reflejar nueva IA del hub + flujo compra→visibilidad. |

## Data Model

- **DB changes:** ninguna tabla nueva. El auto-ON visibilidad escribe en `coach_feature_prefs`/`team_feature_prefs` (ya existentes) vía service-role; verificar que la escritura desde el path de compra respeta el shape de `sections`/`preset`.
- **RLS impact:** ninguno nuevo. Lectura de visibilidad en Módulos usa service en `_data` (read-only). El auto-ON corre service-role (ya privilegiado en el webhook).
- **Generated types impact:** ninguno (sin columnas nuevas).
- **Column grants:** sin columnas nuevas → no se requiere `GRANT UPDATE(col)` (recordatorio del gotcha por si surge una columna).

## Server Actions

- Sin nuevas actions de escritura de coach. El cross-link en Módulos es read-only.
- El auto-ON visibilidad NO es una server action de usuario: vive en el path de billing (webhook/materializador), service-role, idempotente por `provider_payment_id`/módulo.
- Revalidation: tras auto-ON, el nav y las superficies de módulo deben reflejar visibilidad (el webhook no revalida UI; el coach lo ve en el próximo render — aceptable). Confirmar que `getVisibleNavItems` lee la pref actualizada.

## UI/UX

- **Hub aplanado:** 5 cards (`Mi Marca`, `Suscripción`, `Módulos`, `Áreas`*, `Funciones`*) con un único patrón (tile de icono `text-primary` + título + desc + chevron). `Suscripción` + `Módulos` agrupadas visualmente ("lo que pago"). *Áreas/Funciones según Open Questions.
- **Mobile:** cards = list-detail overview (drill-down full-screen con back). `dvh`, safe areas, targets ≥44px.
- **Dark mode:** todas las cards y estados nuevos con variante dark.
- **Preview único:** inline sticky (ya fiel por CSS variables compartidas con la app real). Opcional toggle "Expandir".
- **Componentes:** route-local (`_components/`); nada a atomic salvo reuse en 3+ domains.

## Phases

1. **F1 — Flatten hub (presentación pura).** Quitar wrapper "Opciones Coach", promover a 5 cards, co-locar Suscripción+Módulos, igualar patrón visual. Sincronizar specs de IA. Bajo riesgo.
2. **F2 — Preview único.** Consolidar en el inline live; remover/*redirect* `/preview` + link del FAB; ajustar guard de team. Bajo riesgo.
3. **F3 — Cross-link Módulos↔Funciones (read-only).** Módulos muestra estado de visibilidad por módulo; Funciones deshabilita toggles no comprados con CTA a Módulos. Medio.
4. **F4 — Empty-states de módulo.** "Oculto → Mostrar" vs "0 alumnos"; cierra el crash conocido. Medio.
5. **F5 — Auto-ON visibilidad en compra (billing path).** Aditivo, idempotente, service-role. **Mayor riesgo — va último, con su propio gate.**
6. **F6 — Mover Áreas + renames (según Open Questions resueltas).**

## Test Plan

- **Unit (vitest, por tanda):** lógica de `getVisibleNavItems` con pref auto-ON; helper de auto-ON visibilidad (idempotencia, dominio correcto, no pisa toggles existentes del coach); resolución de estado de visibilidad por módulo para Módulos.
- **Integration:** materializador de compra → feature-prefs ON (mock service-role).
- **E2E (Playwright, al cierre del plan con OK explícito):** hub aplanado (5 cards, sin "Opciones Coach"); Módulos cross-link; Funciones lock de no-comprados; empty-state "oculto → mostrar"; preview único; guard /preview en team.
- **Manual:** flujo de compra real en preview (sandbox) → módulo aparece y funciona sin tocar Funciones.

## Rollback Plan

- F1–F4 y F6 son presentación/IA → revert = git revert del commit (sin estado persistido).
- F5 (auto-ON) es el único con efecto en datos: el cambio es aditivo (enciende una pref que el coach igualmente podía prender). Revert = quitar el set en el materializador; las prefs ya encendidas quedan ON (no se "desencienden" automáticamente — comportamiento seguro, el coach las controla). Documentar en RUNBOOK.
