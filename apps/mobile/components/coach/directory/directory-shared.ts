import { AlertOctagon, AlertTriangle, Check } from 'lucide-react-native'
import type { BadgeTone } from '../../Badge'
import type { DirectoryClient, DirectorySortKey, StatusFilter } from '../../../lib/clients-directory'

/**
 * Shared tokens/helpers for the coach directory (espejo web `ClientsDirectoryClient`
 * + `DirRowCard`). Extraídos de la pantalla para mantener `clientes.tsx` < 600L.
 *
 * Los literales de estado son la excepción documentada de TOKENS.md §1
 * (NO brand — colores fijos seguros para SVG/iconos que la rampa de marca NO pisa).
 */

export const SUCCESS = '#1FB877' // success-500
export const WARNING = '#F5A524' // warning-500
export const DANGER = '#F4365A' // danger-500
export const EMBER = '#FF6A3D' // ember-500
export const INFO = '#2680FF' // info-500 (fijo)
export const SEV_HEX: Record<'danger' | 'warning' | 'success', string> = { danger: DANGER, warning: WARNING, success: SUCCESS }

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Severidad por attentionScore (1:1 web DirRowCard: ≥50 Riesgo, ≥25 Atención, resto On track). */
export function severityMeta(score: number): { label: string; tone: 'danger' | 'warning' | 'success'; Icon: typeof AlertOctagon } {
  if (score >= 50) return { label: 'Riesgo', tone: 'danger', Icon: AlertOctagon }
  if (score >= 25) return { label: 'Atención', tone: 'warning', Icon: AlertTriangle }
  return { label: 'On track', tone: 'success', Icon: Check }
}

/**
 * Instante desde el cual `first_login_at` es una señal CONFIABLE: solo las filas creadas después
 * del deploy web que empezó a escribir la columna pueden interpretarse como «Todavía no entró»
 * cuando llegan sin timestamp.
 *
 * **El jefe de la ola la fija al ISO del deploy web** (mismo patrón que `VIVE_TU_APP_ENTERED_CUTOVER`
 * en vive-tu-app-directo). Mientras apunte al futuro —el valor con el que nace— ninguna fila cae en
 * «Todavía no entró» y el roster degrada al fallback honesto de W0: degradación honesta, no un bug.
 *
 * DUPLICADA a propósito con la web (`apps/web/src/app/coach/clients/_lib/client-status.ts`): un
 * módulo en `packages/*` viajaría en el bundle RN y crearía split por runtime — el binario de la
 * tienda no se redeploya junto con la web, así que cada plataforma fija su propio corte.
 */
export const FIRST_LOGIN_SIGNAL_CUTOVER = '2100-01-01T00:00:00Z'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function parseIso(value: string | null): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** Medianoche local del instante dado — «mismo día calendario» NO es «hace menos de 24 h». */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** «Entró hace 3 min» / «Entró hoy» / «Entró hace 2 d», con el reloj inyectado. */
function enteredLabel(firstLoginMs: number, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - firstLoginMs)
  if (elapsed < HOUR_MS) {
    // Mínimo 1: «Entró hace 0 min» se lee como un error de cálculo, no como recién.
    const minutes = Math.max(1, Math.floor(elapsed / 60000))
    return `Entró hace ${minutes} min`
  }
  const days = Math.round((startOfLocalDay(now.getTime()) - startOfLocalDay(firstLoginMs)) / DAY_MS)
  if (days <= 0) return 'Entró hoy'
  return `Entró hace ${days} d`
}

/**
 * Estado unificado del alumno (Archivado / Pausado / Entró… / Todavía no entró / Todavía no cambió
 * su clave / Activo). Función pura y compartida — copia LOCAL de mobile (espejo del
 * `getClientStatusMeta` web, TASKS.md W0.2/W0.3 y W1.5). NO vive en `packages/*`: un cambio ahí
 * viajaría en el bundle RN y crearía split por runtime, así que cada plataforma mantiene su copia.
 *
 * Precedencia: archivado > pausado > `first_login_at` > fallback por `force_password_change`.
 *
 * REGLA DURA que sobrevive a W1.5: `force_password_change` se apaga cuando el alumno **completa**
 * el cambio de clave, no cuando entra. Una fila ANTERIOR al corte pudo entrar sin dejar timestamp,
 * así que jamás le decimos «Todavía no entró»: su fallback sigue diciendo lo que el dato dice.
 *
 * Las claves `pending`/`active`/`paused`/`archived` NO se renombran (`pendingSyncCount`, los filtros
 * de `clients-directory.ts` y `PENDIENTE_SYNC` las espejan); `entered` es la única nueva.
 *
 * @param now reloj inyectable (tests deterministas).
 * @param cutoverIso costura de test: en producción SIEMPRE `FIRST_LOGIN_SIGNAL_CUTOVER`.
 */
