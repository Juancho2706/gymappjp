---
status: implemented-pending-qa
owner: product-engineering
last_verified: "2026-09-02"
canonical: false
---

# SPEC — Editar, eliminar y duplicar ejercicios propios (web + RN)

> **IMPLEMENTADA EN CÓDIGO — 2026-09-02** (W1 web + W2 builder web y RN + W3 RN; el owner pidió
> paridad total RN/PWA/desktop). Mockup aprobado: artifact `9d6f222f-26b4-4f04-b44a-a7e7482c913f`.
> Queda el QA visual/device del owner (ver [TASKS](TASKS.md)). Origen: reporte del coach Gerardo
> («no puedo eliminar ejercicios que yo mismo creé»). Detalle de lo que cambió en cada plataforma
> en [MOBILE_PARITY](../../status/MOBILE_PARITY.md) (entrada 02-09).

## Problema

La web **no tiene ninguna puerta** para editar, eliminar ni duplicar un ejercicio propio. El
catálogo (`/coach/exercises`) solo crea y previsualiza. Las server actions existen desde
`3aac0089` y nunca tuvieron call site:

| Action (`apps/web/src/app/coach/exercises/_actions/exercises.actions.ts`) | Estado |
|---|---|
| `updateExerciseAction` (l. 326) | Cableada en `ExerciseFormModal` (modo `exercise=`), pero nadie abre el modal con ese prop |
| `softDeleteExerciseAction` (l. 418) | 0 call sites |
| `restoreExerciseAction` (l. 437) | 0 call sites |
| `cloneExerciseAction` (l. 111) | 0 call sites |

RN sí lo tiene (`ExercisePreviewSheet` → «Editar ejercicio» / «Duplicar a mis ejercicios»;
`ExerciseFormSheet.remove()` → `deleteExercise`), pero **borra sin confirmación**.

La auditoría `docs/audits/menus/_md/coach-03-programas-planner.md:270` (y su copia en
`docs/design-source/uploads/menus/_md/`) afirma que web tiene «crear/editar/borrar/restaurar»:
es falso y se corrige en la misma tanda.

## Evidencia (verificada 2026-09-02 contra `HEAD 9991d42b` y LIVE)

- Coach reportante: `d7e6f838-…` (free active, alta 28-08, standalone: sin team ni org). 8
  ejercicios propios (`source: coach`, `org_id`/`team_id` null, 0 con `deleted_at`), 7 de ellos
  usados en `workout_blocks` (1–3 bloques cada uno).
- PostHog 7 d: **100 % `$lib=web`**, cero eventos RN. Estuvo en `/coach/exercises` el 01-09 y
  02-09; `$rageclick` el 01-09 23:48Z sobre el header colapsable de un grupo muscular (buscaba
  algo que hacer con sus ejercicios y no había nada).
- Sentry: sin issues relacionados (el flujo nunca corre, no puede fallar).

## Datos que fijan el diseño

- `workout_blocks.exercise_id` → `exercises(id)` es `ON DELETE RESTRICT`: **solo soft delete**
  (`deleted_at`). Cero DDL.
- Los joins del lado alumno (`workout-execution.queries.ts:116`, `client-detail.service.ts:89`,
  `dashboard.queries.ts:95`) **no filtran `deleted_at`** ⇒ un programa existente sigue mostrando
  el ejercicio eliminado. Eliminar = «ocultar del catálogo y del builder», nunca romper rutinas.
- RLS vigente ya autoriza el UPDATE de `deleted_at`: `exercises_update_own` (coach_id = uid ∧
  org_id null), `exercises_team_update` (cualquier miembro activo del pool), `exercises_org_update`
  (solo admin). Grants `UPDATE(deleted_at)` a `authenticated` presentes. **No se toca RLS.**
- Gotcha: `update().eq('id').eq('coach_id')` con 0 filas devuelve éxito silencioso en PostgREST
  (web y RN). Hoy un borrado que no matchea «triunfa» sin borrar nada.
- `getTierCapabilities('free').canCreateCustomExercises === true` (test `constants.test.ts:105`):
  el gate por tier de create/update es inocuo. Regla owner 31-08: nada se gatea por tier.

## Alcance

### W1 · Web — catálogo `/coach/exercises` (obligatorio)

