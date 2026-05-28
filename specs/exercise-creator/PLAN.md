# Exercise Creator — PLAN

**Status:** DRAFT  
**Owner:** TBD  
**Last updated:** 2026-05-26  
**Spec:** `specs/exercise-creator/SPEC.md`

---

## Architecture

Feature se integra sobre infraestructura existente sin cambios de schema. La tabla `exercises` ya tiene `coach_id`, `video_url`, `gif_url`, `instructions`, `muscle_group`, etc. La query del builder ya filtra por coach_id. El trabajo real es: RLS + UI de creación + YouTube embed.

Data flow obligatorio (Clean Architecture EVA):

```
app/coach/exercises/_data/exercises.queries.ts
  → services/exercises/exercise.service.ts
  → infrastructure/db/exercise.repository.ts
  → Supabase (tabla exercises)
```

Nota: `DraggableExerciseCatalog.tsx` ya usa `builder.queries.ts` que ya filtra `.or('coach_id.is.null, coach_id.eq.${user.id}')` — el picker no necesita cambios de query, solo UI (badge + sección "Mis ejercicios").

---

## Capas del modelo de ejercicios

```
exercises table
├── is_global = true, coach_id = null, org_id = null   → EVA global (seed)
├── coach_id = X, org_id = null                        → Coach X privado
└── org_id = Y, coach_id = null                        → Org Y compartido
```

RLS policies necesarias:
- `SELECT`: coach ve globales + propios + de su org
- `INSERT`: coach puede insertar con su propio `coach_id` (actualmente solo admin puede)
- `UPDATE/DELETE`: coach solo puede tocar sus propios ejercicios
- Org admin puede INSERT/UPDATE/DELETE ejercicios de su org

---

## Files

| Action | Path | Notes |
|---|---|---|
| CREATE | `app/coach/exercises/page.tsx` | Biblioteca de ejercicios del coach — lista + CTA crear |
| CREATE | `app/coach/exercises/new/page.tsx` | Formulario completo creación (con media) |
| CREATE | `app/coach/exercises/[id]/edit/page.tsx` | Edición de ejercicio existente |
| CREATE | `app/coach/exercises/_data/exercises.queries.ts` | `getCoachExercises()` con React.cache |
| CREATE | `app/coach/exercises/_actions/exercises.actions.ts` | createExercise, updateExercise, deleteExercise |
| CREATE | `app/coach/exercises/_components/ExerciseForm.tsx` | Formulario compartido create/edit |
| CREATE | `app/coach/exercises/_components/ExerciseCard.tsx` | Card de ejercicio en la biblioteca |
| CREATE | `app/coach/exercises/_components/YouTubeLinkInput.tsx` | Input especializado con preview embed + validación |
| CREATE | `app/coach/exercises/_components/ExerciseMediaUpload.tsx` | Upload imagen/GIF con preview |
| UPDATE | `app/coach/builder/[clientId]/DraggableExerciseCatalog.tsx` | Agregar badge "Mío" + sección "Mis ejercicios" |
| CREATE | `services/exercises/exercise.service.ts` | Lógica de negocio (ownership check, duplicate warn) |
| CREATE | `infrastructure/db/exercise.repository.ts` | DB operations |
| CREATE | `supabase/migrations/TIMESTAMP_rls_coach_exercises.sql` | RLS policies para coach INSERT/UPDATE/DELETE |
| UPDATE | `app/coach/layout.tsx` o nav | Agregar link a /coach/exercises |

---

## Data Model

**Schema: sin cambios.** Tabla `exercises` ya tiene todos los campos necesarios.

**Migration requerida:** solo RLS policies nuevas.

```sql
-- Coach puede insertar sus propios ejercicios
CREATE POLICY "coaches_insert_own_exercises"
  ON exercises FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid());

-- Coach puede actualizar sus propios ejercicios
CREATE POLICY "coaches_update_own_exercises"
  ON exercises FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid());

-- Coach puede eliminar sus propios ejercicios
CREATE POLICY "coaches_delete_own_exercises"
  ON exercises FOR DELETE
  TO authenticated
  USING (coach_id = auth.uid());

-- Coach ve globales + propios + de su org
-- (verificar que la policy SELECT existente ya cubre esto)
```

**Storage:**
- Nuevo bucket: `exercise-media`
- Policy: coach sube a prefix `{coach_id}/` solamente
- Lifecycle: objetos no referenciados en DB → auto-delete a los 30 días
- Cache-control en thumbnails: `public, max-age=31536000, immutable`

**Después de migration:** regenerar `src/lib/database.types.ts`.

---

## YouTube Embed — Lógica

### Extracción de video_id

Regex que cubre todos los formatos de URL de YouTube:
- `youtube.com/watch?v=ID`
- `youtu.be/ID`
- `youtube.com/embed/ID`
- `youtube.com/shorts/ID`

Se guarda solo el `video_id` en `exercises.video_url` (no la URL completa).

### Embed en frontend

`https://www.youtube-nocookie.com/embed/{video_id}` — privacy-enhanced, sin cookies de tracking.

### Validación de video privado

