import * as ImageManipulator from 'expo-image-manipulator'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabase'
import { selectWithFallback } from './db-compat'
import { getCoachOrgContext } from './org'
import type { ClientActionWorkspace } from './client-actions'
import { resolveExerciseCopyName } from '@eva/workout-engine'
import {
  builderExerciseWorkspaceFilter,
  exerciseMatchesBuilderWorkspace,
} from './exercise-workspace'
export {
  builderExerciseWorkspaceFilter,
  exerciseMatchesBuilderWorkspace,
} from './exercise-workspace'

// Coach exercise library. Reads via Supabase (RLS: system exercises +
// coach-owned). Mutations run under the coach session (RLS enforces coach_id =
// auth.uid()). Mirrors the web feature `app/coach/exercises` but media upload to
// storage is deferred — mobile creation accepts a YouTube/GIF URL paste.

// Catálogo de grupos musculares y equipo: fuente única en @eva/workout-engine
// (`muscle-map`), compartida con la web. Acá solo se RE-EXPORTA para no tocar los call
// sites (`ejercicios.tsx`, `ExerciseSearchSheet`, `ExerciseFormSheet`). La lista de RN
// tenía 17 valores y le faltaba «Movilidad» (31 filas en LIVE la usan): al editar uno de
// esos ejercicios no quedaba ninguna opción marcada y el grupo no se podía volver a elegir.
export {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_REGIONS,
  EQUIPMENT_OPTIONS,
  catalogMuscleGroup,
  equipmentLabel,
  equipmentOption,
  isCatalogMuscleGroup,
  muscleGroupRegion,
} from '@eva/workout-engine'
export type {
  EquipmentOption,
  MuscleGroup,
  MuscleGroupRegion,
  MuscleGroupRegionId,
} from '@eva/workout-engine'

export const DIFFICULTY_OPTIONS = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
] as const

export interface ExerciseRow {
  id: string
  name: string
  muscle_group: string
  /** Tipo polimórfico (strength/cardio/mobility/roller). Default 'strength' en DB. */
  exercise_type: string | null
  /**
   * Modalidad de cardio (Fase C · specs/cardio-ejes-y-fixes, migración 20260725221804):
   * run/bike/row/elliptical/jump_rope/hiit_reps/stairs. NULL = genérica ⇒ el alumno registra
   * Min · Distancia · FC como siempre. Solo tiene sentido con `exercise_type = 'cardio'`.
   */
  cardio_modality: string | null
  equipment: string | null
  difficulty: string | null
  body_part: string | null
  secondary_muscles: string[] | null
  instructions: string[] | null
  video_url: string | null
  gif_url: string | null
  image_url: string | null
  /** Recorte del video de YouTube (segundos). El player loopea [start, end]. */
  video_start_time: number | null
  video_end_time: number | null
  coach_id: string | null
  org_id: string | null
  team_id?: string | null
  /** true when owned by the current coach (custom), false for system catalog. */
  isOwn: boolean
}

export interface ExerciseInput {
  name: string
  muscle_group: string
  exercise_type?: string | null
  /** Modalidad de cardio (Fase C). Vacío/ausente ⇒ NULL = genérica. Fuera de cardio se fuerza NULL. */
  cardio_modality?: string | null
  equipment?: string | null
  difficulty?: string | null
  body_part?: string | null
  secondary_muscles?: string[]
  instructions?: string[]
  video_url?: string | null
  gif_url?: string | null
  image_url?: string | null
  video_start_time?: number | null
  video_end_time?: number | null
}

/** Extrae el ID (11 chars) de una URL de YouTube (watch, youtu.be, embed, shorts). */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

/** Miniatura de un video de YouTube. */
export function youtubeThumb(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
}

/**
 * ¿La URL es un archivo de video reproducible directo (mp4/mov/webm o media de Supabase Storage)?
 *
 * MISMO criterio que `execMediaKind` (`components/alumno/workout/v3/ExecMediaV3.tsx`), que es la
 * fuente de verdad de la precedencia en runtime; el predicado se repite acá porque `lib/` no puede
 * depender de un componente. Si uno cambia, el otro también.
 */
export function isDirectVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const u = url.toLowerCase()
  return (
    u.includes('.mp4') ||
    u.includes('.mov') ||
    u.includes('.webm') ||
    (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
  )
}

