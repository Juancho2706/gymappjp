# EVA Docs Index

Ultima modificacion: 2026-05-21 18:25 -04:00

## Lectura rapida

| Documento | Uso |
|---|---|
| `APP_OVERVIEW.md` | Vision funcional de EVA: actores, zonas, rutas y modulos. |
| `architecture/PROJECT_STRUCTURE.md` | Estructura del repo, capas, reglas y ownership. |
| `architecture/FLOWS_AND_COMPONENTS.md` | Flujos principales y que rutas/componentes/actions toca cada uno. |
| `testing/TEST_STATUS.md` | Registro consolidado de pruebas validas y pendientes. |
| `status/CURRENT_PHASE.md` | Estado operativo de la rama `v2/enterprise`. |
| `status/NEXT_STEPS.md` | Opinion tecnica actual y orden recomendado de trabajo. |
| `operations/LOCAL_WORKFLOW.md` | Como trabajar local sin tocar live/master. |

## Planes vivos

| Documento | Estado |
|---|---|
| `plans/ENTERPRISE_PLAN.md` | Implementado y validado en local. |
| `plans/ARCHITECTURE_100_PLAN.md` | Cerrado contra gates medibles. |
| `plans/EXECUTION_PLAN.md` | Plan maestro historico/largo. Usar como referencia, no como fuente unica. |
| `plans/AUDIT_PLAN.md` | Auditoria pre-enterprise historica. |
| `plans/ENTERPRISE_DEMO_AND_ROADMAP.md` | Material demo/roadmap enterprise. |

## Archivo historico

`archive/` contiene handoffs y logs de sesiones. No usar como fuente primaria si contradice documentos canonicos.

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
