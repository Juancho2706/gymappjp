import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CoachIdentifierForm } from './CoachIdentifierForm'
import { ROLE_SHEET_TOP_OFFSET } from './RoleMorph'
import { FONT } from '../../lib/typography'

/**
 * CoachCodeSheet — el contenido de PANTALLA del sheet en el que morfea la card
 * "Soy alumno" (`sheetlg`, §3.3 de `docs/specs/entrada-dark-v1/DESIGN-SPEC.md`).
 *
 * Decision del owner (2026-07-30): el morph **no navega**. La card se expande en la MISMA
 * pantalla hasta ser este sheet, que contiene el mismo form de identificador que la ruta
 * `/alumno/codigo` — el frame 4 del concepto C, donde el fondo (el selector) nunca se
 * desmonta y por eso la atmosfera es continua por construccion.
 *
 * Solo aporta la cabecera del sheet (grab + titulares). El form, con toda su logica de
 * resolucion del coach, es `CoachIdentifierForm`: la misma instancia que monta el frame 04.
 */
export interface CoachCodeSheetProps {
  /** El morph ya cerro su recorrido: es el momento de enfocar el campo, no antes. */
  ready: boolean
  /** Revierte el morph (grab + back de Android + dim). */
  onClose: () => void
}

export function CoachCodeSheet({ ready, onClose }: CoachCodeSheetProps) {
  const insets = useSafeAreaInsets()

  return (
    <CoachIdentifierForm
      variant="sheet"
      focusWhenReady={ready}
      // El teclado no puede abrirse durante el morph: enfocar es cosa de `ready`.
      autoFocus={false}
      keyboardOffset={insets.top + ROLE_SHEET_TOP_OFFSET}
      header={
        <>
          {/* El grab es el afordance de cierre en iOS (no hay boton fisico de atras).
              `hitSlop` en vez de padding: la geometria de §3.3 (42x4, 24 de aire abajo)
              se conserva intacta y el area tactil sube a ~32 pt. */}
          <Pressable
            testID="coach-code-sheet-close"
            accessibilityRole="button"
            accessibilityLabel="Volver a elegir cómo entrar"
            onPress={onClose}
            hitSlop={{ top: 14, bottom: 14, left: 80, right: 80 }}
            style={styles.grabHit}
          >
            <View style={styles.grab} />
          </Pressable>

          <Text style={styles.title}>Código de tu coach</Text>
          <Text style={styles.subtitle}>
            Ingrésalo una sola vez. Queda guardado en este teléfono.
          </Text>
        </>
      }
    />
  )
}

const styles = StyleSheet.create({
  grabHit: { alignSelf: 'center', marginBottom: 24 },
  grab: { width: 42, height: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },

  title: {
    fontFamily: FONT.displayBlack,
    fontSize: 25,
    lineHeight: 27,
    letterSpacing: -0.7,
    color: '#F4F6F8',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONT.uiSemibold,
    fontSize: 13,
    lineHeight: 19,
    color: '#86919E',
    marginBottom: 20,
  },
})
