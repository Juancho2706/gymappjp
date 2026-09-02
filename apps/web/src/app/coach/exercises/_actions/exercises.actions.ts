'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { CloneExerciseSchema } from '@eva/schemas'
import { CARDIO_MODALITIES, resolveExerciseCopyName } from '@eva/workout-engine'
import { z } from 'zod'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import { getCoachOrgContext } from '@/lib/coach-context'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { normalizeYoutubeEmbedUrl } from '@/lib/youtube'
import { deleteExerciseMediaByUrlAction } from './exercise-media.actions'
import { mirrorAndSaveExerciseThumbnail, clearExerciseThumbnail } from '@/lib/exercises/thumbnail-mirror'

const SUPABASE_MEDIA_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/exercise-media/`

/**
 * Superficies que listan el catálogo de ejercicios y hay que invalidar tras cualquier mutación.
 *
 * `/coach/builder` NO matchea la página real del builder por alumno: el archivo es
 * `coach/builder/[clientId]/page.tsx` y `revalidatePath` opera sobre el ÁRBOL DE RUTAS, no sobre
 * la URL. Una ruta con segmento dinámico exige el patrón + `type: 'page'`
 * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`,
 * Next 16.3: «If `path` contains a dynamic segment … this parameter is required»). Sin esto el
 * builder del alumno servía el catálogo viejo y solo lo tapaba el `router.refresh()` del cliente.
 */
function revalidateExerciseCatalogSurfaces() {
    revalidatePath('/coach/exercises')
    revalidatePath('/coach/builder')
    revalidatePath('/coach/builder/[clientId]', 'page')
    revalidatePath('/coach/workout-programs/builder')
}

const exerciseSchema = z.object({
    name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
    muscle_group: z.string().min(1, 'Selecciona un grupo muscular'),
    // Polimórfico (specs/movida-entrenamiento): default strength = comportamiento de siempre.
    exercise_type: z.enum(['strength', 'cardio', 'mobility', 'roller']).default('strength'),
    /**
     * Modalidad de cardio (Fase C · specs/cardio-ejes-y-fixes). Espejo EXACTO del CHECK
     * `exercises_cardio_modality_check` (migración 20260725221804) y de `CARDIO_MODALITIES` del
     * motor. Vacío/ausente ⇒ null = genérica (Min · Distancia · FC, comportamiento de siempre).
     * En un ejercicio que NO es cardio se fuerza a null más abajo: la modalidad no significa nada ahí.
     */
    cardio_modality: z
        .union([z.enum(CARDIO_MODALITIES as readonly string[] as [string, ...string[]]), z.literal(''), z.null()])
        .optional()
        .transform((v) => (v ? v : null)),
    equipment: z.string().optional(),
    difficulty: z.string().optional(),
    secondary_muscles: z.array(z.string()).optional(),
    instructions: z.array(z.string()).optional(),
    media_kind: z.enum(['youtube', 'gif', 'image', 'none']).default('none'),
    video_url: z
        .string()
        .optional()
        .transform((v) => v || undefined)
        .refine(
            (v) => !v || normalizeYoutubeEmbedUrl(v) !== null,
            'URL de YouTube inválida. Usa un link de youtube.com o youtu.be'
        ),
    gif_url: z
        .string()
        .optional()
        .transform((v) => v || undefined)
        .refine(
            (v) => !v || v.startsWith(SUPABASE_MEDIA_PREFIX),
            'URL de GIF no permitida.'
        ),
    image_url: z
        .string()
        .optional()
        .transform((v) => v || undefined)
        .refine(
            (v) => !v || v.startsWith(SUPABASE_MEDIA_PREFIX),
            'URL de imagen no permitida.'
        ),
    // Recorte del video (YouTube). Segundos enteros. El player loopea [start, end].
    video_start_time: z.coerce.number().int().min(0).optional(),
    video_end_time: z.coerce.number().int().min(0).optional(),
}).refine(
    (d) => d.video_start_time == null || d.video_end_time == null || d.video_end_time > d.video_start_time,
    { message: 'El tiempo de fin debe ser mayor que el de inicio.', path: ['video_end_time'] }
)