/**
 * URL de miniatura/preview de un ejercicio: gif → imagen → thumb de YouTube.
 * Muchos ejercicios del sistema traen solo `video_url` (YouTube) → derivamos la
 * miniatura para que la fila no caiga al ícono placeholder.
 */
export function exerciseThumb(row: {
  gif_url: string | null
  image_url: string | null
  video_url: string | null
}): string | null {
  if (row.gif_url) return row.gif_url
  if (row.image_url) return row.image_url
  const yt = youtubeId(row.video_url)
  if (yt) return youtubeThumb(yt)
  // video_url directo no-YouTube (gif/mp4 de ExerciseDB) — la web lo usa como rawVideoUrl.
  if (row.video_url) return row.video_url
  return null
}

/** Normaliza acentos + minúsculas (1:1 web `normalizeString`). */
export function normalizeString(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Filtra ejercicios por término + grupo muscular (1:1 web `filterExercises`, sin el diccionario de sinónimos). */
export function filterExercises<T extends {
  name: string
  muscle_group: string | null
  secondary_muscles?: string[] | null
  body_part?: string | null
  equipment?: string | null
}>(exercises: T[], searchTerm: string, selectedMuscleGroup: string): T[] {
  const search = normalizeString(searchTerm)
  const group = normalizeString(selectedMuscleGroup)
  return exercises.filter((ex) => {
    const muscle = normalizeString(ex.muscle_group ?? '')
    const secondary = (ex.secondary_muscles ?? []).map((m) => normalizeString(m))
    const matchesGroup = group === 'todos' || group === 'all' || group === 'todos los músculos' || muscle === group
    if (!matchesGroup) return false
    if (!search) return true
    const name = normalizeString(ex.name)
    const bodyPart = normalizeString(ex.body_part ?? '')
    const equipment = normalizeString(ex.equipment ?? '')
    return (
      name.includes(search) ||
      muscle.includes(search) ||
      bodyPart.includes(search) ||
      equipment.includes(search) ||
      secondary.some((sm) => sm.includes(search))
    )
  })
}

const SELECT_COLUMNS =
  'id, name, muscle_group, exercise_type, cardio_modality, equipment, difficulty, body_part, secondary_muscles, instructions, video_url, gif_url, image_url, video_start_time, video_end_time, coach_id, org_id'
// Sin columnas enterprise (org_id) — para prod standalone que aún no las tiene.
const SELECT_COLUMNS_MIN =
  'id, name, muscle_group, exercise_type, cardio_modality, equipment, difficulty, body_part, secondary_muscles, instructions, video_url, gif_url, image_url, video_start_time, video_end_time, coach_id'

const BUILDER_EXERCISE_COLUMNS =
  'id, name, muscle_group, exercise_type, cardio_modality, equipment, difficulty, body_part, secondary_muscles, instructions, video_url, gif_url, image_url, video_start_time, video_end_time, coach_id, org_id, team_id'

/**
 * Catálogo del builder con scope explícito; no consulta claims/JWT legacy.
 * RLS es el techo y el filtro puro posterior evita mezclar filas visibles de otro workspace.
 * Los errores se propagan para que el builder no degrade a un catálogo incorrecto.
 */
export async function listBuilderExercisesForWorkspace(
  coachId: string,
  workspace: ClientActionWorkspace,
): Promise<{ exercises: ExerciseRow[]; coachId: string }> {
  const filter = builderExerciseWorkspaceFilter(coachId, workspace)
  const { data, error } = await supabase
    .from('exercises')
    .select(BUILDER_EXERCISE_COLUMNS)
    .or(filter)
    .is('deleted_at', null)
    .order('muscle_group')
    .order('name')
  if (error) throw error

  const rows = ((data as Omit<ExerciseRow, 'isOwn'>[] | null) ?? [])
    .filter((row) => exerciseMatchesBuilderWorkspace(row, coachId, workspace))
  return {
    coachId,
    exercises: rows.map((row) => ({ ...row, isOwn: row.coach_id === coachId })),
  }
}

/**
 * ¿El workspace activo permite crear/editar ejercicios? (E5-10, ruling D1).
 *
 * Regla WORKSPACE exacta de la web (`coach/exercises/page.tsx`):
 *   canCreate = activeTeam ? true : (!isOrgUser || isOrgAdmin)
 * — en un TEAM el pool manda (cualquier miembro crea); en ENTERPRISE un coach
 * (role='coach') NO crea, pero org_admin/org_owner sí; el coach STANDALONE (sin org)
 * siempre crea. NO se gatea por tier (se abandona el antiguo gate por plan).
 */
export function canCreateExercises(ctx: {
  isOrgUser: boolean
  isOrgAdmin: boolean
  isTeamMember?: boolean
}): boolean {
  if (ctx.isTeamMember) return true
  return !ctx.isOrgUser || ctx.isOrgAdmin
}

/**
 * Resuelve `canCreateExercises` desde el contexto de organización del coach (JWT).
 * El lado coach de mobile no tiene todavía workspace de TEAM activo → isTeamMember=false;
 * un coach standalone o un org_admin/owner puede crear, un coach de org no.
 */
export async function resolveCanCreateExercises(): Promise<boolean> {
  const ctx = await getCoachOrgContext().catch(() => null)
  if (!ctx) return true // sin contexto → standalone, como la web
  return canCreateExercises({
    isOrgUser: !!ctx.orgId,
    isOrgAdmin: ctx.orgRole === 'org_owner' || ctx.orgRole === 'org_admin',
  })
}

async function currentCoachId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function listCoachExercises(): Promise<{ exercises: ExerciseRow[]; coachId: string | null }> {
  const coachId = await currentCoachId()
  // E-F5: incluir el catálogo de la ORG (coach_id null + org_id = mi org) además del sistema y los propios.
  const { orgId } = await getCoachOrgContext().catch(() => ({ orgId: null as string | null }))
  // Catálogo sistema (coach_id+org_id null) OR org OR propios. Filtro rico usa org_id;
  // fallback (prod sin org_id) usa solo coach_id.
  const orgClause = orgId ? `,and(coach_id.is.null,org_id.eq.${orgId})` : ''
  const richFilter = coachId
    ? `and(coach_id.is.null,org_id.is.null),coach_id.eq.${coachId}${orgClause}`
    : `and(coach_id.is.null,org_id.is.null)${orgClause}`
  const minFilter = coachId ? `coach_id.is.null,coach_id.eq.${coachId}` : `coach_id.is.null`

  const res = await selectWithFallback<any>(
    () => supabase.from('exercises').select(SELECT_COLUMNS).or(richFilter).is('deleted_at', null).order('muscle_group').order('name'),
    () => supabase.from('exercises').select(SELECT_COLUMNS_MIN).or(minFilter).order('muscle_group').order('name')
  )

  const rows = (res.data as Omit<ExerciseRow, 'isOwn'>[] | null) ?? []
  const exercises = rows.map((r) => ({ ...r, isOwn: !!coachId && r.coach_id === coachId }))
  return { exercises, coachId }
}

// E-F2: validación de URLs de media (video = YouTube o archivo directo; gif/imagen = http(s)).
function validateExerciseMedia(input: ExerciseInput): string | null {
  // El video acepta YouTube O un archivo reproducible directo (mp4/mov/webm/Storage): son las dos
  // ramas que `VideoPlayer` sabe reproducir y las dos que el formulario previsualiza. Antes solo
  // pasaba YouTube, así que "Duplicar a mis ejercicios" fallaba con TODO el catálogo mp4 de
  // ExerciseDB y un ejercicio propio con mp4 no se podía ni renombrar.
  if (input.video_url && !youtubeId(input.video_url) && !isDirectVideoUrl(input.video_url)) {
    return 'El video debe ser un enlace de YouTube o un archivo de video (.mp4).'
  }
  if (input.gif_url && !/^https?:\/\//i.test(input.gif_url)) return 'La URL del GIF debe empezar con http.'
  if (input.image_url && !/^https?:\/\//i.test(input.image_url)) return 'La URL de la imagen debe empezar con http.'
  const s = input.video_start_time
  const e = input.video_end_time
  if (s != null && e != null && e <= s) return 'El tiempo de fin del video debe ser mayor que el de inicio.'
  return null
}

/**
 * E5-09: el recorte start/end solo aplica cuando hay un video de YouTube válido
 * (1:1 con la web — con GIF/imagen los tiempos van NULL). Devuelve segundos o null.
 */
function videoTrimFor(input: ExerciseInput): { start: number | null; end: number | null } {
  const isYt = !!input.video_url && !!youtubeId(input.video_url)
  if (!isYt) return { start: null, end: null }
  return {
    start: input.video_start_time ?? null,
    end: input.video_end_time ?? null,
  }
}

export async function createExercise(input: ExerciseInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  const mediaErr = validateExerciseMedia(input)
  if (mediaErr) return { ok: false, error: mediaErr }

  // E5-10 (ruling D1): gate por WORKSPACE, no por tier. Un coach de org (role='coach')
  // no puede crear; standalone / org_admin / org_owner sí. Enforcement server-side
  // (no solo UI) — RLS es el techo real, esto espeja el gate de la web.
  if (!(await resolveCanCreateExercises())) {
    return { ok: false, error: 'Tu rol en la organización no permite crear ejercicios. Pide acceso a un administrador.' }
  }

  const name = input.name.trim()
  if (name.length < 2) return { ok: false, error: 'El nombre debe tener al menos 2 caracteres.' }
  if (!input.muscle_group) return { ok: false, error: 'Selecciona un grupo muscular.' }

  // Duplicate-name check scoped to the coach.
  const { count } = await supabase
    .from('exercises')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .ilike('name', name)
  if ((count ?? 0) > 0) return { ok: false, error: 'Ya existe un ejercicio con ese nombre.' }

  const trim = videoTrimFor(input)
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      coach_id: coachId,
      org_id: null,
      name,
      muscle_group: input.muscle_group,
      exercise_type: input.exercise_type ?? 'strength',
      // Modalidad SOLO en cardio (mirror de la action web): en cualquier otro tipo se guarda NULL
      // para no dejar filas inconsistentes. Vacío ⇒ NULL = genérica (Min · Distancia · FC).
      cardio_modality: input.exercise_type === 'cardio' ? input.cardio_modality || null : null,
      equipment: input.equipment ?? null,
      difficulty: input.difficulty ?? null,
      body_part: input.body_part ?? null,
      secondary_muscles: input.secondary_muscles ?? [],
      instructions: input.instructions ?? [],
      video_url: input.video_url ?? null,
      gif_url: input.gif_url ?? null,
      image_url: input.image_url ?? null,
      video_start_time: trim.start,
      video_end_time: trim.end,
      source: 'coach',
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data as { id: string }).id }
}

export async function updateExercise(
  id: string,
  input: ExerciseInput
): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }

  const name = input.name.trim()
  if (name.length < 2) return { ok: false, error: 'El nombre debe tener al menos 2 caracteres.' }
  const mediaErr = validateExerciseMedia(input)
  if (mediaErr) return { ok: false, error: mediaErr }

  const { count } = await supabase
    .from('exercises')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .ilike('name', name)
    .neq('id', id)
  if ((count ?? 0) > 0) return { ok: false, error: 'Ya existe un ejercicio con ese nombre.' }

  const trim = videoTrimFor(input)
  const { error } = await supabase
    .from('exercises')
    .update({
      name,
      muscle_group: input.muscle_group,
      exercise_type: input.exercise_type ?? 'strength',
      // Igual que en el create: fuera de cardio la modalidad se limpia (NULL).
      cardio_modality: input.exercise_type === 'cardio' ? input.cardio_modality || null : null,
      equipment: input.equipment ?? null,
      difficulty: input.difficulty ?? null,
      body_part: input.body_part ?? null,
      secondary_muscles: input.secondary_muscles ?? [],
      instructions: input.instructions ?? [],
      video_url: input.video_url ?? null,
      gif_url: input.gif_url ?? null,
      image_url: input.image_url ?? null,
      video_start_time: trim.start,
      video_end_time: trim.end,
    })
    .eq('id', id)
    .eq('coach_id', coachId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// E-F1: subir una imagen del ejercicio desde el device (resize→PNG 800) al bucket
// `exercise-media`. Devuelve la URL pública (cache-busted) para guardar en image_url.
export async function uploadExerciseImage(uri: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado.' }
  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.PNG, base64: true }
    )
    if (!manipulated.base64) return { ok: false, error: 'No se pudo procesar la imagen.' }
    const path = `${user.id}/${Date.now()}.png`
    const { error: upErr } = await supabase.storage
      .from('exercise-media')
      .upload(path, decode(manipulated.base64), { contentType: 'image/png', upsert: true })
    if (upErr) return { ok: false, error: upErr.message }
    const { data: { publicUrl } } = supabase.storage.from('exercise-media').getPublicUrl(path)
    return { ok: true, url: `${publicUrl}?t=${Date.now()}` }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Error al subir la imagen.' }
  }
}