Al pegar URL: hacer fetch al oEmbed endpoint de YouTube (`https://www.youtube.com/oembed?url=...`). Si retorna 401/403 → video privado → mostrar error. Si retorna 200 → video embebible → mostrar preview. Esta validación es en cliente (no cuesta cuota de YouTube API).

### Ownership en v1

Checkbox de confirmación al guardar. Registro en audit log si existe. Sin OAuth en v1.

---

## Server Actions

**`createExercise(formData)`**
- Validación Zod: nombre requerido, muscle_group requerido, video_url opcional (debe ser YouTube válido), instrucciones opcionales
- Extrae video_id si hay URL
- Upload imagen a Storage si hay archivo
- INSERT en `exercises` con `coach_id = auth.uid()`
- `revalidatePath('/coach/exercises')`
- `revalidatePath('/coach/builder/[clientId]')` — para que picker se actualice

**`updateExercise(id, formData)`**
- Check ownership: `WHERE id = $id AND coach_id = auth.uid()`
- Misma validación Zod
- UPDATE solo campos enviados

**`deleteExercise(id)`**
- Check ownership server-side
- Soft delete preferido: `deleted_at = now()` — preserva integridad de planes históricos
- Si no existe `deleted_at` en schema: agregar en migration

---

## UI/UX — Detalles de Diseño

### Entry points

1. **Desde navbar coach** → `/coach/exercises` → biblioteca completa
2. **Desde builder** → picker → botón "Crear ejercicio" inline (abre modal rápido con nombre + músculo + instrucciones) → al guardar, vuelve al picker con el nuevo ejercicio ya seleccionable

### Flujo de creación (página completa)

Formulario en una sola página con scroll — no wizard multi-paso:
1. Nombre del ejercicio
2. Grupo muscular (selector) + músculos secundarios (multi-select)
3. Equipamiento (multi-select) + Dificultad (selector)
4. Instrucciones (textarea rico o markdown plano — decidir en implementación)
5. Imagen/GIF — dropzone con preview
6. Link de YouTube — input con botón "Verificar" y embed preview inline
7. Checkbox de ownership si hay video
8. Guardar / Cancelar

### Picker (DraggableExerciseCatalog.tsx) — cambios

- Si coach tiene ejercicios propios Y hay matches con la búsqueda actual: sección "Mis ejercicios" aparece arriba con separador visual
- Badge "Mío" (dot verde) en cada ejercicio propio
- Ícono de play si tiene video_url
- Sin sección "Mis ejercicios" si no hay ninguno → empty state inline: "Aún no tienes ejercicios propios — [Crear]"

### Draft local

`localStorage` guarda borrador del formulario cada keystroke. Al reabrir el formulario vacío, ofrece restaurar borrador: "Tienes un ejercicio sin guardar. ¿Continuar editándolo?"

### Mobile

Formulario funciona igual en móvil. Imagen: `expo-image-picker` con compresión 0.7 antes de upload. Cámara directa disponible.

---

## Phases

### Fase 1 — Core (lanzable)
- Migration RLS
- Repository + Service + Actions (CRUD)
- Página `/coach/exercises` con lista + crear + editar + eliminar
- Integración en picker: badge "Mío" + sección encima
- Sin YouTube, sin imagen — solo texto

### Fase 2 — Media
- Storage bucket + upload imagen/GIF
- YouTube link input con validación + embed preview
- Checkbox ownership

### Fase 3 — Enterprise
- Ejercicios a nivel org (`org_id` sin `coach_id`)
- Permisos org_admin para gestionar biblioteca org
- Badge "Org" diferenciado en picker

### Fase 4 — YouTube OAuth (v2 enterprise)
- Google OAuth integration
- YouTube Data API v3 — listar videos propios del coach
- Selector de video en lugar de input de URL

---

## Test Plan

**Unit:**
- `extractYouTubeVideoId()` — todos los formatos de URL
- `validateYouTubeEmbed()` — video público vs privado vs URL inválida
- `exercise.service.ts` — ownership check, duplicate warning logic

**Integration (RLS):**
- Coach A no puede SELECT ejercicios de Coach B
- Coach A no puede UPDATE/DELETE ejercicios de Coach B
- Coach puede INSERT con su `coach_id`
- INSERT con `coach_id = null` debe fallar para coach (solo admin puede)

**E2E crítico:**
- Crear ejercicio → ir a builder → buscar por nombre → aparece con badge "Mío" → asignar a bloque → guardar plan → cliente ve plan con ejercicio custom
- Eliminar ejercicio → plan existente no crashea

**Manual:**
- Video privado de YouTube → error visible
- Video no listado → embed correcto con youtube-nocookie
- Imagen corrupta (0 bytes) → error manejado
- Nombre con tildes y ñ → guarda y muestra correctamente

---

## Rollback Plan

Migration RLS es aditiva (add policies) — rollback = drop policies nuevas. No hay cambio de schema de datos. Storage bucket vacío se puede eliminar. Feature flags no son necesarios si la ruta `/coach/exercises` es nueva — simplemente no linkear desde nav en producción hasta estar listo.