export type ExerciseActionState = {
    error?: string
    success?: boolean
    exerciseId?: string
    fieldErrors?: Record<string, string[]>
}

function parseExerciseFormData(formData: FormData) {
    const rawSecondary = formData.get('secondary_muscles') as string
    const rawInstructions = formData.get('instructions') as string
    return {
        name: formData.get('name') as string,
        muscle_group: formData.get('muscle_group') as string,
        exercise_type: (formData.get('exercise_type') as string) || 'strength',
        cardio_modality: (formData.get('cardio_modality') as string) || '',
        equipment: (formData.get('equipment') as string) || undefined,
        difficulty: (formData.get('difficulty') as string) || undefined,
        secondary_muscles: rawSecondary
            ? rawSecondary.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
        instructions: rawInstructions
            ? rawInstructions.split('\n').map((s) => s.trim()).filter(Boolean)
            : [],
        media_kind: (formData.get('media_kind') as 'youtube' | 'gif' | 'image' | 'none') || 'none',
        video_url: (formData.get('video_url') as string) || undefined,
        gif_url: (formData.get('gif_url') as string) || undefined,
        image_url: (formData.get('image_url') as string) || undefined,
        video_start_time: (formData.get('video_start_time') as string) || undefined,
        video_end_time: (formData.get('video_end_time') as string) || undefined,
    }
}

function resolveMediaFields(parsed: z.infer<typeof exerciseSchema>) {
    const embed = parsed.video_url ? normalizeYoutubeEmbedUrl(parsed.video_url) : null
    switch (parsed.media_kind) {
        case 'youtube': return { video_url: embed, gif_url: null, image_url: null }
        case 'gif': return { video_url: null, gif_url: parsed.gif_url ?? null, image_url: null }
        case 'image': return { video_url: null, gif_url: null, image_url: parsed.image_url ?? null }
        default: return { video_url: null, gif_url: null, image_url: null }
    }
}

/**
 * Duplica un ejercicio (del sistema o propio) dentro del catálogo del contexto activo.
 *
 * Dos cosas que NO son obvias:
 * 1. La media (gif/imagen/video) se copia TAL CUAL desde la fila origen leída en DB, no desde el
 *    FormData. Los ejercicios del sistema traen `gif_url` de un CDN externo (ExerciseDB), fuera del
 *    prefijo de Storage, así que pasarlos por el `refine` de `exerciseSchema` los rechazaría; y
 *    leerla de la fila (en vez de confiar en el cliente) evita que el navegador inyecte URLs
 *    arbitrarias en el catálogo. Antes ni se copiaban: el clon nacía sin media.
 * 2. El dueño sale de `resolveExerciseOwner`, igual que create/update: en workspace team el clon
 *    nace en el catálogo del POOL (team_id) y no personal — si no, sería invisible para el resto
 *    del equipo y para los alumnos del pool (mismo bug AC6/AC11 que arregló el create).
 * 3. El clon SE RENOMBRA: «{nombre} (copia)», «(copia 2)», … El nombre no tiene unique en DB —
 *    la unicidad la impone la app con un `ilike` scopeado al owner — así que copiar el nombre tal
 *    cual hacía que duplicar un ejercicio PROPIO chocara siempre con su original.
 */
