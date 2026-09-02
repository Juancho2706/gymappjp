---
status: done
owner: product-engineering
last_verified: "2026-09-02"
canonical: false
---

# TASKS — Editar, eliminar y duplicar ejercicios propios

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md). Estado: **CERRADA el 2026-09-02** — en producción (código
`322f2c39`, docs `a99c501a`) con QA del owner verde en web y device. 5 workers Opus por zona + juicio
del jefe. Lo que queda vive en «Backlog heredado» (abajo), no en esta feature.

## W0 · Decisión del owner (2026-09-02)

- [x] W0.1 Mockup aprobado (artifact `9d6f222f-26b4-4f04-b44a-a7e7482c913f`).
- [x] W0.2 Alcance: TODO, con paridad RN/PWA/desktop («tiene que tener RN/PWA y DESKTOP las mismas
      funciones»). W2 se hizo en web **y** RN (solo «Editar» desde el builder, sin Eliminar/Duplicar).
- [x] W0.3 «Deshacer» en toast (sin papelera); RLS del pool team sin cambios.

## W1 · Web catálogo

- [x] W1.1 `cloneExerciseAction` leída: NO usaba `exerciseSchema` sino `CloneExerciseSchema`; descartaba
      la media y el tipo, y nacía personal en workspace team. Reescrita: copia media/tipo/modalidad
      desde la fila origen, owner por `resolveExerciseOwner`, dup-check scopeado, `safeParse`.
- [x] W1.2 `.select('id')` + error con 0 filas en softDelete/restore/update; `revalidatePath` del
      builder de plantillas en create/update/softDelete/restore/clone; el borrado de media al editar
      no borra archivos compartidos por un clon.
- [x] W1.3 Tests: 12 verdes (8 nuevos) en `exercises.actions.test.ts`.
- [x] W1.4 `usageByExercise` en `getExerciseCatalog` (línea «Usado en N bloques»).
- [x] W1.5 `ExerciseFormModal`: prop `onSaved` en modo editar (una vez por guardado).
- [x] W1.6 `ExerciseCatalogClient`: pie del preview (Editar / Eliminar / Duplicar), `AlertDialog`,
      toast con «Deshacer», chip «Propio»/«Del equipo»; la línea de origen decide por `isOwn`.
- [x] W1.7 Gates: ver «Gates y salida» abajo.
- [x] W1.8 Docs: MOBILE_PARITY, CURRENT, MOBILE_RELEASES_OTA, esta SDD. La auditoría de menús
      (`docs/audits/menus/_md/coach-03-programas-planner.md` y su copia en `design-source`) se
      corrigió en local, pero esos archivos están gitignored: no viajan en el repo.
- [x] W1.9 **QA owner web VERDE (02-09)**: editar, eliminar con confirmación, «Deshacer», duplicar,
      chip «Propio», light/dark, PWA. Falta solo confirmar con el coach reportante que lo vio (sin
      WhatsApp: regla de la casa; se entera al usar la app).

## W2 · «Editar» desde el builder (web + RN)

- [x] W2.1 Web: `DraggableExerciseCatalog.tsx` (builder por alumno Y builder de plantillas, misma
      pieza) — botón en el preview de propios; pide la fila completa antes de abrir el modal (la
      lista del builder viene sin `instructions`/`image_url`); `ownerScope` desde las pages.
- [x] W2.2 Web: refresco = `router.refresh()` + fila fresca pisada por id en el catálogo local.
- [x] W2.3 RN: `ExerciseSearchSheet.tsx` — «Editar ejercicio» en el preview de propios reusando el
      `ExerciseFormSheet` embebido; `program-builder.tsx` relee el catálogo (`catalogReloadKey`);
      «Usados recientemente» se resuelve contra el catálogo.
- [x] W2.4 **QA owner VERDE (02-09)** en web y device.

## W3 · RN hardening / paridad

- [x] W3.1 `Alert.alert` de confirmación en `ExerciseFormSheet.remove()` con conteo real de bloques.
- [x] W3.2 `deleteExercise` verifica filas; `restoreExercise` y `countExerciseUsage` nuevas.
- [x] W3.3 Toast «Ejercicio eliminado» con acción «Deshacer» (soporte `action` aditivo en
      `components/Toast.tsx`); `onRestored` en el sheet; línea «Usado en N bloques» en el preview.
- [x] W3.4 **QA device Android del owner VERDE (02-09)**: confirmación, «Deshacer» responde al toque,
      edición desde el builder.

## Gates y salida (2026-09-02, ejecución real)

| Gate | Resultado |
|---|---|
| `pnpm test` (vitest, suite completa) | verde — 635 archivos, 8378 tests |
| `pnpm typecheck` (web) | verde |
| `pnpm --filter @eva/mobile exec tsc --noEmit` | verde |
| `pnpm lint` | 0 errores (522 warnings preexistentes) |
| `pnpm check:tokens` · `check:nutrition-v2-boundaries` · `docs:check` | verde |
| Tests del dominio `exercises.actions.test.ts` | 12 verdes (8 nuevos) |

Salida: commit `322f2c39` en `rnmobiledenuevo` = `master`; deploy web `dpl_7TjwZBD2rk2mBuswTs5Vvh2MLRnb`
READY (02-09 00:41Z); OTA 1.1.2 canal `production` android `547ba203` (run 33576258157) / ios
`26ef40d2` (run 33576265663). Sin `expo export` local: el bundler corrió en el workflow. **QA del owner
verde en web y device (02-09).**

