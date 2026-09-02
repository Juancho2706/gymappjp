---
status: implemented-pending-qa
owner: product-engineering
last_verified: "2026-09-02"
canonical: false
---

# TASKS — Editar, eliminar y duplicar ejercicios propios

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md). Estado: **implementada en código el 2026-09-02** (W1 + W2 web y
RN + W3), 5 workers Opus por zona + juicio del jefe. Queda el QA del owner.

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
- [x] W1.7 Gates: ver «Gates» abajo.
- [x] W1.8 Docs: auditoría de menús corregida (2 copias), MOBILE_PARITY, CURRENT, esta SDD.
- [ ] W1.9 **QA owner** en producción: preview propio (Editar guarda y refresca; Eliminar → confirmación
      con conteo → desaparece → «Deshacer» lo devuelve), preview de sistema (Duplicar), chip «Propio»,
      light/dark, PWA 390 px (pie apilado, dialog sobre preview). Verificar con el coach reportante que
      ya puede editar y eliminar (sin WhatsApp: regla de la casa).

## W2 · «Editar» desde el builder (web + RN)

- [x] W2.1 Web: `DraggableExerciseCatalog.tsx` (builder por alumno Y builder de plantillas, misma
      pieza) — botón en el preview de propios; pide la fila completa antes de abrir el modal (la
      lista del builder viene sin `instructions`/`image_url`); `ownerScope` desde las pages.
- [x] W2.2 Web: refresco = `router.refresh()` + fila fresca pisada por id en el catálogo local.
- [x] W2.3 RN: `ExerciseSearchSheet.tsx` — «Editar ejercicio» en el preview de propios reusando el
      `ExerciseFormSheet` embebido; `program-builder.tsx` relee el catálogo (`catalogReloadKey`);
      «Usados recientemente» se resuelve contra el catálogo.
- [ ] W2.4 QA owner: editar desde el builder (web desktop, PWA, Android) y ver el cambio en el
      catálogo lateral. Deuda declarada: un bloque YA colocado en el día conserva el nombre viejo
      hasta recargar (web y RN).

## W3 · RN hardening / paridad

- [x] W3.1 `Alert.alert` de confirmación en `ExerciseFormSheet.remove()` con conteo real de bloques.
- [x] W3.2 `deleteExercise` verifica filas; `restoreExercise` y `countExerciseUsage` nuevas.
- [x] W3.3 Toast «Ejercicio eliminado» con acción «Deshacer» (soporte `action` aditivo en
      `components/Toast.tsx`); `onRestored` en el sheet; línea «Usado en N bloques» en el preview.
- [ ] W3.4 QA device Android del owner: confirmación, «Deshacer» responde al toque (el pill vive
      dentro del `GestureDetector` del toast), edición desde el builder.

## Gates (2026-09-02, ejecución real)

Se registran en el commit de salida y en [MOBILE_RELEASES_OTA](../../operations/MOBILE_RELEASES_OTA.md).

## Deuda / decisiones abiertas

- `revalidatePath('/coach/builder')` no cubre `/coach/builder/[clientId]` (ruta dinámica); mitigado
  con `router.refresh()` en la UI. Dejar así o revalidar con `type: 'layout'` (decisión aparte).
- `template-builder.queries.ts` no scopea el catálogo por workspace (preexistente): un coach con team
  activo ve «Editar» en un personal y recibe el error explícito de la action.
- `countExerciseUsage` / `usageByExercise` cuentan BLOQUES, no programas (copy dice «bloques»).
