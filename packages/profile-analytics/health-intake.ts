// Tarjeta «Salud» de la ficha del alumno — SOLO LECTURA, una sola fuente para web y app
// (SPEC `docs/specs/vuelta-nueva-salud-y-reloj` §5). El alumno llena «Salud y seguridad» al
// registrarse y se guarda en `public.client_intake`, pero la ficha del coach nunca lo mostraba: en
// web sólo dentro del modal «Editar datos» del listado, y en la app en ningún lado. Esta función
// arma la vista y quien pinta sólo imprime, así la web y RN no pueden decir cosas distintas sobre un
// dato de salud.
//
// REGLA INVERTIDA (la del SPEC, no la intuitiva): las lesiones y condiciones se pintan **aunque la
// ficha inicial esté incompleta**. El coach puede escribirlas desde «Editar datos» dejando `goals`,
// `experience_level` y `availability` en `''` (`EditClientDataModal.tsx:162-241`); esconderlas sería
// afirmar algo falso sobre un dato de salud. Con los CINCO campos vacíos —o sin fila— no queda nada
// que pintar y sólo va la nota al pie.
//
// SIN AUTORÍA. `client_intake` no guarda quién escribió (no hay `created_by` ni `source`,
// `supabase/migrations/00000000000001_baseline.sql:788-800`) y el coach escribe esas mismas columnas,
// así que «lo escribió el alumno» es inafirmable. Y `updated_at` se mueve también cuando el coach
// edita talla o peso: por eso el pie dice «Actualizado el {12 sept}» y no «Salud actualizada».
// Sin chip «Lesión informada» y sin «ver más»: el texto libre viaja COMPLETO y la tarjeta crece.
//
// PURA: sin React / Next / Supabase / React Native / date-fns, igual que el resto del paquete.
import { shortDayMonthEs } from './agenda-label'

/** Los cinco campos de la ficha que la tarjeta muestra, en el orden canónico del SPEC. */
export type HealthIntakeFieldKey = 'injuries' | 'medical_conditions' | 'goals' | 'experience_level' | 'availability'

/** Fila de `public.client_intake` reducida a lo que la tarjeta lee. Todo opcional: la fila puede faltar. */
export interface HealthIntakeSource {
  injuries?: string | null
  medical_conditions?: string | null
  goals?: string | null
  experience_level?: string | null
  availability?: string | null
  /** `timestamptz` del trigger `handle_updated_at`, o un `yyyy-mm-dd` ya resuelto. */
  updated_at?: string | null
}

export interface HealthIntakeRow {
  key: HealthIntakeFieldKey
  label: string
  /** Texto COMPLETO, tal cual se escribió (sólo se recortan los espacios de los bordes). */
  value: string
  /** `true` cuando `value` es el «Sin … informadas», no algo que alguien haya escrito. */
  isEmpty: boolean
}

export interface HealthIntakeView {
  /** Sin fila o los cinco campos vacíos: no hay nada que pintar salvo `pendingIntakeNote`. */
  isEmpty: boolean
  /** Filas a pintar, en orden. Las dos de salud van SIEMPRE; las otras tres sólo si tienen texto. */
  rows: HealthIntakeRow[]
  /** Pie «Actualizado el 12 sept». `null` sin nada que fechar o si `updated_at` no parsea. */
  updatedLabel: string | null
  /** Nota al pie de ficha inicial pendiente. `null` cuando el alumno ya la completó. */
  pendingIntakeNote: string | null
}

/** Rótulos canónicos del SPEC §5. Se exportan para que web y RN no los reescriban. */
export const HEALTH_INTAKE_LABELS: Record<HealthIntakeFieldKey, string> = {
  injuries: 'Lesiones o limitaciones',
  medical_conditions: 'Condiciones médicas',
  goals: 'Objetivo',
  experience_level: 'Experiencia',
  availability: 'Disponibilidad',
}

/** Texto de los campos de SALUD vacíos: la ausencia de lesiones también es información para el coach. */
const HEALTH_EMPTY_TEXT = {
  injuries: 'Sin lesiones informadas',
  medical_conditions: 'Sin condiciones médicas informadas',
} as const

/** Nota al pie, NUNCA en reemplazo de la tarjeta cuando hay lesiones o condiciones cargadas. */
export const HEALTH_INTAKE_PENDING_NOTE = 'Tu alumno aún no completa su ficha inicial'

const SANTIAGO_TZ = 'America/Santiago'
const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Formateador reutilizado (construir un `Intl.DateTimeFormat` por ficha cuesta caro y acá basta uno).
 * `formatToParts` + armado manual, nunca `toLocaleString` + `new Date(string)`: el string localizado
 * no es ISO y Hermes/iOS lo rechaza.
 */
