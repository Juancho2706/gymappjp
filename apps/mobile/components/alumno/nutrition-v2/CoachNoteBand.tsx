/**
 * Banda de nota del coach en el Hoy del alumno RN (SPEC nutrition-coach-notes N3):
 * franja (`slot.instructions`) y grupo de porciones (`target.notes`). Estilo nota
 * de marca — fondo primario tenue (el paso /10 de la casa, white-label via token),
 * borde suave, icono 💬 y texto PLANO (sin markdown; los saltos de línea del
 * textarea se respetan). Sin nota (o solo whitespace) ⇒ cero render — la regla
 * vive en `coachNoteDisplayText`, compartida con la web.
 *
 * NO es mensajería (N4): es parte del plan publicado, sin acciones ni estado.
 */
import { Text, View } from 'react-native'
import { coachNoteDisplayText } from '@eva/nutrition-v2'

export function CoachNoteBand({
  note,
  className,
}: {
  note: string | null | undefined
  className?: string
}) {
  const text = coachNoteDisplayText(note)
  if (!text) return null
  return (
    <View
      accessibilityLabel={`Nota del coach: ${text}`}
      className={`flex-row items-start gap-1.5 rounded-control border border-primary/15 bg-primary/10 px-2.5 py-1.5${className ? ` ${className}` : ''}`}
    >
      <Text accessibilityElementsHidden importantForAccessibility="no" className="text-xs leading-5">
        💬
      </Text>
      <Text className="min-w-0 flex-1 text-xs leading-5 text-body">{text}</Text>
    </View>
  )
}
