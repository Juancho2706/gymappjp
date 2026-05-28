# Exercise Creator — TASKS

**Status:** DRAFT  
**Owner:** TBD  
**Last updated:** 2026-05-26  
**Spec:** `specs/exercise-creator/SPEC.md`  
**Plan:** `specs/exercise-creator/PLAN.md`

---

## Fase 1 — Core (sin media, sin YouTube)

- [ ] T1 — Migration RLS para coaches en tabla `exercises`
  - Scope: `supabase/migrations/TIMESTAMP_rls_coach_exercises.sql` — policies INSERT/UPDATE/DELETE para coach con su coach_id; verificar que policy SELECT existente ya cubre globales + propios
  - Verification: test RLS — Coach A no puede tocar ejercicios de Coach B; coach puede INSERT con su coach_id

- [ ] T2 — `infrastructure/db/exercise.repository.ts`
  - Scope: `getByCoach(coachId)`, `create(data)`, `update(id, coachId, data)`, `softDelete(id, coachId)`. Ownership check en update/delete. No lógica de negocio.
  - Verification: unit tests de ownership check

- [ ] T3 — `services/exercises/exercise.service.ts`
  - Scope: `createExercise()`, `updateExercise()`, `deleteExercise()`. Duplicate name warning (mismo coach, nombre similar). Llama al repository. No importa de `app/`.
  - Verification: unit test de duplicate warning logic

- [ ] T4 — `app/coach/exercises/_data/exercises.queries.ts`
  - Scope: `getCoachExercises(coachId)` con `React.cache`. SELECT columnas específicas (no `SELECT *`). Parallel con `Promise.all` si hay queries adicionales.
  - Verification: typecheck pasa

- [ ] T5 — `app/coach/exercises/_actions/exercises.actions.ts`
  - Scope: `createExercise`, `updateExercise`, `deleteExercise`. Zod validation en cada una. `revalidatePath('/coach/exercises')` y `revalidatePath('/coach/builder/...')` en mutations. Auth check en cada action.
  - Verification: typecheck; test que action sin auth falla

- [ ] T6 — Página `/coach/exercises` (lista)
  - Scope: RSC que carga ejercicios del coach. Lista con cards. Botón "Nuevo ejercicio". Empty state con CTA. Separación visual entre "Mis ejercicios" y (futuro) catálogo global visible.
  - Verification: carga sin errores; empty state visible cuando no hay ejercicios

- [ ] T7 — Formulario crear/editar ejercicio (Fase 1 — solo texto)
  - Scope: `_components/ExerciseForm.tsx`. Campos: nombre, muscle_group, secondary_muscles (multi-select), equipment (multi-select), difficulty, instrucciones (textarea). Sin media ni YouTube en esta fase.
  - Verification: formulario guarda y aparece en lista; edición carga datos existentes

- [ ] T8 — Badge "Mío" en `DraggableExerciseCatalog.tsx`
  - Scope: Agregar dot/badge visual en ejercicios con `coach_id !== null`. Sección "Mis ejercicios" encima cuando hay matches. Sin cambiar la query — ya filtra correctamente.
  - Verification: ejercicio custom aparece con badge; ejercicios globales sin badge

- [ ] T9 — Link en navegación coach
  - Scope: Agregar "Ejercicios" en la nav del coach apuntando a `/coach/exercises`
  - Verification: link visible y funcional

---

## Fase 2 — Media (imagen/GIF + YouTube)

- [ ] T10 — Storage bucket `exercise-media`
  - Scope: Crear bucket en Supabase. Policy: coach sube solo a prefix `{coach_id}/`. Cache-control `public, max-age=31536000, immutable` en uploads. Lifecycle rule auto-delete objetos huérfanos (30 días).
  - Verification: coach puede subir a su prefix; coach no puede subir a prefix de otro

- [ ] T11 — `_components/ExerciseMediaUpload.tsx`
  - Scope: Dropzone para imagen/GIF. Preview inline. Validación MIME server-side (no solo extensión). Máximo 5MB. Compresión 0.7 en mobile (expo-image-picker). Upload a Storage bucket.
  - Verification: archivo de tipo incorrecto rechazado; archivo > 5MB rechazado; imagen válida muestra preview

- [ ] T12 — `_components/YouTubeLinkInput.tsx`
  - Scope: Input de URL. Extractor de `video_id` via regex (cubre youtube.com/watch, youtu.be, /embed/, /shorts/). Validación via oEmbed endpoint (fetch en cliente). Preview embed con `youtube-nocookie.com`. Mensaje de error si video privado. Checkbox de ownership si hay video. Guardar solo `video_id` en DB.
  - Verification: todos los formatos de URL parseados correctamente; video privado muestra error; video no listado embebe correctamente

- [ ] T13 — Integrar media en ExerciseForm
  - Scope: Agregar T11 + T12 al formulario existente. Actions actualizadas para manejar upload de imagen + video_id.
  - Verification: ejercicio con imagen y video crea correctamente; ejercicio sin media crea correctamente

- [ ] T14 — Preview de video en picker
  - Scope: En `DraggableExerciseCatalog.tsx`, ícono de play en ejercicios con `video_url`. Click abre embed preview. `youtube-nocookie.com` en iframe.
  - Verification: video reproduce correctamente en el picker

---

## Fase 3 — Enterprise (org-level)

- [ ] T15 — Migration RLS para org_admin en ejercicios de org
  - Scope: Policy que permite a `org_admin` INSERT/UPDATE/DELETE ejercicios con `org_id = su_org` y `coach_id = null`
  - Verification: org_admin puede gestionar ejercicios org; coach regular no puede crear ejercicios org-level

- [ ] T16 — UI org admin para gestionar biblioteca
  - Scope: Sección en `/org/[slug]/` para crear/editar/eliminar ejercicios de la org. Reutilizar `ExerciseForm.tsx`.
  - Verification: ejercicio org creado por admin aparece en picker de todos los coaches de la org

- [ ] T17 — Badge "Org" en picker
  - Scope: Tercer estado visual en `DraggableExerciseCatalog.tsx`: ejercicios de la org del coach con badge diferenciado (ej. nombre de org o icono de building).
  - Verification: tres estados visuales distintos: global / mío / org

---

## Universal Definition of Done

- [ ] `npm run typecheck`
- [ ] Targeted tests para domain ejercicios
- [ ] No llamadas directas a Supabase en `_data/` (van por repository)
- [ ] Server actions validan con Zod
- [ ] Mutations llaman `revalidatePath()` donde corresponde
- [ ] Mobile viewport usa `dvh` no `vh`
- [ ] Dark mode verificado en componentes nuevos
- [ ] RLS isolation test en CI para Coach A vs Coach B
- [ ] Docs actualizados: `docs/architecture/FLOWS_AND_COMPONENTS.md`

---

## Notes

- No cambiar schema de `exercises` — ya tiene todo. El trabajo es RLS + UI + lógica de YouTube.
- El builder (`DraggableExerciseCatalog.tsx`) ya funciona con ejercicios custom si existen en DB. Solo agregar UI visual (badge, sección).
- Soft delete recomendado sobre hard delete para preservar integridad de planes históricos.
- YouTube: guardar solo `video_id` en `exercises.video_url`, no la URL completa. El embed se construye en frontend.
- Fase 1 es lanzable sola — Fases 2-3 son mejoras independientes.