1. **Acciones en el preview** (`ExercisePreviewModal`, `ExerciseCatalogClient.tsx:293`):
   - Propio (`id ∈ customExercises`) y `canCreateExercises`: «Editar ejercicio» (primario) y
     «Eliminar» (secundario, tono peligro). Línea de contexto: «Usado en N bloques de tus
     programas» cuando N > 0 (si el conteo no está disponible, se omite la línea, no se inventa).
   - Sistema y `canCreateExercises`: «Duplicar a mis ejercicios» (`cloneExerciseAction`).
   - Org coach (`canCreateExercises = false`): sin acciones, como hoy (mismo gate que crear).
   - Team activo: las acciones operan sobre el pool (`team_id`), etiqueta «Del equipo» en vez de
     «Propio». Es la política RLS vigente; no se cambia en esta tanda.
2. **Editar** abre el `ExerciseFormModal` existente con `exercise=`; al guardar cierra y refresca
   el catálogo (`router.refresh()`); el modal ya titula «Editar ejercicio» / «Guardar cambios».
3. **Eliminar** pide confirmación (`components/ui/alert-dialog.tsx`): «¿Eliminar “{nombre}”?» +
   «Se oculta de tu catálogo y del builder. Los programas que ya lo usan lo conservan tal cual.»
   Confirmar ⇒ `softDeleteExerciseAction` ⇒ toast «Ejercicio eliminado» con acción **«Deshacer»**
   (≈8 s) ⇒ `restoreExerciseAction`. Sin papelera ni vista de restaurar (fuera de alcance).
4. **Chip «Propio»** en las cards del catálogo (icono `User`), paridad con el badge de RN.
5. **Hardening de actions**: `softDeleteExerciseAction` / `restoreExerciseAction` (y el update)
   piden `.select('id')` y devuelven error si 0 filas («No se pudo eliminar: el ejercicio no es
   tuyo o ya no existe»). Revalidar también `/coach/workout-programs/builder` (hoy solo
   `/coach/exercises` y `/coach/builder`; el builder de plantillas, donde vive el coach, no se
   revalida).

### W2 · Web — preview del builder (opcional, owner decide)

`DraggableExerciseCatalog.tsx:352` tiene su propio `Dialog` de preview. Agregar «Editar» para
propios ahí (reusa `ExerciseFormModal` + `onSaved` → recargar catálogo del builder). Eliminar NO va
en el builder (el coach está armando un día; borrar desde ahí confunde).

### W3 · RN — hardening (opcional, sale por OTA)

- `ExerciseFormSheet.remove()` (`apps/mobile/components/coach/ExerciseFormSheet.tsx:232`):
  `Alert.alert` de confirmación antes de borrar, mismo copy que web.
- `deleteExercise` (`apps/mobile/lib/exercises.ts:460`): `.select('id')` y error si 0 filas.

## No alcance

- Hard delete, papelera, restaurar desde UI (más allá del «Deshacer» del toast), reasignar
  bloques, cambiar RLS del pool team, DDL, tocar Enterprise.

## Criterios de aceptación

- AC1 Preview de propio muestra Editar + Eliminar; de sistema muestra Duplicar; org coach nada.
- AC2 Editar guarda y el catálogo refleja el cambio sin recargar a mano.
- AC3 Eliminar confirma, oculta del catálogo y del builder (plantillas y por alumno), y el toast
  «Deshacer» lo devuelve.
- AC4 Un programa que ya usaba el ejercicio se sigue viendo igual para coach y alumno.
- AC5 Borrar/restaurar/editar con 0 filas afectadas muestra error, nunca éxito.
- AC6 Duplicar crea un propio editable y avisa por toast.
- AC7 Light/dark + white-label (tokens `--sport-*`) + móvil (botones a lo ancho, dialog scrollable).
- AC8 (W3) RN pregunta antes de borrar y no reporta éxito con 0 filas.

## Decisiones abiertas para el owner

1. ¿W1 solo, W1+W3, o W1+W2+W3? (recomendación: **W1 + W3**; W2 después de ver uso real).
2. ¿«Deshacer» en toast basta o quieren papelera/restaurar? (recomendación: toast).
3. Team pool: hoy cualquier miembro activo edita/borra ejercicios del pool (RLS). ¿Se mantiene?
   (recomendación: sí, no tocar RLS ahora).
