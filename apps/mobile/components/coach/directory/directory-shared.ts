import { AlertOctagon, AlertTriangle, Check } from 'lucide-react-native'
import type { BadgeTone } from '../../Badge'
import type { DirectoryClient, DirectorySortKey, StatusFilter } from '../../../lib/clients-directory'

/**
 * Shared tokens/helpers for the coach directory (espejo web `ClientsDirectoryClient`
 * + `DirRowCard`). Extraídos de la pantalla para mantener `clientes.tsx` < 600L.
 *
 * Los literales de estado son la excepción documentada del token-contract §1
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

/** Estado unificado del alumno (Archivado / Pausado / Pend. sync / Activo). */
export function statusMeta(client: DirectoryClient): { key: string; label: string; tone: BadgeTone } {
  if (client.isArchived) return { key: 'archived', label: 'Archivado', tone: 'neutral' }
  if (!client.isActive) return { key: 'paused', label: 'Pausado', tone: 'neutral' }
  if (client.forcePwChange) return { key: 'pending', label: 'Pend. sync', tone: 'info' }
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

export const SORT_OPTIONS: { label: string; value: DirectorySortKey }[] = [
  { label: 'Urgencia (default)', value: 'attention_score' },
  { label: 'Nombre A→Z', value: 'name_asc' },
  { label: 'Última sesión', value: 'last_workout' },
  { label: 'Días plan restantes', value: 'plan_days' },
  { label: 'Adherencia', value: 'adherence' },
  { label: 'Peso: mayor cambio', value: 'weight_change' },
]

export const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'Todos', value: 'any' },
  { label: 'Activos', value: 'active' },
  { label: 'Pausados', value: 'paused' },
  { label: 'Cambio de contraseña pendiente', value: 'pending_sync' },
  { label: 'Archivados', value: 'archived' },
]

export const RISK_LABELS: Record<string, string> = {
  urgent: 'Riesgo',
  review: 'Atención',
  on_track: 'On track',
  expired_program: 'Programa vencido',
  password_reset: 'Cambio de contraseña',
  no_program: 'Sin programa',
  with_program: 'Con programa',
  nutrition_low: 'Nutrición baja',
}