## Backlog heredado (para próximas sesiones; ninguno bloquea)

| # | Deuda | Dónde | Costo estimado |
|---|---|---|---|
| E1 | Un bloque YA colocado en el día conserva el nombre/media viejos tras editar el ejercicio hasta recargar el builder (web y RN): `exercise_name` se copia al agregar el bloque. Arreglo = reconciliar los días contra el catálogo al volver de `onSaved`. | `WeeklyPlanBuilder.tsx`, `program-builder.tsx` | **HECHO 02-09**: `f469a780` (web) + `ba074a92` (RN), en prod con el tren `794aee52`; QA del owner en device VERDE 02-09 (nombre e imagen del bloque se actualizan sin marcar «sin guardar») |
| E2 | `revalidatePath('/coach/builder')` no cubre la ruta dinámica `/coach/builder/[clientId]`; hoy lo tapa `router.refresh()` en la UI. Decidir `type: 'layout'` o dejar. | `exercises.actions.ts` | 30 min |
| E3 | `template-builder.queries.ts` no scopea el catálogo por workspace (preexistente): un coach con team activo ve «Editar» en un ejercicio personal y recibe el error explícito de la action. Arreglo = mismo scope 3 vías que `getExerciseCatalog`. | `workout-programs/builder/_data/template-builder.queries.ts` | 1 h |
| E4 | `usageByExercise` (web) y `countExerciseUsage` (RN) cuentan BLOQUES, no programas (el copy dice «bloques»). Si el owner prefiere «programas»: `distinct` por plan. | `_data/exercises.queries.ts`, `lib/exercises.ts` | 1 h |
| E5 | El clon web no espeja el thumbnail (`mirrorAndSaveExerciseThumbnail`) ni copia `thumbnail_url` (a propósito, para no compartir el archivo); el render cae al GIF/hotlink de YouTube. Paridad con create = 3 líneas. | `cloneExerciseAction` | 30 min |
| E6 | `cloneExerciseAction` sin tests (3 queries encadenadas sobre `exercises`; el harness actual asume una tabla). | `exercises.actions.test.ts` | **HECHO 02-09** (`5f3c48f2`): tests del clon + del helper `resolveExerciseCopyName` (`@eva/workout-engine`), que además arregla «Duplicar» sobre un propio (chocaba por nombre; ahora «(copia)», «(copia 2)», … en web y RN) |
| E7 | Gate por tier muerto: `caps.canCreateCustomExercises` es `true` en todos los planes (regla owner: nada por tier); queda en create/update/media como código inerte. Limpieza opcional. | `exercises.actions.ts`, `exercise-media.actions.ts` | 30 min |
| E8 | La auditoría de menús que afirmaba «editar/borrar/restaurar» en web vive en carpetas gitignored (`docs/audits/menus`, `docs/design-source`): la corrección es solo local. Si se vuelve a generar, regenerar desde el código. | docs locales | — |
| E9 | RN: `countExerciseUsage` dispara una query extra (`head: true`) al abrir la ficha o el sheet de un propio. Barata; vigilar en PostHog/Sentry si crece el catálogo. | `ExercisePreviewSheet.tsx`, `ExerciseFormSheet.tsx` | — |

## Cierre — crónica movida desde `docs/status/CURRENT.md` (2026-09-02)

Texto trasladado literal el 2026-09-02 al reducir `CURRENT.md` a vista mínima. No es
instrucción vigente: es el registro de lo que ya pasó, con sus hashes, deploys y OTAs.

### Ejercicios propios: Editar · Eliminar · Deshacer · Duplicar

**Ejercicios propios: Editar · Eliminar · Deshacer · Duplicar en web + RN — CERRADA (`status: done`, 2026-09-02, [SDD](../ejercicios-propios-web/SPEC.md)):** un coach reportó que no podía borrar sus ejercicios; causa: la web no tenía UI para editar/eliminar/duplicar propios (actions sin call site desde `3aac0089`), RN sí pero borraba sin confirmar. En código (5 workers + juicio): preview del catálogo web con Editar/Eliminar (confirmación con conteo de bloques + toast «Deshacer»)/Duplicar, chip «Propio», «Editar» desde el builder web y RN, confirmación + «Deshacer» + chequeo de filas en RN, `cloneExerciseAction` reparada (copiaba sin media/tipo y nacía personal en team). Detalle en [MOBILE_PARITY](../../status/MOBILE_PARITY.md) (entrada 02-09). **EN PRODUCCIÓN 02-09 00:42Z**: `master` = `rnmobiledenuevo` = `322f2c39`, deploy web `dpl_7TjwZBD2rk2mBuswTs5Vvh2MLRnb` READY, OTA 1.1.2 android `547ba203` / ios `26ef40d2` ([MOBILE_RELEASES_OTA](../../operations/MOBILE_RELEASES_OTA.md)). Gates reales pre-push: vitest 8378 verdes, typecheck web, tsc mobile, lint 0 errores, tokens, boundaries, docs:check. **QA del owner VERDE 02-09 en web y device** («prístino y premium»). Backlog heredado E1–E9 (bloque colocado con nombre viejo hasta recargar, `revalidatePath` del builder dinámico, catálogo de plantillas sin scope por workspace, conteo por bloques, thumbnail del clon, tests de clone, gate por tier inerte) en [TASKS](../ejercicios-propios-web/TASKS.md) § «Backlog heredado» — ninguno bloquea.
