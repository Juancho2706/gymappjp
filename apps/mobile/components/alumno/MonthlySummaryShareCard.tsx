import { useEffect, useState } from 'react'
import {
  ShareCardEyebrow,
  ShareCardHero,
  ShareCardPill,
  ShareCardPreview,
  ShareCardSubtitle,
} from '../ShareCard'
import { fmtVolume, getMonthlyRecap, type MonthlyRecap } from '../../lib/monthly-summary'

/**
 * Variante "Resumen mensual" de la share-card branded (E4-21). Espejo RN del
 * `MonthlySummaryShareCardModal` web: eyebrow = mes, subtítulo = "Resumen de {nombre}",
 * hero = sesiones del mes, y dos pills de contexto (volumen + racha). Reusa el motor
 * `ShareCardPreview` (variant="monthly": icono calendario + tono marca) — solo aporta
 * el bloque central y la carga de datos mensuales que el perfil no tenía.
 *
 * Autocontenido: hace lazy-fetch del resumen del mes (getMonthlyRecap, alumno-scoped)
 * la primera vez que se abre, así el perfil no carga datos extra en cada render.
 */
export interface MonthlySummaryShareCardProps {
  visible: boolean
  onClose: () => void
  /** Id del alumno (client.id del perfil) — para la query alumno-scoped. */
  clientId: string | null
  /** Nombre de pila para el subtítulo ("Resumen de {firstName}"). */
  firstName: string
  /** Racha actual (días) — ya calculada en el perfil; se muestra como pill. */
  streak: number
}

export function MonthlySummaryShareCard({
  visible,
  onClose,
  clientId,
  firstName,
  streak,
}: MonthlySummaryShareCardProps) {
  const [recap, setRecap] = useState<MonthlyRecap | null>(null)

  // Lazy-fetch: solo al abrir por primera vez (una sola vez por sesión de perfil).
  useEffect(() => {
    if (!visible || recap || !clientId) return
    let alive = true
    getMonthlyRecap(clientId).then((r) => {
      if (alive) setRecap(r)
    })
    return () => {
      alive = false
    }
  }, [visible, recap, clientId])

  const sessions = recap?.sessions ?? 0
  const monthLabel = recap?.monthLabel ?? ''
  const streakLabel = `${streak} ${streak === 1 ? 'día' : 'días'} de racha`

  return (
    <ShareCardPreview
      visible={visible}
      onClose={onClose}
      variant="monthly"
      shareMessage="Mi resumen del mes 📅"
      fileName="eva-resumen-mensual"
    >
      <ShareCardEyebrow>{monthLabel.toUpperCase()}</ShareCardEyebrow>
      <ShareCardSubtitle>{`Resumen de ${firstName}`}</ShareCardSubtitle>
      <ShareCardHero value={String(sessions)} unit={sessions === 1 ? 'entreno' : 'entrenos'} />
      <ShareCardPill tone="accent">{`${fmtVolume(recap?.volumeKg ?? 0)} de volumen`}</ShareCardPill>
      <ShareCardPill>{streakLabel}</ShareCardPill>
    </ShareCardPreview>
  )
}
