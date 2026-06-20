'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { compressImageToWebp } from '@/lib/storage/image-compress'
import { randomUUID } from 'crypto'

/**
 * Subida de foto de receta (feature L — lado COACH). Reemplaza el "pega una URL".
 *
 * Archivo `'use server'`: SOLO exporta async functions.
 *
 * Pipeline espejo del check-in (app/c/[coach_slug]/check-in/_actions/check-in.actions.ts):
 *   - compressImageToWebp best-effort -> WebP 1080px; si falla (HEIC/corrupto/OOM)
 *     sube el archivo ORIGINAL (jamás aborta).
 *   - sube al bucket público `recipe-media` en `{coachUid}/{uuid}.{ext}` (write path
 *     scoping = uid de la sesión, NUNCA del body) con contentType explícito.
 *   - devuelve la URL pública (recipe-media es público) para guardar en image_url.
 */

const RECIPE_MEDIA_BUCKET = 'recipe-media'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB pre-compresión
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

export type UploadRecipePhotoResult =
  | { success: true; url: string }
  | { success: false; error: string }

export async function uploadRecipePhotoAction(
  formData: FormData
): Promise<UploadRecipePhotoResult> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'No se recibió ninguna imagen.' }
  }

  // Validación server-side de mime/tamaño.
  if (file.size > MAX_BYTES) {
    return { success: false, error: 'La imagen supera los 8 MB.' }
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return { success: false, error: 'Formato no permitido. Usá JPG, PNG, WebP o HEIC.' }
  }

  // coachUid de la sesión (getClaims: verificación local del JWT, sin /user).
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const coachUid = (claimsData?.claims?.sub as string | undefined) ?? null
  if (!coachUid) {
    return { success: false, error: 'No autorizado.' }
  }

  // Compresión best-effort -> WebP. Fallback al original si falla.
  const compressed = await compressImageToWebp(file)
  const body: Buffer | File = compressed ? compressed.buffer : file
  const ext = compressed ? compressed.ext : file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const contentType = compressed ? compressed.contentType : file.type || 'application/octet-stream'

  const path = `${coachUid}/${randomUUID()}.${ext}`

  const adminDb = createServiceRoleClient()
  const { error: uploadError } = await adminDb.storage
    .from(RECIPE_MEDIA_BUCKET)
    .upload(path, body, {
      cacheControl: '3600',
      upsert: false,
      // contentType OBLIGATORIO con Buffer (sin él se guarda como application/json y rompe el render).
      contentType,
    })

  if (uploadError) {
    console.error('[recipe-photo] upload', uploadError)
    return { success: false, error: 'No se pudo subir la imagen.' }
  }

  const { data: pub } = adminDb.storage.from(RECIPE_MEDIA_BUCKET).getPublicUrl(path)
  return { success: true, url: pub.publicUrl }
}