/**
 * E-F8: clonar un ejercicio (sistema o propio) a uno propio editable.
 *
 * El nombre lo resuelve `resolveExerciseCopyName` (@eva/workout-engine, el MISMO helper que la
 * Server Action de web): «{nombre} (copia)», «(copia 2)», … contra los nombres ya ocupados en el
 * catálogo del coach. Antes se concatenaba « (copia)» a ciegas y `createExercise` rechazaba el
 * clon con «Ya existe un ejercicio con ese nombre.» apenas el coach duplicaba dos veces (o
 * duplicaba algo que ya se llamaba «… (copia)»).
 *
 * La lista de nombres NO filtra `deleted_at`: el dup-check de `createExercise` tampoco lo hace,
 * así que un nombre "libre" que chocara con un soft-deleted volvería a fallar en el insert.
 */
export async function cloneExercise(row: ExerciseRow): Promise<{ ok: boolean; id?: string; name?: string; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }

  const { data: owned, error: namesError } = await supabase
    .from('exercises')
    .select('name')
    .eq('coach_id', coachId)
  if (namesError) return { ok: false, error: 'No se pudo leer tu catálogo. Intenta nuevamente.' }

  const name = resolveExerciseCopyName(row.name, ((owned as { name: string | null }[] | null) ?? []).map((r) => r.name))
  const created = await createExercise({
    name,
    muscle_group: row.muscle_group ?? '',
    exercise_type: row.exercise_type ?? 'strength',
    // La copia conserva la modalidad del original (si era cardio); en otro tipo el create la anula.
    cardio_modality: row.cardio_modality ?? null,
    equipment: row.equipment ?? null,
    difficulty: (row.difficulty as ExerciseInput['difficulty']) ?? null,
    body_part: row.body_part ?? null,
    secondary_muscles: row.secondary_muscles ?? [],
    instructions: row.instructions ?? [],
    video_url: row.video_url ?? null,
    gif_url: row.gif_url ?? null,
    video_start_time: row.video_start_time ?? null,
    video_end_time: row.video_end_time ?? null,
  })
  return created.ok ? { ...created, name } : created
}

