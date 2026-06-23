import * as ImageManipulator from 'expo-image-manipulator'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabase'
import { selectWithFallback } from './db-compat'
import { getCoachProfile } from './coach'
import { getCoachOrgContext } from './org'
import { getActiveScope } from './workspaces'

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

/**
 * Tipos polimórficos (specs/movida-entrenamiento, espejo de la web): deciden los
 * ejes del builder/alumno. default `strength` = comportamiento de siempre.
 */
export const EXERCISE_TYPE_OPTIONS = [
  { value: 'strength', label: 'Fuerza (series × reps)' },
  { value: 'cardio', label: 'Cardio (duración / distancia / zona FC)' },
  { value: 'mobility', label: 'Movilidad (holds por lado)' },
  { value: 'roller', label: 'Foam roller (duración o pasadas)' },
] as const

export type ExerciseType = (typeof EXERCISE_TYPE_OPTIONS)[number]['value']

/**
 * Diccionario de sinónimos de músculo (1:1 web `MUSCLE_MAPPING` en lib/constants).
 * Expande el término de búsqueda con alias EN/ES + abreviaturas del catálogo ExerciseDB
 * para que "delts", "abs", "quads", etc. encuentren los ejercicios igual que en la web.
 */
export const MUSCLE_MAPPING: Record<string, string[]> = {
  'hombros': ['delts', 'shoulders', 'deltoides'],
  'biceps': ['biceps', 'bíceps'],
  'triceps': ['triceps', 'tríceps'],
  'antebrazos': ['forearms', 'antebrazos'],
  'cuadriceps': ['quads', 'cuadriceps', 'cuádriceps'],
  'gluteos': ['glutes', 'glúteos'],
  'abductores': ['abductors', 'abductores'],
  'aductores': ['adductors', 'aductores'],
  'pantorrillas': ['calves', 'pantorrillas', 'gemelos'],
  'lumbar': ['lower back', 'lumbar'],
  'abdominales': ['abs', 'core', 'abdominales', 'abdomen'],
  'cardio': ['cardio', 'cardiovascular system'],
  'dorsales': ['lats', 'dorsales'],
  'espalda alta': ['upper back', 'espalda alta'],
  'isquiotibiales': ['hamstrings', 'isquiotibiales', 'isquios'],
  'pectorales': ['pectoral', 'pecho', 'chest', 'pectorales'],
  'trapecios': ['traps', 'trapecios', 'trapecio'],
}

export interface ExerciseRow {
  id: string
  name: string
  muscle_group: string
  /** Polimórfico: strength | cardio | mobility | roller (default strength). */
  exercise_type: string | null
  equipment: string | null
  difficulty: string | null
  body_part: string | null
  secondary_muscles: string[] | null
  instructions: string[] | null
  video_url: string | null
  gif_url: string | null
  image_url: string | null
  /** Recorte del video de YouTube (segundos enteros). El player loopea [start, end]. */
  video_start_time: number | null
  video_end_time: number | null
  coach_id: string | null
  org_id: string | null
  /** team_id del pool (workspace coach_team); null en standalone/sistema. */
  team_id: string | null
  /** true when owned by the current coach (custom), false for system catalog. */
  isOwn: boolean
}

