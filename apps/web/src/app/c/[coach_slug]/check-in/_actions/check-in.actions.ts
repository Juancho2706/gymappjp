'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { revalidatePath } from 'next/cache'
import { CheckInSchema } from '@eva/schemas'
import { compressImageToWebp } from '@/lib/storage/image-compress'
import { STUDENT_ACCESS_COPY } from '@/lib/student-access'
import { resolveStudentAccessForClient } from '@/lib/student-access.server'

export type CheckinState = {
    error?: string
    success?: boolean
    /** El check-in se guardó, pero alguna foto no pudo subirse (best-effort). */
    warning?: string
    /** `coach_paused` = cuenta del coach en pausa (post-gracia, solo-lectura) → no se registró. */
    code?: 'coach_paused'
}

// Techo generoso pre-compresión (una HEIC/JPEG de cámara puede venir de 3-8MB si la conversión
// client-side falló). El límite duro real del bucket es 5MB, pero el server casi siempre
// re-comprime a WebP <1MB antes de subir.
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

export type CheckinUploadTicket = { variant: 'front' | 'back'; signedUrl: string; path: string }

const TICKET_EXT_BY_TYPE: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
}

/**
 * Firma URLs de subida DIRECTA al bucket `checkins` (patrón espejo de exercise-media): el
 * navegador hace PUT a Supabase Storage y el submit del check-in viaja solo con los PATHs.
 * Motivo (incidente 2026-07-02): un POST multipart con fotos hacia eva-app.cl puede morir en
 * capas intermedias (WAF de Cloudflare 403, límite de 4.5MB de Vercel) — sacando los bytes del
 * POST, esa clase de falla desaparece. El bucket igual impone mime allowlist + 5MB en el PUT
 * firmado, y el path queda scoped al usuario autenticado (el cliente no elige la ruta).
 */
export async function createCheckinUploadUrlsAction(
    requests: { variant: 'front' | 'back'; contentType: string }[]
): Promise<{ tickets?: CheckinUploadTicket[]; error?: string }> {
    if (!Array.isArray(requests) || requests.length === 0 || requests.length > 2) {
        return { error: 'Solicitud inválida.' }
    }
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Gate de suscripcion del coach: post-gracia no se firman URLs de subida (no hay check-in que crear).
    const access = await resolveStudentAccessForClient(supabase, user.id)
    if (access.state === 'readonly') return { error: STUDENT_ACCESS_COPY.pausedWriteError }

    const adminDb = createServiceRoleClient()
    const tickets: CheckinUploadTicket[] = []
    for (const req of requests) {
        if (req?.variant !== 'front' && req?.variant !== 'back') return { error: 'Solicitud inválida.' }
        const ext = TICKET_EXT_BY_TYPE[req.contentType] ?? 'jpg'
        const rand = Math.random().toString(36).substring(7)
        const path =
            req.variant === 'back'
                ? `${user.id}/${Date.now()}-back-${rand}.${ext}`
                : `${user.id}/${Date.now()}-${rand}.${ext}`
        const { data, error } = await adminDb.storage.from('checkins').createSignedUploadUrl(path)
        if (error || !data) {
            console.warn('[checkin] createSignedUploadUrl fallo:', error?.message)
            return { error: 'No se pudo preparar la subida de fotos.' }
        }
        tickets.push({ variant: req.variant, signedUrl: data.signedUrl, path: data.path })
    }
    return { tickets }
}

/**
 * Path de foto venido del cliente (flujo de subida directa). Solo se acepta un objeto DENTRO
 * de la carpeta del propio usuario — cualquier otra cosa se descarta sin abortar el check-in.
 */
function ownCheckinPath(userId: string, value: FormDataEntryValue | null): string | null {
    if (typeof value !== 'string' || !value) return null
    if (!value.startsWith(`${userId}/`) || value.includes('..')) {
        console.warn('[checkin] photo_path fuera del scope del usuario, descartado')
        return null
    }
    return value
}

async function uploadToCheckinsBucket(
    adminDb: ReturnType<typeof createServiceRoleClient>,
    userId: string,
    file: File,
    variant: 'front' | 'back'
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
    const timestamp = Date.now()
    const rand = Math.random().toString(36).substring(7)

    // Compresión best-effort a WebP 1080px. Sharp decide por BYTES (no por file.type ni extensión),
    // así que un JPEG renombrado o con mime vacío igual se convierte. Si falla (HEIC sin libheif,
    // corrupto, OOM) -> sube el original, NUNCA aborta el check-in (UX one-shot del alumno).
    const compressed = await compressImageToWebp(file)
    const extension = compressed ? compressed.ext : (file.name.split('.').pop() || 'jpg')
    const body: Buffer | File = compressed ? compressed.buffer : file
    const filePath =
        variant === 'back'
            ? `${userId}/${timestamp}-back-${rand}.${extension}`
            : `${userId}/${timestamp}-${rand}.${extension}`

    const { error: uploadError, data: uploadData } = await adminDb.storage
        .from('checkins')
        .upload(filePath, body, {
            cacheControl: '3600',
            upsert: false, // fotos únicas por alumno+timestamp; jamás pisar
            // contentType OBLIGATORIO con Buffer (sin él se guarda como application/json y rompe el render)
            ...(compressed ? { contentType: compressed.contentType } : {}),
        })

    if (uploadError) {
        return { ok: false, message: uploadError.message }
    }

    // P2: store the PATH, not the public URL. Display layers resolve a signed URL via
    // resolveCheckinPhotoUrls() so the bucket can be flipped private without breaking images.
    return { ok: true, path: uploadData.path }
}