/**
 * Soft-delete de un ejercicio PROPIO (espeja `softDeleteExerciseAction` de la web).
 *
 * El `.select('id')` no es decorativo: un `update` filtrado que no toca ninguna fila
 * (ejercicio de otro coach, ya borrado, id inexistente) vuelve SIN error, y antes eso
 * se reportaba como éxito — la lista se recargaba igual y el coach creía haber borrado
 * algo que seguía ahí. Con el select, 0 filas = fallo explícito.
 */
export async function deleteExercise(id: string): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }

  const { data, error } = await supabase
    .from('exercises')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('coach_id', coachId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'No se pudo eliminar: el ejercicio no es tuyo o ya no existe.' }
  }
  return { ok: true }
}

/**
 * Deshacer el soft-delete (espeja `restoreExerciseAction` de la web). Alimenta el
 * «Deshacer» del toast que aparece justo después de eliminar. Mismo chequeo de filas
 * afectadas que `deleteExercise`: sin filas, el deshacer NO puede declararse exitoso.
 */
export async function restoreExercise(id: string): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }

  const { data, error } = await supabase
    .from('exercises')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('coach_id', coachId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return { ok: false, error: 'No se pudo restaurar: el ejercicio no es tuyo o ya no existe.' }
  }
  return { ok: true }
}

/**
 * ¿En cuántos bloques de programa está usado el ejercicio?
 *
 * RLS de `workout_blocks` acota la cuenta a los programas VISIBLES para el coach, así que el
 * número es «tus programas», no el uso global del catálogo. Es informativo (confirmación de
 * borrado + ficha del ejercicio): ante cualquier error devuelve 0 y NUNCA tira, para no
 * romper la hoja por un dato accesorio.
 */
export async function countExerciseUsage(id: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('workout_blocks')
      .select('exercise_id', { count: 'exact', head: true })
      .eq('exercise_id', id)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}
