# EVA Docs Index

Ultima modificacion: 2026-06-24

## Lectura rapida

| Documento | Uso |
|---|---|
| `APP_OVERVIEW.md` | Vision funcional de EVA: actores, zonas, rutas y modulos. |
| `architecture/PROJECT_STRUCTURE.md` | Estructura del repo, capas, reglas y ownership. |
| `architecture/FLOWS_AND_COMPONENTS.md` | Flujos principales y que rutas/componentes/actions toca cada uno. |
| `testing/TEST_STATUS.md` | Registro consolidado de pruebas validas y pendientes. |
| `operations/RUNBOOK.md` | Runbook de incidentes y operacion en prod. |
| `operations/MANUAL_TASKS.md` | Tareas manuales (dashboards, env vars, pagos). |

> Flujo DB actual: remoto/prod via branching de Supabase (ver `CLAUDE.md`). El flujo `local-only` quedo **OBSOLETO** — sus runbooks se archivaron en `archive/ops-local-only/`.

## Planes y specs

Las features nuevas se especifican en `specs/<feature>/{SPEC,PLAN,TASKS}.md` (SDD). Al shippear, el spec se mueve a `archive/specs/`. Los planes estrategicos y de Movida ya ejecutados/cancelados estan en `archive/`.

| Documento | Estado |
|---|---|
| `specs/<feature>/` | Specs vivos SOLO de features en diseño/curso (hoy: `enterprise-alumno-separation`). |
| `plans/` | Planes de producto/estrategia (enterprise reference, dashboard revenue MVP, etc.). |
| `audits/` | Auditorias point-in-time (paridad RN-web, nutricion, etc.). PDFs exportados y chunks crudos van gitignorados; se versionan solo resumenes curados. |

## Archivo historico

`archive/` contiene handoffs, logs de sesiones y material ya shippeado/cancelado. No usar como fuente primaria si contradice documentos canonicos o el codigo:

- `archive/estrategia/` — planes estrategicos ya ejecutados (teams-first, addons, archivado enterprise).
- `archive/movida/` — esfuerzo Movida (deal cancelado 2026-06-16); historial completo.
- `archive/nutrition-overhaul-2026-06/` — auditoria + diseño del overhaul de nutricion/menus (shippeado 2026-06).
- `archive/nuevabibliadelaapp/` — biblia extendida (es) historica; NO canonica (usar codigo + `architecture/`).
- `archive/ops-local-only/` — runbooks del flujo local-only obsoleto (GO_LIVE, MERGE_TO_LIVE, LOCAL_WORKFLOW, etc.).
- `archive/specs/` — specs de features ya en produccion (exercise-creator, client-excel-import, coach-change-card, discount-codes, whitelabel-v2, coach-settings-restructure, addons-billing, identity-workspace-access, enterprise-subdomain, movida-areas/entrenamiento/intercambios/screening).

## Docs privados ignorados

Estos existen localmente y estan ignorados por Git:

- `docs/ANALISIS_PRECIOS.md`
- `docs/BRANDING-IMAGENES-IA.md`
- `docs/COACH_ONBOARDING_PREMIUM_PLAN.md`
- `docs/WHITE-LABEL-ROADMAP.md`
- `AGENTS.md`
- `CLAUDE.md`

> `nuevabibliadelaapp/` ya NO existe en la raiz: se archivo en `archive/nuevabibliadelaapp/`. `CLAUDE.md` / `AGENTS.md` aun la citan como "extended docs" — referencia stale (follow-up local, no committable porque ambos van gitignorados).

Regla: si algo privado se vuelve necesario para el repo publico, crear un resumen limpio en `docs/` sin secretos ni notas personales.