/**
 * Extrae una foto del FormData sin que JAMÁS invalide el submit: las fotos son opcionales y
 * best-effort de punta a punta (incidente jun/jul-2026: validarlas duro — Zod fileField o el
 * allowlist de mime — abortaba el check-in ENTERO para todo iPhone). Devuelve null si no hay
 * archivo utilizable; el motivo se loguea para observabilidad.
 */
function getBestEffortPhoto(formData: FormData, key: string): File | null {
    const value = formData.get(key)
    if (!(value instanceof File) || value.size === 0) return null
    if (value.size > MAX_UPLOAD_BYTES) {
        console.warn(`[checkin] foto '${key}' descartada: ${value.size} bytes > ${MAX_UPLOAD_BYTES}`)
        return null
    }
    return value
}

export async function submitCheckinAction(
    _prev: CheckinState,
    formData: FormData
): Promise<CheckinState> {
    // Las FOTOS quedan FUERA del parse: solo los datos del reporte pueden invalidar el submit.
    const parsed = CheckInSchema.safeParse({
        weight: String(formData.get('weight') ?? '').replace(',', '.'),
        energy_level: formData.get('energy_level'),
        notes: formData.get('notes'),
    })
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Gate de suscripcion del coach: post-gracia (readonly) el alumno no registra check-ins.
    const access = await resolveStudentAccessForClient(supabase, user.id)
    if (access.state === 'readonly') {
        return { error: STUDENT_ACCESS_COPY.pausedWriteError, code: 'coach_paused' }
    }

    const adminDb = createServiceRoleClient()

    // Flujo NUEVO (subida directa): el cliente ya subió a Storage vía URL firmada y acá solo
    // llegan los PATHs (scoped al usuario). Los bytes jamás pasan por este POST.
    let photoPath: string | null = ownCheckinPath(user.id, formData.get('photo_path'))
    let backPhotoPath: string | null = ownCheckinPath(user.id, formData.get('back_photo_path'))
    let droppedPhotos = 0

    // Flujo LEGACY (bundles viejos cacheados por el SW: el File viaja en el POST) — BEST-EFFORT
    // (🛡️ misma filosofía que compressImageToWebp): si una foto NO se puede subir (tipo no
    // soportado tras fallback, red), el check-in se guarda IGUAL sin esa foto — perder todo el
    // reporte del alumno (one-shot) es peor que perder una foto. Se loguea para observar.
    if (!photoPath) {
        const frontFile = getBestEffortPhoto(formData, 'photo')
        if (frontFile) {
            const up = await uploadToCheckinsBucket(adminDb, user.id, frontFile, 'front')
            if (up.ok) photoPath = up.path
            else {
                droppedPhotos++
                console.warn('[checkin] front photo upload fallo, guardando check-in sin ella:', up.message)
            }
        }
    }

    if (!backPhotoPath) {
        const backFile = getBestEffortPhoto(formData, 'back_photo')
        if (backFile) {
            const up = await uploadToCheckinsBucket(adminDb, user.id, backFile, 'back')
            if (up.ok) backPhotoPath = up.path
            else {
                droppedPhotos++
                console.warn('[checkin] back photo upload fallo, guardando check-in sin ella:', up.message)
            }
        }
    }

    const { error: insertError } = await adminDb.from('check_ins').insert({
        client_id: user.id,
        weight: parsed.data.weight,
        energy_level: parsed.data.energy_level,
        notes: parsed.data.notes || null,
        front_photo_url: photoPath,
        back_photo_url: backPhotoPath,
    })

    if (insertError) {
        return { error: 'Error al guardar el reporte: ' + insertError.message }
    }

    revalidatePath('/c', 'layout')
    revalidatePath(`/coach/clients/${user.id}`)

    return {
        success: true,
        ...(droppedPhotos > 0
            ? {
                  warning:
                      droppedPhotos === 1
                          ? 'Tu check-in se guardó, pero una foto no pudo subirse. Puedes reenviarla a tu coach por otro medio.'
                          : 'Tu check-in se guardó, pero las fotos no pudieron subirse. Puedes reenviarlas a tu coach por otro medio.',
              }
            : {}),
    }
}
