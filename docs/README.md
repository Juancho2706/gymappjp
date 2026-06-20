# EVA Docs Index

Ultima modificacion: 2026-05-21 18:25 -04:00

## Lectura rapida

| Documento | Uso |
|---|---|
| `APP_OVERVIEW.md` | Vision funcional de EVA: actores, zonas, rutas y modulos. |
| `architecture/PROJECT_STRUCTURE.md` | Estructura del repo, capas, reglas y ownership. |
| `architecture/FLOWS_AND_COMPONENTS.md` | Flujos principales y que rutas/componentes/actions toca cada uno. |
| `testing/TEST_STATUS.md` | Registro consolidado de pruebas validas y pendientes. |
| `operations/LOCAL_WORKFLOW.md` | Como trabajar local sin tocar live/master. |

## Planes y specs

Las features nuevas se especifican en `specs/<feature>/{SPEC,PLAN,TASKS}.md` (SDD). Los planes estrategicos y de Movida ya ejecutados/cancelados se movieron a `archive/` (ver abajo).

| Documento | Estado |
|---|---|
| `plans/enterprise-reference-matrices.md` | Referencia enterprise (motor vivo, archivado comercialmente). |
| `plans/plan-c-enterprise-dashboard-revenue-mvp.md` | MVP dashboard revenue enterprise. |
| `specs/<feature>/` | Specs vivos de features en diseño/curso (SDD). |

## Archivo historico

`archive/` contiene handoffs, logs de sesiones y material ya shippeado/cancelado. No usar como fuente primaria si contradice documentos canonicos o el codigo:

- `archive/estrategia/` — planes estrategicos ya ejecutados (teams-first, addons, archivado enterprise).
- `archive/movida/` — esfuerzo Movida (deal cancelado 2026-06-16); historial completo.
- `archive/nutrition-overhaul-2026-06/` — auditoria + diseño del overhaul de nutricion/menus (shippeado 2026-06).
- `archive/specs/` — specs de features ya en produccion (exercise-creator, client-excel-import, coach-change-card).

## Docs privados ignorados

Estos existen localmente y estan ignorados por Git:

- `nuevabibliadelaapp/`
- `docs/ANALISIS_PRECIOS.md`
- `docs/BRANDING-IMAGENES-IA.md`
- `docs/COACH_ONBOARDING_PREMIUM_PLAN.md`
- `docs/WHITE-LABEL-ROADMAP.md`
- `AGENTS.md`
- `CLAUDE.md`

Regla: si algo privado se vuelve necesario para el repo publico, crear un resumen limpio en `docs/` sin secretos ni notas personales.
