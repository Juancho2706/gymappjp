import { supabase } from './supabase'
import { selectWithFallback } from './db-compat'

// Coach exercise library. Reads via Supabase (RLS: system exercises +
// coach-owned). Mutations run under the coach session (RLS enforces coach_id =
// auth.uid()). Mirrors the web feature `app/coach/exercises` but media upload to
// storage is deferred — mobile creation accepts a YouTube/GIF URL paste.

export const MUSCLE_GROUPS = [
  'Hombros',
  'Bíceps',
  'Tríceps',
  'Antebrazos',
  'Cuádriceps',
  'Glúteos',
  'Abductores',
  'Aductores',
  'Pantorrillas',
  'Lumbar',
  'Abdominales',
  'Cardio',
  'Dorsales',
  'Espalda Alta',
  'Isquiotibiales',
  'Pectorales',
  'Trapecios',
] as const

export const EQUIPMENT_OPTIONS = [
  'Peso libre',
  'Máquina',
  'Poleas',
  'Banda',
  'Corporal',
  'Kettlebell',
  'Otro',
] as const

export const DIFFICULTY_OPTIONS = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
] as const

export interface ExerciseRow {
  id: string
  name: string
  muscle_group: string
  equipment: string | null
  difficulty: string | null
  body_part: string | null
  secondary_muscles: string[] | null
  instructions: string[] | null
  video_url: string | null
  gif_url: string | null
  image_url: string | null
  coach_id: string | null
  org_id: string | null
  /** true when owned by the current coach (custom), false for system catalog. */
  isOwn: boolean
}

export interface ExerciseInput {
  name: string
  muscle_group: string
  equipment?: string | null
  difficulty?: string | null
  body_part?: string | null
  secondary_muscles?: string[]
  instructions?: string[]
  video_url?: string | null
  gif_url?: string | null
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
  'id, name, muscle_group, equipment, difficulty, body_part, secondary_muscles, instructions, video_url, gif_url, image_url, coach_id, org_id'
// Sin columnas enterprise (org_id) — para prod standalone que aún no las tiene.
const SELECT_COLUMNS_MIN =
  'id, name, muscle_group, equipment, difficulty, body_part, secondary_muscles, instructions, video_url, gif_url, image_url, coach_id'

/** Free tier cannot create custom exercises (mirrors web getTierCapabilities). */
export function canCreateCustomExercises(tier: string | null | undefined): boolean {
  return (tier ?? 'free') !== 'free'
}

async function currentCoachId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function listCoachExercises(): Promise<{ exercises: ExerciseRow[]; coachId: string | null }> {
  const coachId = await currentCoachId()
  // Catálogo sistema (coach_id+org_id null) OR propios. Filtro rico usa org_id;
  // fallback (prod sin org_id) usa solo coach_id.
  const richFilter = coachId
    ? `and(coach_id.is.null,org_id.is.null),coach_id.eq.${coachId}`
    : `and(coach_id.is.null,org_id.is.null)`
  const minFilter = coachId ? `coach_id.is.null,coach_id.eq.${coachId}` : `coach_id.is.null`

  const res = await selectWithFallback<any>(
    () => supabase.from('exercises').select(SELECT_COLUMNS).or(richFilter).is('deleted_at', null).order('muscle_group').order('name'),
    () => supabase.from('exercises').select(SELECT_COLUMNS_MIN).or(minFilter).order('muscle_group').order('name')
  )

  const rows = (res.data as Omit<ExerciseRow, 'isOwn'>[] | null) ?? []
  const exercises = rows.map((r) => ({ ...r, isOwn: !!coachId && r.coach_id === coachId }))
  return { exercises, coachId }
}

export async function createExercise(input: ExerciseInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }

  const name = input.name.trim()
  if (name.length < 2) return { ok: false, error: 'El nombre debe tener al menos 2 caracteres.' }
  if (!input.muscle_group) return { ok: false, error: 'Seleccioná un grupo muscular.' }

  // Duplicate-name check scoped to the coach.
  const { count } = await supabase
    .from('exercises')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .ilike('name', name)
  if ((count ?? 0) > 0) return { ok: false, error: 'Ya existe un ejercicio con ese nombre.' }

  const { data, error } = await supabase
    .from('exercises')
    .insert({
      coach_id: coachId,
      org_id: null,
      name,
      muscle_group: input.muscle_group,
      equipment: input.equipment ?? null,
      difficulty: input.difficulty ?? null,
      body_part: input.body_part ?? null,
      secondary_muscles: input.secondary_muscles ?? [],
      instructions: input.instructions ?? [],
      video_url: input.video_url ?? null,
      gif_url: input.gif_url ?? null,
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

  const { count } = await supabase
    .from('exercises')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .ilike('name', name)
    .neq('id', id)
  if ((count ?? 0) > 0) return { ok: false, error: 'Ya existe un ejercicio con ese nombre.' }

  const { error } = await supabase
    .from('exercises')
    .update({
      name,
      muscle_group: input.muscle_group,
      equipment: input.equipment ?? null,
      difficulty: input.difficulty ?? null,
      body_part: input.body_part ?? null,
      secondary_muscles: input.secondary_muscles ?? [],
      instructions: input.instructions ?? [],
      video_url: input.video_url ?? null,
      gif_url: input.gif_url ?? null,
    })
    .eq('id', id)
    .eq('coach_id', coachId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteExercise(id: string): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }

  const { error } = await supabase
    .from('exercises')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('coach_id', coachId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
