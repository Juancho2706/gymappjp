/**
 * Fotos de check-in en mobile: el bucket `checkins` es PRIVADO y el coach no tiene policy
 * de storage, así que los valores guardados (paths, o URLs públicas legacy) NO son
 * renderizables. Este módulo es el chokepoint mobile equivalente a
 * `apps/web/src/lib/storage/checkin-photos.ts` (`resolveCheckinPhotoUrls`, server-side):
 * reemplaza los 3 campos de foto de cada fila por URLs FIRMADAS listas para pintar, para
 * que los ~6 componentes de display (Evolución visual, snapshot del Resumen, timeline y
 * comparativa de Progreso, detalle del check-in, lightbox) sigan recibiendo URLs.
 *
 * La firma la hace el server (`POST /api/mobile/coach/checkin-photos`, service-role tras
 * autorizar al coach); acá solo se planifica QUÉ firmar, se dedupe, se cachea y se aplica.
 * Sin dependencias de React Native → testeable puro desde `tests/`.
 */

export const CHECKIN_PHOTO_FIELDS = ['front_photo_url', 'back_photo_url', 'side_photo_url'] as const
export type CheckinPhotoField = (typeof CHECKIN_PHOTO_FIELDS)[number]

/**
 * Forma mínima que necesita este módulo. Se declara como mapped type con props OPCIONALES
 * (no `Record<string, unknown>`) para que una `interface` como `CheckInEntry` la satisfaga:
 * TS solo infiere index signature implícita en type aliases, no en interfaces.
 */
export type CheckinPhotoRow = { readonly [K in CheckinPhotoField]?: string | null }

export interface ResolveCheckinPhotoOptions {
  /**
   * Cuántas filas —contando SOLO las que tienen alguna foto, en el orden recibido— reciben
   * los 3 campos firmados (las superficies que usan el fallback `front || side || back`).
   * El resto recibe únicamente `tailFields`. Sin opciones ⇒ los 3 campos de todas las filas.
   */
  fullPhotoRows?: number
  /** Campos firmados fuera de `fullPhotoRows`. Default: los 3. */
  tailFields?: readonly CheckinPhotoField[]
}

/** El endpoint firma con TTL 600s; se reusa la firma dentro de una ventana algo menor. */
export const CHECKIN_SIGNATURE_TTL_MS = (600 - 60) * 1000

/**
 * Normaliza un valor guardado (URL pública/firmada legacy O un path del bucket) a path.
 * Espejo literal de `toCheckinPath` de la web: null para vacío o URL externa desconocida
 * (así la UI muestra "sin foto" en vez de un marco roto). Acepta también URLs YA firmadas
 * (`/object/sign/checkins/...`) ⇒ re-firmar es idempotente.
 */