export async function cloneExerciseAction(formData: FormData) {
  try {
    const supabase = await createClient()
    const owner = await resolveExerciseOwner(supabase)
    if (!owner.ok) return { error: owner.error }

    // Parse instructions
    const instructionsStr = formData.get('instructions') as string
    let instructions: string[] = []
    if (instructionsStr) {
      try {
        instructions = JSON.parse(instructionsStr)
      } catch {
        instructions = instructionsStr.split('\n').filter(s => s.trim().length > 0)
      }
    }

    // Parse secondary muscles
    const secondaryMusclesStr = formData.get('secondary_muscles') as string
    let secondaryMuscles: string[] = []
    if (secondaryMusclesStr) {
      try {
        secondaryMuscles = JSON.parse(secondaryMusclesStr)
      } catch {
        secondaryMuscles = secondaryMusclesStr.split(',').map(s => s.trim()).filter(s => s.length > 0)
      }
    }

    const data = {
      id: formData.get('id'),
      name: formData.get('name'),
      muscle_group: formData.get('muscle_group'),
      equipment: formData.get('equipment') || null,
      video_url: formData.get('video_url') || null,
      difficulty: formData.get('difficulty') || null,
      gender_focus: formData.get('gender_focus') || null,
      instructions: instructions.length > 0 ? instructions : null,
      secondary_muscles: secondaryMuscles.length > 0 ? secondaryMuscles : null,
    }

    // safeParse y no parse: los datos salen de la fila del catálogo, no de un formulario libre —
    // si no parsean es un bug del call site y el coach no puede corregirlo. Con `parse`, el
    // ZodError se colaba tal cual al toast como un JSON ilegible.
    const cloneParsed = CloneExerciseSchema.safeParse(data)
    if (!cloneParsed.success) {
      console.error('cloneExerciseAction datos inválidos:', cloneParsed.error.flatten())
      return { error: 'No se pudo duplicar: datos del ejercicio inválidos.' }
    }
    const validated = cloneParsed.data

    // Fila origen: de acá sale la media (y el tipo/modalidad, que el FormData no trae).
    const { data: source } = await supabase
      .from('exercises')
      .select('exercise_type, cardio_modality, body_part, video_url, gif_url, image_url, thumbnail_url, video_start_time, video_end_time')
      .eq('id', validated.id)
      .maybeSingle()

    if (!source) {
      return { error: 'No se pudo duplicar: el ejercicio no existe o no es visible.' }
    }

    // Nombre del clon: «{nombre} (copia)», «(copia 2)», … El sufijo lo resuelve
    // `resolveExerciseCopyName` (@eva/workout-engine, compartido con RN) contra los nombres YA
    // ocupados en el catálogo del owner. UNA sola query, con el MISMO scope 3-vías que el
    // dup-check de create/update, y SIN filtrar `deleted_at` (esos tampoco lo filtran: un nombre
    // "libre" que chocara con un soft-deleted volvería a fallar).
    //
    // Antes se copiaba el nombre tal cual y se rechazaba el choque: duplicar un ejercicio PROPIO
    // fallaba siempre contra su propio original («Ya existe un ejercicio con ese nombre.»).
    //
    // Bound conocido: PostgREST corta el listado en su `max-rows` (1000 en Supabase). Con más de
    // 1000 ejercicios propios el sufijo podría repetir un nombre — no rompe (no hay unique en DB)
    // y ningún catálogo real se acerca; si algún día pasa, hay que paginar acá.
    const { data: ownedNames, error: namesError } = await applyExerciseOwnerScope(
      supabase.from('exercises').select('name'),
      owner
    )
    if (namesError) {
      console.error('cloneExerciseAction no pudo leer el catálogo del owner:', namesError)
      return { error: 'No se pudo duplicar: no se pudo leer tu catálogo.' }
    }
    const cloneName = resolveExerciseCopyName(
      validated.name,
      (ownedNames ?? []).map((row) => row.name)
    )

    const { error } = await supabase
      .from('exercises')
      .insert({
        coach_id: owner.coachId,
        org_id: owner.orgId,
        team_id: owner.teamId,
        name: cloneName,
        muscle_group: validated.muscle_group,
        equipment: validated.equipment,
        difficulty: validated.difficulty,
        gender_focus: validated.gender_focus,
        instructions: validated.instructions,
        secondary_muscles: validated.secondary_muscles,
        exercise_type: source.exercise_type,
        cardio_modality: source.cardio_modality,
        body_part: source.body_part,
        video_url: source.video_url,
        gif_url: source.gif_url,
        image_url: source.image_url,
        // Se COPIA la URL ya espejada, no se re-espeja: el objeto de Storage es content-addressed
        // y compartido a propósito (`yt/<videoId>.webp`, `gifthumb/…`), y `clearExerciseThumbnail`
        // solo pone la columna en NULL — nunca borra el archivo. Sin esto el clon caía al hotlink
        // de YouTube (JPEG gris cuando el canal borra el video) mientras el original se veía bien.
        thumbnail_url: source.thumbnail_url,
        video_start_time: source.video_start_time,
        video_end_time: source.video_end_time,
        source: owner.orgId ? 'org' : owner.teamId ? 'team' : 'coach',
      })

    if (error) throw error

    revalidateExerciseCatalogSurfaces()
    // `name` viaja de vuelta para que la UI pueda nombrar la copia recién creada.
    return { success: true, name: cloneName }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al clonar ejercicio'
    return { error: message }
  }
}

