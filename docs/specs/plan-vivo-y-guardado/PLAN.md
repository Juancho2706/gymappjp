---
status: in-progress
owner: product-engineering
last_verified: "2026-09-07"
canonical: false
---

# PLAN — Plan vivo y guardado honesto

Ver [SPEC](SPEC.md) · [TASKS](TASKS.md).

## Reparto por archivo, no por tema

Tres carriles. B y C son los dos de web y **no comparten ningún archivo**; C encadena sus tres frentes
porque los tres tocan `WeeklyPlanBuilder.tsx`.

| Carril | Superficie | Archivos | Requisitos |
|---|---|---|---|
| **A** | RN | `ProgramCard.tsx`, `ProgramPreviewCard.tsx`, `(tabs)/builder.tsx`, `library-actions.ts` | R4 |
| **B** | Web · biblioteca | `ProgramRow.tsx`, `ProgramPreviewPanel.tsx`, `WorkoutProgramsClient.tsx`, `LibraryToolbar.tsx`, `libraryStats.ts` | R1.3, R2.1, R2.2 |
| **C** | Web · builder | `WeeklyPlanBuilder.tsx`, `_data/builder.queries.ts`, `page.tsx`, `types.ts` | R1.1, R1.2, R2.1, R2.2, R3 |

## Contratos entre carriles

Ninguno escribe en el archivo de otro. El único concepto compartido es el **copy**, fijado acá para
que no aparezcan tres variantes:

| Concepto | Texto exacto |
|---|---|
| Estado inactivo (badge) | `Ya no está en uso` |
| Estado activo (badge, solo asignados) | `En uso` |
| Identidad plantilla | `Plantilla` |
| Identidad copia | `Plan de <nombre del alumno>` |
| Linaje de la copia | `Copia de «<nombre de la plantilla>»` |
| Aviso builder, título | `<Alumno> ya no ve esta rutina.` |
| Aviso builder, cuerpo | `Quedó guardada como historial cuando le asignaste «<programa activo>». Lo que edites acá no le va a llegar.` |
| Aviso builder, cuerpo sin activo | `Quedó guardada como historial y <alumno> no tiene ninguna rutina activa.` |
| Aviso builder, CTA | `Ir a la rutina que <alumno> está usando` |
| Botón guardar | `Guardar cambios` |

## Datos: nada nuevo en la base

- `is_active` **ya llega** al builder (`builder.queries.ts:89`, `select('*')`) y a la biblioteca
  (`workout-programs-library.ts:7`, `select('*')`; el tipo ya lo declara en `libraryStats.ts:20`).
- `source_template_id` **ya llega** por el mismo camino y no se lee en ninguna UI web.
- Lo único que hace falta pedir es el **programa activo del alumno** para el CTA del aviso (R1.2):
  una lectura extra en `getBuilderData`, dentro de la misma ola, solo cuando el programa abierto
  está inactivo y hay `clientId`.

## Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| El aviso tapa contenido en móvil | Va dentro del `<header>`, mismo patrón que `showBuilderHint` (`WeeklyPlanBuilder.tsx:1424`), que ya convive con `ProgramPhasesBar` |
| Lectura extra en el camino crítico del builder | Solo cuando `is_active === false`; el 62 % de los asignados no la paga nunca |
| Romper la vista previa compartida | `StatusBadge` sirve a fila móvil y a header del preview (`ProgramRow.tsx:38-56`): se cambia el copy en un solo lugar |
| Retirar el sync deja imports muertos | El carril A borra también los imports de `GitMerge` y el estado `sync-…` de `actionBusy` |
| `templateLabel` de `libraryStats.ts:68-71` es código muerto | Se aprovecha el paso para conectarlo o borrarlo, no se deja a medias |

## Gates

`pnpm docs:check` · `pnpm lint` · `pnpm typecheck` · `pnpm check:tokens` · vitest de los tres directorios
tocados. Es lo que bloquea en CI (`ci.yml`: `quality` + `unit`).

## Entrega

Commit en `rnmobiledenuevo`. **Push, deploy y OTA solo con visto bueno explícito del owner.**