export function toCheckinPath(stored: string | null | undefined): string | null {
  if (!stored) return null
  const value = String(stored).trim()
  if (!value) return null
  const match = value.match(/\/object\/(?:public|sign|authenticated)\/checkins\/([^?]+)/)
  if (match) {
    try {
      return decodeURIComponent(match[1]!)
    } catch {
      return match[1]!
    }
  }
  if (/^https?:\/\//i.test(value)) return null // URL externa desconocida — no se puede firmar
  return value.replace(/^\/+/, '')
}

/** Campos a firmar por fila (índice alineado con `rows`). Espejo de la web. */
export function planCheckinPhotoFields(
  rows: readonly CheckinPhotoRow[],
  options?: ResolveCheckinPhotoOptions,
): CheckinPhotoField[][] {
  const { fullPhotoRows, tailFields = CHECKIN_PHOTO_FIELDS } = options ?? {}
  const perRow: CheckinPhotoField[][] = []
  let rowsWithPhoto = 0
  for (const row of rows) {
    const hasAnyPhoto = CHECKIN_PHOTO_FIELDS.some((field) => toCheckinPath(row?.[field]))
    const full = fullPhotoRows === undefined || (hasAnyPhoto && rowsWithPhoto < fullPhotoRows)
    if (hasAnyPhoto) rowsWithPhoto += 1
    perRow.push(full ? [...CHECKIN_PHOTO_FIELDS] : [...tailFields])
  }
  return perRow
}

/**
 * Refs ORIGINALES a pedir al endpoint (que devuelve `urls` keyed por ref, no por path),
 * deduplicadas por path: dos filas con el mismo path piden una sola firma.
 */
export function collectCheckinPhotoRefs(
  rows: readonly CheckinPhotoRow[],
  options?: ResolveCheckinPhotoOptions,
): { refs: string[]; refByPath: Map<string, string> } {
  const perRow = planCheckinPhotoFields(rows, options)
  const refByPath = new Map<string, string>()
  rows.forEach((row, index) => {
    for (const field of perRow[index]!) {
      const raw = row?.[field]
      if (typeof raw !== 'string' || !raw) continue
      const path = toCheckinPath(raw)
      if (path && !refByPath.has(path)) refByPath.set(path, raw)
    }
  })
  return { refs: [...refByPath.values()], refByPath }
}

/**
 * Copia superficial de cada fila con los campos de foto reemplazados por la URL firmada.
 * Un campo sin firma (no pedido, path irreconocible o firma fallida) queda en `null`:
 * mismo contrato que la web ⇒ la UI cae a su estado "sin foto" en vez de pintar un marco roto.
 */
export function applySignedCheckinPhotos<T extends CheckinPhotoRow>(
  rows: readonly T[],
  signedByPath: ReadonlyMap<string, string>,
  options?: ResolveCheckinPhotoOptions,
): T[] {
  const perRow = planCheckinPhotoFields(rows, options)
  return rows.map((row, index) => {
    const allowed = perRow[index]!
    const copy = { ...row } as Record<string, string | null>
    for (const field of CHECKIN_PHOTO_FIELDS) {
      const path = allowed.includes(field) ? toCheckinPath(row?.[field]) : null
      copy[field] = path ? signedByPath.get(path) ?? null : null
    }
    return copy as unknown as T
  })
}

type CacheEntry = { url: string; expiresAt: number }
const signatureCache = new Map<string, CacheEntry>()

/** Test-only: limpia el cache de firmas entre casos. */
export function resetCheckinSignatureCache(): void {
  signatureCache.clear()
}

export type SignCheckinPhotosFn = (clientId: string, refs: string[]) => Promise<{ urls: Record<string, string | null> }>

/**
 * Chokepoint: firma en lote los campos de foto de `rows` y devuelve las filas listas para
 * render. Cachea por PATH con TTL (`CHECKIN_SIGNATURE_TTL_MS`) para no re-firmar en cada
 * carga/refresco de la pantalla, y es fail-soft: si el endpoint falla, las filas vuelven
 * con las fotos en `null` (estado "sin foto" honesto) en vez de paths no renderizables.
 */
export async function signCheckinPhotoRows<T extends CheckinPhotoRow>(
  clientId: string,
  rows: readonly T[],
  sign: SignCheckinPhotosFn,
  options?: ResolveCheckinPhotoOptions,
  now: number = Date.now(),
): Promise<T[]> {
  if (!rows.length || !clientId) return [...rows]
  const { refs, refByPath } = collectCheckinPhotoRefs(rows, options)
  if (!refs.length) return [...rows]

  const signedByPath = new Map<string, string>()
  const missingRefs: string[] = []
  for (const [path, ref] of refByPath) {
    const cached = signatureCache.get(path)
    if (cached && cached.expiresAt > now) signedByPath.set(path, cached.url)
    else missingRefs.push(ref)
  }

  if (missingRefs.length) {
    try {
      const response = await sign(clientId, missingRefs)
      const urls = response?.urls ?? {}
      for (const [path, ref] of refByPath) {
        const url = urls[ref]
        if (typeof url === 'string' && url) {
          signedByPath.set(path, url)
          signatureCache.set(path, { url, expiresAt: now + CHECKIN_SIGNATURE_TTL_MS })
        }
      }
    } catch (error) {
      // Fail-soft: sin firma no hay foto renderizable; se conserva lo cacheado (si algo hay).
      console.warn('[checkin-photos] signing failed', error)
    }
  }

  return applySignedCheckinPhotos(rows, signedByPath, options)
}
