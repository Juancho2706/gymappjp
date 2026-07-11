import { Text, View } from 'react-native'
import { BarChart3, Dumbbell, Flame, type LucideIcon } from 'lucide-react-native'
import {
  ShareCardEyebrow,
  ShareCardHero,
  ShareCardPreview,
  ShareCardSubtitle,
} from '../ShareCard'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import { fmtVolume, type MonthlyRecap } from '../../lib/monthly-summary'

/**
 * Variante "Resumen mensual" de la share-card branded (E4-21). Espejo RN del
 * `MonthlySummaryShareCardModal` web (`renderMonthlySummaryCardToBlob`,
 * workout-pr-card-canvas.ts:870-943): eyebrow = mes, subtítulo = "Resumen de {nombre}",
 * hero = sesiones del mes, y el grid de 3 tiles (Volumen · Prom/sesión · Racha).
 * Reusa el motor `ShareCardPreview` (variant="monthly": icono calendario + tono marca)
 * — solo aporta el bloque central.
 *
 * Prop-driven: el perfil ya trae el `recap` (getMonthlyRecap fail-open) y la racha
 * calculada, así que se pasan como props en vez de re-consultar (una sola query en el
 * `load()` del perfil).
 */
export interface MonthlySummaryShareCardProps {
  visible: boolean
  onClose: () => void
  /** Resumen del mes ya cargado por el perfil (fail-open, puede venir null). */
  recap: MonthlyRecap | null
  /** Nombre de pila para el subtítulo ("Resumen de {firstName}"). */
  firstName: string
  /** Racha actual (días) — ya calculada en el perfil; se muestra en el tile de racha. */
  streak: number
}

// Literal ember del canvas always-dark (mirror ShareCard.tsx:79 / web EMBER_500).
const EMBER_500 = '#FF6A3D'
// Alphas blancas del canvas always-dark del recap web (drawStatTile, workout-pr-card-canvas.ts:576-606).
const TILE_BG = 'rgba(255,255,255,0.05)'
const TILE_BORDER = 'rgba(255,255,255,0.08)'
const TILE_LABEL = 'rgba(255,255,255,0.62)'

/** Tile de estadística del recap (icono + valor + label), espejo de drawStatTile. */
function StatTile({ Icon, value, label, color }: { Icon: LucideIcon; value: string; label: string; color: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: TILE_BG,
        borderWidth: 1,
        borderColor: TILE_BORDER,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 6,
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Icon size={22} color={color} strokeWidth={2.2} />
      <Text style={{ fontFamily: FONT.displayBold, fontSize: 22, color }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: TILE_LABEL }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export function MonthlySummaryShareCard({
  visible,
  onClose,
  recap,
  firstName,
  streak,
}: MonthlySummaryShareCardProps) {
  const { theme } = useTheme()
  const accent = theme.primary

  const sessions = recap?.sessions ?? 0
  const volumeKg = recap?.volumeKg ?? 0
  const monthLabel = recap?.monthLabel ?? ''
  // Promedio de volumen por sesión (mismo cálculo que el tile web, canvas:919).
  const avgStr = sessions > 0 ? fmtVolume(volumeKg / sessions) : '—'

  return (
    <ShareCardPreview
      visible={visible}
      onClose={onClose}
      variant="monthly"
      shareMessage="Mi resumen del mes 📅"
      fileName="mi-resumen-mensual"
    >
      <ShareCardEyebrow>{monthLabel.toUpperCase()}</ShareCardEyebrow>
      <ShareCardSubtitle>{`Resumen de ${firstName}`}</ShareCardSubtitle>
      <ShareCardHero value={String(sessions)} unit={sessions === 1 ? 'entreno' : 'entrenos'} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <StatTile Icon={Dumbbell} value={fmtVolume(volumeKg)} label="Volumen" color={accent} />
        <StatTile Icon={BarChart3} value={avgStr} label="Prom/sesión" color={accent} />
        <StatTile Icon={Flame} value={String(streak)} label={streak === 1 ? 'Día de racha' : 'Racha'} color={EMBER_500} />
      </View>
    </ShareCardPreview>
  )
}