export interface ExerciseInput {
  name: string
  muscle_group: string
  exercise_type?: string | null
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

/** Segundos → "m:ss" para los inputs de recorte de video (vacío si null). */
export function secondsToMmss(sec: number | null | undefined): string {
  if (sec == null) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "m:ss" o segundos sueltos → número de segundos (null si vacío/inválido). 1:1 web. */
export function mmssToSeconds(str: string): number | null {
  const t = (str ?? '').trim()
  if (!t) return null
  if (t.includes(':')) {
    const [m, s] = t.split(':')
    const mi = parseInt(m, 10)
    const se = parseInt(s, 10)
    if (isNaN(mi) || isNaN(se)) return null
    return mi * 60 + se
  }
  const n = parseInt(t, 10)
  return isNaN(n) ? null : n
}

/**
 * Embed CANÓNICO de un video de EJERCICIO (1:1 web `exerciseEmbedUrl`): silencioso,
 * en loop, sin controles de YouTube (se comporta como un GIF). `start`/`end` recortan
 * el tramo. youtube-nocookie (sin tracking). Devuelve null si no es un YouTube válido.
 */
export function exerciseEmbedUrl(
  idOrUrl: string,
  opts?: { start?: number | null; end?: number | null }
): string | null {
  const id = /^[A-Za-z0-9_-]{11}$/.test(idOrUrl) ? idOrUrl : youtubeId(idOrUrl)
  if (!id) return null
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    loop: '1',
    playlist: id,
    controls: '0',
    modestbranding: '1',
    rel: '0',
    playsinline: '1',
    disablekb: '1',
    iv_load_policy: '3',
    fs: '0',
  })
  if (opts?.start != null && opts.start > 0) params.set('start', String(Math.floor(opts.start)))
  if (opts?.end != null && opts.end > 0) params.set('end', String(Math.floor(opts.end)))
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`
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

/** true si el ejercicio tiene video real: YouTube, o media de video/gif directa. */
export function exerciseHasVideo(row: { video_url: string | null; gif_url: string | null }): boolean {
  if (youtubeId(row.video_url)) return true
  if (row.gif_url) return true
  if (row.video_url && /\.(mp4|webm|mov|gif)(\?|$)/i.test(row.video_url)) return true
  return false
}

/** Normaliza acentos + minúsculas (1:1 web `normalizeString`). */
export function normalizeString(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Filtra ejercicios por término + grupo muscular (1:1 web `filterExercises`, con expansión de sinónimos). */
export function filterExercises<T extends {
  name: string
  muscle_group: string | null
  secondary_muscles?: string[] | null
  body_part?: string | null
  equipment?: string | null
}>(exercises: T[], searchTerm: string, selectedMuscleGroup: string): T[] {
  const search = normalizeString(searchTerm)
  const group = normalizeString(selectedMuscleGroup)
  // Términos expandidos por el diccionario de sinónimos (1:1 web: "delts" → hombros, "abs" → core, …).
  const searchTerms = search ? [search, ...(MUSCLE_MAPPING[search] ?? [])] : []
  return exercises.filter((ex) => {
    const muscle = normalizeString(ex.muscle_group ?? '')
    const secondary = (ex.secondary_muscles ?? []).map((m) => normalizeString(m))
    const matchesGroup = group === 'todos' || group === 'all' || group === 'todos los músculos' || muscle === group
    if (!matchesGroup) return false
    if (!search) return true
    const name = normalizeString(ex.name)
    const bodyPart = normalizeString(ex.body_part ?? '')
    const equipment = normalizeString(ex.equipment ?? '')
    return searchTerms.some((term) =>
      name.includes(term) ||
      muscle.includes(term) ||
      bodyPart.includes(term) ||
      equipment.includes(term) ||
      secondary.some((sm) => sm.includes(term))
    )
  })
}

const SELECT_COLUMNS =
  'id, name, muscle_group, exercise_type, equipment, difficulty, body_part, secondary_muscles, instructions, video_url, gif_url, image_url, video_start_time, video_end_time, coach_id, org_id, team_id'
// Sin columnas enterprise (org_id/team_id) — para prod standalone que aún no las tiene.
const SELECT_COLUMNS_MIN =
  'id, name, muscle_group, exercise_type, equipment, difficulty, body_part, secondary_muscles, instructions, video_url, gif_url, image_url, video_start_time, video_end_time, coach_id'

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
  const scope = await getActiveScope()

  // Workspace team activo: catálogo = sistema + POOL del equipo (team_id), espejo de la web
  // (getExerciseCatalog). El predicado system exige team_id NULL (sin eso, filas team colarían
  // como "system"). Los personales NO se listan en contexto team (anti-fantasma; no asignables).
  if (scope.type === 'coach_team' && scope.teamId) {
    const teamId = scope.teamId
    const teamFilter = `and(coach_id.is.null,org_id.is.null,team_id.is.null),team_id.eq.${teamId}`
    const res = await selectWithFallback<any>(
      () => supabase.from('exercises').select(SELECT_COLUMNS).or(teamFilter).is('deleted_at', null).order('muscle_group').order('name'),
      () => supabase.from('exercises').select(SELECT_COLUMNS).or(teamFilter).order('muscle_group').order('name')
    )
    const teamRows = (res.data as Partial<ExerciseRow>[] | null) ?? []
    const exercises = teamRows.map((r) => ({
      ...r,
      exercise_type: r.exercise_type ?? 'strength',
      video_start_time: r.video_start_time ?? null,
      video_end_time: r.video_end_time ?? null,
      // En el pool, "propio" = del catálogo del equipo (team_id), espejo de customExercises web.
      isOwn: r.team_id === teamId,
    })) as ExerciseRow[]
    return { exercises, coachId }
  }

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

  const rows = (res.data as Partial<ExerciseRow>[] | null) ?? []
  const exercises = rows.map((r) => ({
    ...r,
    exercise_type: r.exercise_type ?? 'strength',
    video_start_time: r.video_start_time ?? null,
    video_end_time: r.video_end_time ?? null,
    isOwn: !!coachId && r.coach_id === coachId,
  })) as ExerciseRow[]
  return { exercises, coachId }
}

// E-F2: validación de URLs de media (video = YouTube válido; gif/imagen = http(s)).
function validateExerciseMedia(input: ExerciseInput): string | null {
  if (input.video_url && !youtubeId(input.video_url)) return 'El video debe ser un enlace de YouTube válido.'
  if (input.gif_url && !/^https?:\/\//i.test(input.gif_url)) return 'La URL del GIF debe empezar con http.'
  if (input.image_url && !/^https?:\/\//i.test(input.image_url)) return 'La URL de la imagen debe empezar con http.'
  return null
}

export async function createExercise(input: ExerciseInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  const mediaErr = validateExerciseMedia(input)
  if (mediaErr) return { ok: false, error: mediaErr }

  // E-F7: enforce tier en la mutación (no solo en UI). Free no crea ejercicios propios.
  const profile = await getCoachProfile()
  if (!canCreateCustomExercises(profile?.subscriptionTier)) {
    return { ok: false, error: 'Tu plan no permite crear ejercicios propios. Actualizá a Starter o superior.' }
  }

  const name = input.name.trim()
  if (name.length < 2) return { ok: false, error: 'El nombre debe tener al menos 2 caracteres.' }
  if (!input.muscle_group) return { ok: false, error: 'Seleccioná un grupo muscular.' }

  // Workspace team activo: el ejercicio nace en el catálogo del POOL (team_id), nunca personal
  // (espejo de resolveExerciseOwner web — AC6/AC11). Standalone/enterprise: coach_id propio.
  const scope = await getActiveScope()
  const teamId = scope.type === 'coach_team' ? scope.teamId : null

  // Duplicate-name check scoped al owner (team → por team_id; standalone → por coach_id).
  const dupQuery = supabase
    .from('exercises')
    .select('id', { count: 'exact', head: true })
    .ilike('name', name)
  const { count } = await (teamId
    ? dupQuery.eq('team_id', teamId)
    : dupQuery.eq('coach_id', coachId))
  if ((count ?? 0) > 0) return { ok: false, error: 'Ya existe un ejercicio con ese nombre.' }

  // start/end solo aplican al recorte de YouTube; con otra media (o sin video) van NULL (1:1 web).
  const isYoutube = !!input.video_url && !!youtubeId(input.video_url)
  const videoStart = isYoutube ? (input.video_start_time ?? null) : null
  const videoEnd = isYoutube ? (input.video_end_time ?? null) : null

  const { data, error } = await supabase
    .from('exercises')
    .insert({
      coach_id: teamId ? null : coachId,
      org_id: null,
      team_id: teamId,
      name,
      muscle_group: input.muscle_group,
      exercise_type: input.exercise_type ?? 'strength',
      equipment: input.equipment ?? null,
      difficulty: input.difficulty ?? null,
      body_part: input.body_part ?? null,
      secondary_muscles: input.secondary_muscles ?? [],
      instructions: input.instructions ?? [],
      video_url: input.video_url ?? null,
      gif_url: input.gif_url ?? null,
      image_url: input.image_url ?? null,
      video_start_time: videoStart,
      video_end_time: videoEnd,
      source: teamId ? 'team' : 'coach',
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

  // Workspace team: el catálogo es del POOL → scope por team_id (espejo applyExerciseOwnerScope web).
  // Standalone/enterprise: scope por coach_id (comportamiento de siempre).
  const scope = await getActiveScope()
  const teamId = scope.type === 'coach_team' ? scope.teamId : null

  const dupQuery = supabase
    .from('exercises')
    .select('id', { count: 'exact', head: true })
    .ilike('name', name)
    .neq('id', id)
  const { count } = await (teamId
    ? dupQuery.eq('team_id', teamId)
    : dupQuery.eq('coach_id', coachId))
  if ((count ?? 0) > 0) return { ok: false, error: 'Ya existe un ejercicio con ese nombre.' }

  // start/end solo aplican al recorte de YouTube; con otra media (o sin video) van NULL (1:1 web).
  const isYoutube = !!input.video_url && !!youtubeId(input.video_url)
  const videoStart = isYoutube ? (input.video_start_time ?? null) : null
  const videoEnd = isYoutube ? (input.video_end_time ?? null) : null

  const updateQuery = supabase
    .from('exercises')
    .update({
      name,
      muscle_group: input.muscle_group,
      exercise_type: input.exercise_type ?? 'strength',
      equipment: input.equipment ?? null,
      difficulty: input.difficulty ?? null,
      body_part: input.body_part ?? null,
      secondary_muscles: input.secondary_muscles ?? [],
      instructions: input.instructions ?? [],
      video_url: input.video_url ?? null,
      gif_url: input.gif_url ?? null,
      image_url: input.image_url ?? null,
      video_start_time: videoStart,
      video_end_time: videoEnd,
    })
    .eq('id', id)
  const { error } = await (teamId
    ? updateQuery.eq('team_id', teamId)
    : updateQuery.eq('coach_id', coachId))

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

// E-F8: clonar un ejercicio (sistema o propio) a uno propio editable.
export async function cloneExercise(row: ExerciseRow): Promise<{ ok: boolean; id?: string; error?: string }> {
  return createExercise({
    name: `${row.name} (copia)`,
    muscle_group: row.muscle_group ?? '',
    exercise_type: row.exercise_type ?? 'strength',
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
}

export async function deleteExercise(id: string): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }

  // Workspace team: el catálogo es del POOL → scope por team_id (espejo softDeleteExerciseAction
  // web). Standalone/enterprise: scope por coach_id (comportamiento de siempre).
  const scope = await getActiveScope()
  const teamId = scope.type === 'coach_team' ? scope.teamId : null

  const delQuery = supabase
    .from('exercises')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  const { error } = await (teamId
    ? delQuery.eq('team_id', teamId)
    : delQuery.eq('coach_id', coachId))

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