// ── Custom exercise creator (enterprise-aware) ────────────────────────────────

/**
 * Resolves owner fields for a custom exercise (exactamente UNO de coach_id | org_id | team_id).
 * - Workspace activo team → { coach_id: null, org_id: null, team_id: workspace.teamId } — AC6/AC11
 * - Standalone coach      → { coach_id: user.id, org_id: null, team_id: null }
 * - Org admin/owner       → { coach_id: null, org_id: ctx.orgId, team_id: null }
 * - Org coach             → error (no permission)
 */
async function resolveExerciseOwner(
    supabase: Awaited<ReturnType<typeof createClient>>
): Promise<
    | { ok: true; coachId: string | null; orgId: string | null; teamId: string | null; tier: SubscriptionTier }
    | { ok: false; error: string }
> {
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) return { ok: false, error: 'No autenticado.' }

    // 3er caso (mustFix AC6/AC11): workspace ACTIVO team ⇒ el ejercicio nace en el catálogo del
    // POOL (team_id), nunca personal. Sin esto, un coach de Movida en contexto team creaba
    // ejercicios coach_id = user.id: invisibles para los demás miembros (rompe full-access AC6)
    // y NO legibles por los alumnos del pool vía exercises_client_coach_select (exige
    // clients.coach_id = exercises.coach_id, que no se cumple en el pool) ⇒ bloque fantasma en
    // la ejecución. La RLS exercises_team_insert (20260611090001) respalda este write-path.
    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    if (workspace?.type === 'coach_team') {
        // Full-access plano del pool: cualquier miembro activo crea/edita; billing a nivel team.
        return { ok: true, coachId: null, orgId: null, teamId: workspace.teamId, tier: 'pro' }
    }

    const ctx = await getCoachOrgContext()
    if (!ctx) return { ok: false, error: 'No autenticado.' }

    // Org coach role = no access
    if (ctx.isOrgUser && !ctx.isOrgAdmin) {
        return { ok: false, error: 'Tu rol no permite crear ejercicios.' }
    }

    if (ctx.isOrgAdmin && ctx.orgId) {
        // Org admin: tier check via org — allow all (org manages billing separately)
        return { ok: true, coachId: null, orgId: ctx.orgId, teamId: null, tier: 'pro' }
    }

    // Standalone coach
    const { data: coach } = await supabase
        .from('coaches')
        .select('id, subscription_tier')
        .eq('id', user.id)
        .maybeSingle()
    if (!coach) return { ok: false, error: 'Coach no encontrado.' }

    return {
        ok: true,
        coachId: coach.id,
        orgId: null,
        teamId: null,
        tier: (coach.subscription_tier ?? 'free') as SubscriptionTier,
    }
}

/** Scoping 3-vías del owner sobre un query de exercises (team > coach personal > org). */
function applyExerciseOwnerScope<T extends { eq: (column: string, value: string) => T }>(
    query: T,
    owner: { coachId: string | null; orgId: string | null; teamId: string | null }
): T {
    if (owner.teamId) return query.eq('team_id', owner.teamId)
    if (owner.coachId) return query.eq('coach_id', owner.coachId)
    return query.eq('org_id', owner.orgId!)
}

