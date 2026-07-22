import { Text, View } from 'react-native'
import { Pencil, RotateCcw } from 'lucide-react-native'
import { FONT } from '../../../lib/typography'

/**
 * Banner informativo del ejecutor (E1.7) — se pinta BAJO el SessionHeader cuando la pantalla se
 * abrio desde el dashboard con intencion de recuperar o revisar un dia:
 *   · `recoverDate` (param `recuperar`): franja AMBAR solida "Recuperando: {dia}…". El alumno entrena
 *     HOY y su log cae hoy — que es exactamente la semantica de recuperacion (la atribucion greedy del
 *     dashboard, E1.1, marca luego ese dia como hecho). El banner solo comunica el contexto.
 *   · `editDate` (param `fecha`): franja NEUTRA "Editando registros del {dia}". Defensivo/informativo:
 *     el guardado RN aun escribe el log de HOY (el solo-UPDATE por target_date es un server action web,
 *     E1.5), por eso el sheet no habilita "Revisar y editar" todavia; este banner queda cableado para
 *     cuando el modo edicion de fecha pasada llegue a RN.
 *
 * El ejecutor es dark-only (`bg-ink-950`), asi que los colores estan fijados on-dark (no dependen del
 * theme del usuario) para leer siempre. Prioridad: si por algun motivo llegan ambos, gana `recuperar`.
 */

const WARNING_500 = '#F5A524' // DS --color-warning-500 (ambar)
const ON_WARNING = '#0B0E13' // ink oscuro sobre ambar solido
const NEUTRAL_BG = 'rgba(255,255,255,0.08)'
const NEUTRAL_BORDER = 'rgba(255,255,255,0.14)'
const NEUTRAL_ICON = '#AEB9C7'
const NEUTRAL_TITLE = '#E7ECF3'
const NEUTRAL_SUB = '#AEB9C7'

/** "Martes" — dia calendario es-CL (mayuscula inicial) desde un ymd; mediodia UTC evita cruce de huso. */
function weekdayEs(ymd: string): string {
  const w = new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'UTC' })
  return w.charAt(0).toUpperCase() + w.slice(1)
}

export function RecoveryBanner({
  recoverDate,
  editDate,
}: {
  recoverDate?: string
  editDate?: string
}) {
  if (recoverDate) {
    const dia = weekdayEs(recoverDate)
    return (
      <View className="flex-row items-center gap-3 px-4 py-2.5" style={{ backgroundColor: WARNING_500 }}>
        <RotateCcw size={17} color={ON_WARNING} strokeWidth={2.2} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: ON_WARNING, fontFamily: FONT.uiBold, fontSize: 13 }}>Recuperando: {dia}</Text>
          <Text numberOfLines={1} style={{ color: ON_WARNING, opacity: 0.82, fontFamily: FONT.uiSemibold, fontSize: 11.5, marginTop: 1 }}>
            Al terminar, tu {dia.toLowerCase()} queda listo en esta semana
          </Text>
        </View>
      </View>
    )
  }

  if (editDate) {
    const dia = weekdayEs(editDate)
    return (
      <View className="flex-row items-center gap-3 px-4 py-2.5" style={{ backgroundColor: NEUTRAL_BG, borderBottomWidth: 1, borderBottomColor: NEUTRAL_BORDER }}>
        <Pencil size={16} color={NEUTRAL_ICON} strokeWidth={2} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: NEUTRAL_TITLE, fontFamily: FONT.uiBold, fontSize: 13 }}>Editando registros del {dia.toLowerCase()}</Text>
          <Text numberOfLines={1} style={{ color: NEUTRAL_SUB, fontFamily: FONT.uiSemibold, fontSize: 11.5, marginTop: 1 }}>
            Corrige tus series de ese dia
          </Text>
        </View>
      </View>
    )
  }

  return null
}
