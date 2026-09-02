---
status: done
owner: product-engineering
last_verified: "2026-09-02"
canonical: false
---

# PLAN — Editar, eliminar y duplicar ejercicios propios

Ver [SPEC](SPEC.md). Sin DDL, sin RLS nueva, sin dependencias nuevas. Esfuerzo total estimado:
W1 4–6 h · W2 2 h · W3 1–2 h + OTA.

## Arquitectura (sin cambios de capa)

```text
page.tsx (RSC: coach, ctx, workspace, catálogo)
  → ExerciseCatalogClient (client: estado selected/editTarget/confirmDelete)
    → ExercisePreviewModal (+ footer de acciones)
    → ExerciseFormModal exercise={editTarget} (modo editar, ya existe)
    → AlertDialog (confirmar eliminar)
    → server actions: update / softDelete / restore / clone (ya existen)
      → revalidatePath(/coach/exercises, /coach/builder, /coach/workout-programs/builder)
```

`isOwn` no viaja como flag nuevo: se deriva en el cliente como `customIds.has(ex.id)` a partir de
`customExercises`, que el servidor ya scopea por workspace (`_data/exercises.queries.ts:26-38`).
`canManage = canCreateExercises` (ya calculado en `page.tsx:27`; org coach = false).

## W1 · Web (orden de ejecución)

| # | Archivo | Cambio |
|---|---|---|
| 1 | `_actions/exercises.actions.ts` | `softDeleteExerciseAction`/`restoreExerciseAction`: `.select('id')` + error si `data.length === 0`. Agregar `revalidatePath('/coach/workout-programs/builder')` en update/softDelete/restore/clone. Leer contrato real de `cloneExerciseAction(formData)` (l. 111) antes de cablearlo. |
| 2 | `_actions/exercises.actions.test.ts` | Casos nuevos: softDelete/restore scopeados 3 vías (team/coach/org, mismo harness de `createExerciseAction`), y «0 filas ⇒ error». |
| 3 | `_data/exercises.queries.ts` | (Opcional, mismo request) conteo de uso: `workout_blocks.select('exercise_id').in('exercise_id', customIds)` → `usageByExercise: Record<id, n>`. Si RLS de `workout_blocks` recorta (pool team), el número es «de tus programas», no global. |
| 4 | `_components/ExerciseFormModal.tsx` | Prop `onSaved?: () => void` disparada en modo editar cuando `state.success` (hoy solo `onClose()`, l. 213-230). |
| 5 | `ExerciseCatalogClient.tsx` | Estado `editTarget`, `confirmDelete`; `ExercisePreviewModal` recibe `isOwn`, `canManage`, `usage`, `onEdit`, `onDelete`, `onClone`; footer según mockup; `AlertDialog`; toast sonner con `action: { label: 'Deshacer', onClick: restore }`; chip «Propio» en la card (`User` ya importado). |
| 6 | Docs | `docs/audits/menus/_md/coach-03-programas-planner.md:270` (+ copia en `design-source`) corregir claim; `docs/status/MOBILE_PARITY.md` (web alcanza paridad de acciones sobre propios); puntero en `docs/status/CURRENT.md`; esta SDD → `implemented-pending-qa`. |

Copys (del mockup): botón «Editar ejercicio» · «Eliminar» · «Duplicar a mis ejercicios» · dialog
«¿Eliminar “{nombre}”?» / «Se oculta de tu catálogo y del builder. Los programas que ya lo usan lo
conservan tal cual.» / «Cancelar» · «Eliminar» · toast «Ejercicio eliminado» + «Deshacer» ·
error «No se pudo eliminar: el ejercicio no es tuyo o ya no existe.»

## W2 · Web builder (opcional)

`apps/web/src/app/coach/builder/[clientId]/DraggableExerciseCatalog.tsx:352-390`: en el preview,
si `exercise.coach_id === coachId` (o team/org según scope que ya recibe el catálogo) y hay
permiso, botón «Editar» → `ExerciseFormModal exercise=` + `onSaved` → recargar la lista del
catálogo del builder (hoy se hidrata por props; verificar si basta `router.refresh()` o hay que
actualizar el estado local como hace `onCreated` en l. 343).

## W3 · RN (opcional, OTA runtime 1.1.2)

- `apps/mobile/components/coach/ExerciseFormSheet.tsx:232` `remove()`: `Alert.alert('¿Eliminar
  “…”?', 'Se oculta de tu catálogo…', [Cancelar, Eliminar destructive])`.
- `apps/mobile/lib/exercises.ts:460` `deleteExercise`: `.select('id')` y `ok:false` si 0 filas.
- OTA android + ios por GH Actions desde rama con master mergeado (regla de la casa).

## Gates (proporcionales)

- W1: `pnpm --filter web exec vitest run apps/web/src/app/coach/exercises` (o el filtro que aplique
  al harness raíz), `pnpm typecheck`, `pnpm lint` (solo archivos tocados), `pnpm docs:check`.
  Suite completa UNA vez antes del push.
- W3: `pnpm --filter @eva/mobile exec tsc --noEmit`, `expo export` android.
- QA owner (solo contra algo desplegado): preview web light/dark, móvil 390 px; device Android
  para W3.

## Riesgos

- `revalidatePath('/coach/builder')` no cubre `/coach/builder/[clientId]` ni el builder de
  plantillas ⇒ tras borrar, el builder abierto en otra pestaña puede seguir mostrando el
  ejercicio hasta recargar. Mitigación: revalidar las tres rutas + `router.refresh()` al volver.
- `cloneExerciseAction` valida media (`gif_url`/`image_url` con prefijo Storage): un ejercicio de
  sistema con GIF externo (ExerciseDB) puede fallar el clon. RN ya vivió esto (comentario en
  `lib/exercises.ts:283-291`); revisar antes de exponer «Duplicar» y, si falla, copiar la URL sin
  validar prefijo para el clon (decisión en W1.1).
- Team pool: «Eliminar» de un miembro oculta el ejercicio para todo el pool. Copy del dialog en
  contexto team: «Se oculta del catálogo del equipo».