const SANTIAGO_DAY_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: SANTIAGO_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Día calendario de Santiago para un `timestamptz`. Helper PROPIO del paquete a propósito: las
 * implementaciones existentes viven en las apps (`apps/web/src/lib/date-utils.ts`,
 * `apps/mobile/lib/date-utils.ts`) y un paquete jamás importa de `apps/*`. La TZ es fija, así que el
 * servidor web (en UTC) y el teléfono del coach imprimen el MISMO día: sin esto, un intake editado a
 * las 23:00 de Chile diría un día en el render del servidor y otro en el del cliente.
 * Una cadena que ya es `yyyy-mm-dd` vuelve tal cual (pasarla por `new Date()` la anclaría a
 * medianoche UTC y en Santiago caería el día anterior).
 */
function santiagoDay(instant: string | null | undefined): string | null {
  if (typeof instant !== 'string') return null
  const raw = instant.trim()
  if (raw.length === 0) return null
  if (ISO_YMD.test(raw)) return raw
  // Postgres puede entregar `yyyy-mm-dd hh:mm:ss+00`: se normalizan el espacio y el offset de 2 dígitos.
  let normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  if (/[+-]\d{2}$/.test(normalized)) normalized = `${normalized}:00`
  const dt = new Date(normalized)
  if (Number.isNaN(dt.getTime())) return null
  const parts = SANTIAGO_DAY_PARTS.formatToParts(dt)
  let year = ''
  let month = ''
  let day = ''
  for (const part of parts) {
    if (part.type === 'year') year = part.value
    else if (part.type === 'month') month = part.value
    else if (part.type === 'day') day = part.value
  }
  if (!year || !month || !day) return null
  return `${year}-${month}-${day}`
}

/** Texto utilizable de una columna nullable: `''`, espacios o no-string cuentan como vacío. */
function cleanText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function row(key: HealthIntakeFieldKey, value: string, isEmpty: boolean): HealthIntakeRow {
  return { key, label: HEALTH_INTAKE_LABELS[key], value, isEmpty }
}

/**
 * Vista de solo lectura de la ficha de salud. Mismo resultado en web y en la app.
 *
 * · `injuries` / `medical_conditions` van SIEMPRE, con su texto completo o con «Sin … informadas».
 * · `goals` / `experience_level` / `availability` sólo aparecen si tienen texto: no existe copy
 *   canónico para «sin objetivo» y no se inventa uno.
 * · `pendingIntakeNote` acompaña a la tarjeta mientras la ficha inicial —las tres columnas que el
 *   alumno llena al registrarse— no esté completa (CA3.2), y es lo ÚNICO que queda si los cinco
 *   campos están vacíos o no hay fila.
 */
export function buildHealthIntakeView(intake: HealthIntakeSource | null | undefined): HealthIntakeView {
  const injuries = cleanText(intake?.injuries)
  const medicalConditions = cleanText(intake?.medical_conditions)
  const goals = cleanText(intake?.goals)
  const experienceLevel = cleanText(intake?.experience_level)
  const availability = cleanText(intake?.availability)

  // La ficha inicial la llena el ALUMNO al registrarse; el INSERT placeholder del coach deja las tres
  // en `''` (`.../biometrics/route.ts:62-72`, `client-detail.service.ts:950-959`).
  const fichaInicialPendiente = goals.length === 0 || experienceLevel.length === 0 || availability.length === 0

  if (
    injuries.length === 0 &&
    medicalConditions.length === 0 &&
    goals.length === 0 &&
    experienceLevel.length === 0 &&
    availability.length === 0
  ) {
    // Sin fila, o los cinco vacíos: no se fecha nada que nadie escribió.
    return { isEmpty: true, rows: [], updatedLabel: null, pendingIntakeNote: HEALTH_INTAKE_PENDING_NOTE }
  }

  const rows: HealthIntakeRow[] = [
    injuries.length > 0 ? row('injuries', injuries, false) : row('injuries', HEALTH_EMPTY_TEXT.injuries, true),
    medicalConditions.length > 0
      ? row('medical_conditions', medicalConditions, false)
      : row('medical_conditions', HEALTH_EMPTY_TEXT.medical_conditions, true),
  ]
  if (goals.length > 0) rows.push(row('goals', goals, false))
  if (experienceLevel.length > 0) rows.push(row('experience_level', experienceLevel, false))
  if (availability.length > 0) rows.push(row('availability', availability, false))

  const dayIso = santiagoDay(intake?.updated_at)
  return {
    isEmpty: false,
    rows,
    updatedLabel: dayIso === null ? null : `Actualizado el ${shortDayMonthEs(dayIso)}`,
    pendingIntakeNote: fichaInicialPendiente ? HEALTH_INTAKE_PENDING_NOTE : null,
  }
}
