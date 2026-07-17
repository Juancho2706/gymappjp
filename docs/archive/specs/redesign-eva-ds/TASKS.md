# TASKS — Rediseño total EVA

Checklist por fase con Definition of Done (DoD). Las tareas por pantalla/componente se generan en extracción (`specs/redesign-eva-ds/{screens,components}/`). Espejo en el task list de la sesión (TaskCreate #1–#12).

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho.

---

## Fase E — Extracción (task #1) `[~]`
- [~] Snapshot verbatim del diseño a `docs/design-source/` (forks vía DesignSync): components, guidelines, tokens, styles.css, ui_kits/eva-app/** , ui_kits/eva-desktop/** , uploads/menus/_md/** , scraps/*.txt.
- [ ] Specs por componente (13) en `specs/redesign-eva-ds/components/` (props del `.prompt.md`, variantes, medidas, estados).
- [ ] Specs por pantalla (coach ~42 + alumno ~13 + desktop) en `specs/redesign-eva-ds/screens/` (layout, zonas, estados, datos que consume, acciones).
- [ ] **Matriz feature-preservation** `specs/redesign-eva-ds/feature-matrix.md`: cada función actual (web+mobile) → ubicación en el diseño nuevo (incl. reubicaciones: mini-menú módulos alumno, navbar nuevo). Marcar huérfanas.
- **DoD:** disco completo + specs + matriz sin huérfanas inexplicadas.

## Fase 0 — Tokens (task #2) `[ ]`
- [ ] Web: ramps + capa semántica + radius semántico + dark `.dark` en `globals.css @theme`; mapear nombres shadcn.
- [ ] Mobile: ramps + `--color-*` re-derivados + `tailwind.config` (utilidades semánticas + radius + families) + dark.
- [ ] Fuentes Archivo + JetBrains Mono (web `next/font`; mobile `@expo-google-fonts`); Hanken = UI default.
- [ ] D2: `@eva/brand-kit` emite `sportRamp`; inyección web (`coach/layout` + `/c/[slug]`) y mobile (`brandVars`). Tests WCAG.
- **DoD:** `typecheck`+`lint`+build verde web y mobile; un toggle dark + un coach Pro custom recolorean; pantallas aún sin re-skin.

## Fase 1 — Componentes core (task #3) `[ ]`
- [ ] Web (13): Button, IconButton, Badge, Avatar, Card, Tag, StatCard, ProgressRing, ProgressBar, Input, SegmentedControl, ListRow, TabBar (restyle shadcn + nuevos).
- [ ] Mobile (13): restyle de los existentes + crear faltantes (StatCard; ComplianceRing→ProgressRing).
- [ ] Showcase verificable por componente (light+dark) 1:1 con `components/*/*.card.html` del diseño.
- **DoD:** los 13 existen en ambas, gate verde, paridad visual con showcases.

## Fase 2 — Shell + navegación (task #4) `[ ]`
- [ ] Coach desktop shell: sidebar expand/rail + topbar (breadcrumb drill-down + búsqueda global + campana dropdown + cuenta).
- [ ] Coach mobile chrome + alumno navbar NUEVO + tab bar blur.
- [ ] Regla <760px = app mobile verbatim; web responsive ≡ RN.
- **DoD:** navegación completa con chrome nuevo, gate verde, paridad mobile.

## Fases 3–9 — Pantallas (tasks #5–#11) `[ ]`
Para CADA pantalla, en web y mobile:
- [ ] Implementada 1:1 con su spec de diseño (layout, estados, dark).
- [ ] Conectada a datos/acciones reales (NO mocks) — reusa `_data`/`_actions`/reducers/engines existentes.
- [ ] Funciones actuales preservadas (chequear contra feature-matrix).
- [ ] Web responsive (mobile) ≡ RN.
- [ ] Gate verde por tanda.

(3) Dashboards alumno+coach · (4) Alumnos+Ficha · (5) Programas+Builder · (6) Nutrición · (7) Módulos+mini-menú alumno · (8) Ajustes+Suscripción+Teams · (9) Auth+estados+Rutina+Historial+Aprender+Check-in.

## Fase Cierre (task #12) `[ ]`
- [ ] Checklist paridad RN≡web 390px (pantallas clave) verde.
- [ ] Feature-matrix verificada: cero función huérfana.
- [ ] QA visual light+dark todas las pantallas.
- [ ] White-label: coach Pro custom + free system, web+mobile.
- [ ] E2E flujos críticos en preview con OK del CEO.
- [ ] Canónicos actualizados (`docs/README`, `FLOWS_AND_COMPONENTS`, `PROJECT_STRUCTURE`, `TEST_STATUS`).
- **DoD:** todo el diseño implementado tal cual; recién ahí se abren mejoras.