export async function createExerciseAction(
    _prev: ExerciseActionState,
    formData: FormData
): Promise<ExerciseActionState> {
    const supabase = await createClient()
    const owner = await resolveExerciseOwner(supabase)
    if (!owner.ok) return { error: owner.error }

    const caps = getTierCapabilities(owner.tier)
    if (!caps.canCreateCustomExercises) return { error: 'upgrade_required' }

    const raw = parseExerciseFormData(formData)
    const parsed = exerciseSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    // Duplicate name check (scoped to owner — en team, por team_id: el catálogo es del pool)
    const nameQuery = applyExerciseOwnerScope(
        supabase
            .from('exercises')
            .select('id', { count: 'exact', head: true })
            .ilike('name', parsed.data.name),
        owner
    )

    const { count: nameCount } = await nameQuery
    if ((nameCount ?? 0) > 0) {
        return { fieldErrors: { name: ['Ya existe un ejercicio con ese nombre.'] } }
    }

    const media = resolveMediaFields(parsed.data)
    // start/end solo aplican al recorte de YouTube; con otra media van NULL.
    const isYoutube = parsed.data.media_kind === 'youtube' && !!media.video_url
    const videoStart = isYoutube ? (parsed.data.video_start_time ?? null) : null
    const videoEnd = isYoutube ? (parsed.data.video_end_time ?? null) : null

    const { data: exercise, error } = await supabase
        .from('exercises')
        .insert({
            coach_id: owner.coachId,
            org_id: owner.orgId,
            team_id: owner.teamId,
            name: parsed.data.name,
            muscle_group: parsed.data.muscle_group,
            exercise_type: parsed.data.exercise_type,
            // Solo tiene sentido en cardio: en otro tipo se guarda NULL (evita filas inconsistentes).
            cardio_modality: parsed.data.exercise_type === 'cardio' ? parsed.data.cardio_modality : null,
            equipment: parsed.data.equipment ?? null,
            difficulty: parsed.data.difficulty ?? null,
            secondary_muscles: parsed.data.secondary_muscles ?? [],
            instructions: parsed.data.instructions ?? [],
            video_url: media.video_url,
            gif_url: media.gif_url,
            image_url: media.image_url,
            video_start_time: videoStart,
            video_end_time: videoEnd,
            source: owner.orgId ? 'org' : owner.teamId ? 'team' : 'coach',
        })
        .select('id')
        .single()

    if (error) {
        console.error('createExerciseAction error:', error)
        return { error: 'Error al guardar el ejercicio.' }
    }

    // Mirror del thumbnail de YouTube a Storage (durabilidad). Best-effort: nunca tira.
    if (media.video_url) await mirrorAndSaveExerciseThumbnail(exercise.id, media.video_url)

    revalidateExerciseCatalogSurfaces()
    return { success: true, exerciseId: exercise.id }
}