export function statusMeta(
  input: {
    isArchived: boolean
    isActive: boolean
    firstLoginAt: string | null
    createdAt: string | null
    forcePasswordChange: boolean
  },
  now: Date = new Date(),
  cutoverIso: string = FIRST_LOGIN_SIGNAL_CUTOVER
): { key: 'archived' | 'paused' | 'entered' | 'pending' | 'active'; label: string; tone: BadgeTone } {
  if (input.isArchived) return { key: 'archived', label: 'Archivado', tone: 'neutral' }
  if (!input.isActive) return { key: 'paused', label: 'Pausado', tone: 'neutral' }

  const firstLoginMs = parseIso(input.firstLoginAt)
  if (firstLoginMs !== null) return { key: 'entered', label: enteredLabel(firstLoginMs, now), tone: 'success' }

  if (input.forcePasswordChange) {
    const createdMs = parseIso(input.createdAt)
    const cutoverMs = parseIso(cutoverIso)
    // Fila NACIDA después del corte y sin timestamp ⇒ la ausencia es información, no un hueco.
    const postCutover = createdMs !== null && cutoverMs !== null && createdMs >= cutoverMs
    return { key: 'pending', label: postCutover ? 'Todavía no entró' : 'Todavía no cambió su clave', tone: 'info' }
  }

  return { key: 'active', label: 'Activo', tone: 'success' }
}

/** Etiqueta + color del dot de última actividad (verde <3d / warning <7d / danger). */
export function lastInfo(date: string | null): { label: string; dot: string } {
  if (!date) return { label: 'Sin entrenos', dot: '#A8B1BD' }
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  const dot = days < 3 ? SUCCESS : days < 7 ? WARNING : DANGER
  if (days <= 0) return { label: 'Hoy', dot }
  if (days === 1) return { label: 'Ayer', dot }
  return { label: `Hace ${days}d`, dot }
}

// Orden/labels 1:1 con el web (`DirectoryActionBar` → `directory-types.ts:22-29`).
// Los `value` son las claves internas del motor de orden RN (`sortClients`), NO se
// tocan; solo el label + el orden de aparición espejan el sort-sheet web.
export const SORT_OPTIONS: { label: string; value: DirectorySortKey }[] = [
  { label: 'Urgencia (default)', value: 'attention_score' },
  { label: 'Nombre A→Z', value: 'name_asc' },
  { label: 'Última actividad', value: 'last_workout' },
  { label: 'Adherencia ↓', value: 'adherence' },
  { label: 'Peso: mayor cambio', value: 'weight_change' },
  { label: 'Días programa', value: 'plan_days' },
]

// Labels del chip de estado 1:1 con el web (`DirectoryActionBar.tsx:158-163`
// `statusLabels`). Solo consumido por el chip activo en `clientes.tsx`.
export const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'Todos', value: 'any' },
  { label: 'Activo', value: 'active' },
  { label: 'Pausado', value: 'paused' },
  { label: 'Todavía no cambió su clave', value: 'pending_sync' },
  { label: 'Archivados', value: 'archived' },
]

// Labels del chip de riesgo/programa 1:1 con el web (`DirectoryActionBar.tsx:150-168`
// `riskLabels` + `programLabels`; el modelo RN funde ambos en `riskFilter`).
export const RISK_LABELS: Record<string, string> = {
  urgent: 'Atención urgente',
  review: 'En riesgo',
  on_track: 'On track',
  expired_program: 'Programa vencido',
  password_reset: 'Todavía no cambió su clave',
  no_program: 'Sin programa',
  with_program: 'Con programa',
  nutrition_low: 'Nutrición baja',
}
