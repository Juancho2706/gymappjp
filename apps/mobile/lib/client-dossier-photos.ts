/**
 * Presupuesto de FOTOS de la exportación del dossier (R20).
 *
 * Módulo PURO a propósito (cero imports de expo / supabase / del package): es el único pedazo de
 * la exportación con una regla que se puede romper en silencio — un mes con 20 check-ins con foto
 * multiplica el peso del PDF y tumba el proceso de impresión en un teléfono modesto. Vive aparte
 * de `client-dossier-pdf.ts` para testearlo sin montar el árbol de React Native
 * (`tests/mobile/dossier-photo-budget.test.ts`).
 */

/** Fotos por mes (R20). Las más recientes: los check-ins del informe vienen DESC. */
export const MAX_PHOTOS_PER_MONTH = 3
/** Tope GLOBAL de la exportación, aunque se pidan 24 meses (R20). */
export const MAX_PHOTOS_PER_EXPORT = 18

/**
 * Forma mínima que necesita el presupuesto: `ClientDossierData` la cumple. En RN `photoUrl` lleva
 * el ref SIN firmar del bucket privado (o una URL legada); es la clave del mapa de fotos bajadas.
 */
export interface PhotoBudgetReport {
  checkIns: { photoUrl: string | null }[]
}

export interface SelectDossierPhotoRefsOpts {
  perReport?: number
  total?: number
}

/**
 * Elige qué fotos se firman y embeben, informe por informe.
 *
 * Devuelve UN array de refs por informe (misma longitud y orden que `reports`) para poder firmar
 * por lote de mes. El presupuesto global se consume en el orden en que llegan los informes: si se
 * agota, los meses siguientes van SIN fotos y el PDF simplemente no imprime su bloque de fotos
 * (nunca un muro de «foto no disponible»).
 *
 * Se saltean los refs vacíos, los `data:` (ya embebidos) y los repetidos: firmar dos veces la
 * misma foto gasta presupuesto sin agregar nada, y el mapa de salida va por ref.
 */
export function selectDossierPhotoRefs(
  reports: PhotoBudgetReport[],
  opts: SelectDossierPhotoRefsOpts = {}
): string[][] {
  const perReport = Math.max(0, opts.perReport ?? MAX_PHOTOS_PER_MONTH)
  const total = Math.max(0, opts.total ?? MAX_PHOTOS_PER_EXPORT)
  const seen = new Set<string>()
  let budget = total
  return reports.map((report) => {
    const refs: string[] = []
    if (budget <= 0 || perReport <= 0) return refs
    for (const checkIn of report.checkIns ?? []) {
      if (refs.length >= perReport || budget <= 0) break
      const ref = String(checkIn?.photoUrl ?? '').trim()
      if (!ref || ref.startsWith('data:') || seen.has(ref)) continue
      seen.add(ref)
      refs.push(ref)
      budget -= 1
    }
    return refs
  })
}