export async function updateExerciseAction(
    exerciseId: string,
    _prev: ExerciseActionState,
    formData: FormData
): Promise<ExerciseActionState> {
    const supabase = await createClient()
    const owner = await resolveExerciseOwner(supabase)
    if (!owner.ok) return { error: owner.error }

    const caps = getTierCapabilities(owner.tier)
    if (!caps.canCreateCustomExercises) return { error: 'upgrade_required' }

    const raw = parseExerciseFormData(formData)
    const parsed = exerciseSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    }

    // Duplicate name check (exclude self; en team, scoped por team_id)
    const nameQuery = applyExerciseOwnerScope(
        supabase
            .from('exercises')
            .select('id', { count: 'exact', head: true })
            .ilike('name', parsed.data.name)
            .neq('id', exerciseId),
        owner
    )

    const { count: nameCount } = await nameQuery
    if ((nameCount ?? 0) > 0) {
        return { fieldErrors: { name: ['Ya existe un ejercicio con ese nombre.'] } }
    }

    // Load old URLs for storage cleanup
    const { data: existing } = await supabase
        .from('exercises')
        .select('gif_url, image_url')
        .eq('id', exerciseId)
        .maybeSingle()

    const media = resolveMediaFields(parsed.data)
    const isYoutube = parsed.data.media_kind === 'youtube' && !!media.video_url
    const videoStart = isYoutube ? (parsed.data.video_start_time ?? null) : null
    const videoEnd = isYoutube ? (parsed.data.video_end_time ?? null) : null

    const updateQuery = supabase
        .from('exercises')
        .update({
            name: parsed.data.name,
            muscle_group: parsed.data.muscle_group,
            exercise_type: parsed.data.exercise_type,
            // Igual que en el create: fuera de cardio la modalidad se limpia (NULL).
            cardio_modality: parsed.data.exercise_type === 'cardio' ? parsed.data.cardio_modality : null,
            equipment: parsed.data.equipment ?? null,
            difficulty: parsed.data.difficulty ?? null,
            secondary_muscles: parsed.data.secondary_muscles ?? [],
            instructions: parsed.data.instructions ?? [],
            video_url: media.video_url,
            gif_url: media.gif_url,
            image_url: media.image_url,
            video_start_time: videoStart,
            video_end_time: videoEnd,
        })
        .eq('id', exerciseId)

    // `.select('id')` DESPUÉS del scope: sin él un UPDATE que no matchea (ejercicio ajeno o
    // borrado) vuelve sin error y la UI mostraba "guardado" sobre algo que nunca cambió.
    const { data: updated, error } = await applyExerciseOwnerScope(updateQuery, owner).select('id')
    if (error) {
        console.error('updateExerciseAction error:', error)
        return { error: 'Error al actualizar el ejercicio.' }
    }
    if (!updated || updated.length === 0) {
        return { error: 'No se pudo guardar: el ejercicio no es tuyo o ya no existe.' }
    }

    // Mirror/limpia el thumbnail segun la media nueva (best-effort, nunca tira).
    if (media.video_url) await mirrorAndSaveExerciseThumbnail(exerciseId, media.video_url)
    else await clearExerciseThumbnail(exerciseId)

    // Cleanup old storage files
    if (existing) {
        const oldUrls = [existing.gif_url, existing.image_url].filter(Boolean) as string[]
        const newUrls = [media.gif_url, media.image_url].filter(Boolean) as string[]
        for (const old of oldUrls) {
            if (!newUrls.includes(old)) {
                // Un clon comparte la URL de media con su origen (ver cloneExerciseAction): borrar
                // el archivo a ciegas dejaría al otro ejercicio con una imagen rota. Solo se borra
                // si NINGUNA otra fila lo referencia. Dos `.eq()` en vez de un `.or()` porque el
                // filtro `or` de PostgREST parte el valor en comas y una URL puede traerlas.
                const [{ count: asGif }, { count: asImage }] = await Promise.all([
                    supabase.from('exercises').select('id', { count: 'exact', head: true })
                        .neq('id', exerciseId).eq('gif_url', old),
                    supabase.from('exercises').select('id', { count: 'exact', head: true })
                        .neq('id', exerciseId).eq('image_url', old),
                ])
                if ((asGif ?? 0) > 0 || (asImage ?? 0) > 0) continue
                deleteExerciseMediaByUrlAction(old).catch(() => undefined)
            }
        }
    }

    revalidateExerciseCatalogSurfaces()
    return { success: true, exerciseId }
}

export async function softDeleteExerciseAction(exerciseId: string): Promise<ExerciseActionState> {
    const supabase = await createClient()
    const owner = await resolveExerciseOwner(supabase)
    if (!owner.ok) return { error: owner.error }

    const updateQuery = supabase
        .from('exercises')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', exerciseId)

    // `.select('id')` DESPUÉS del scope: sin él, PostgREST devuelve 204 sin error cuando el UPDATE
    // no matchea ninguna fila (ejercicio ajeno, del sistema o ya inexistente) y el coach veía
    // "eliminado" sin que se hubiera tocado nada. Con el select sabemos cuántas filas cambiaron.
    const { data, error } = await applyExerciseOwnerScope(updateQuery, owner).select('id')
    if (error) return { error: 'Error al eliminar el ejercicio.' }
    if (!data || data.length === 0) {
        return { error: 'No se pudo eliminar: el ejercicio no es tuyo o ya no existe.' }
    }

    revalidateExerciseCatalogSurfaces()
    return { success: true }
}

export async function restoreExerciseAction(exerciseId: string): Promise<ExerciseActionState> {
    const supabase = await createClient()
    const owner = await resolveExerciseOwner(supabase)
    if (!owner.ok) return { error: owner.error }

    const updateQuery = supabase
        .from('exercises')
        .update({ deleted_at: null })
        .eq('id', exerciseId)

    // Mismo motivo que en el soft-delete: 0 filas afectadas es éxito silencioso en PostgREST.
    const { data, error } = await applyExerciseOwnerScope(updateQuery, owner).select('id')
    if (error) return { error: 'No se pudo restaurar.' }
    if (!data || data.length === 0) {
        return { error: 'No se pudo restaurar: el ejercicio no es tuyo o ya no existe.' }
    }

    revalidateExerciseCatalogSurfaces()
    return { success: true }
}
