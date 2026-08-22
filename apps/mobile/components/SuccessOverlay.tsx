/**
 * SuccessOverlay — la celebración verde de pantalla completa: confeti, disco de
 * éxito con el check y dos líneas de copy.
 *
 * Nació inline en el check-in del alumno (`app/alumno/(tabs)/check-in.tsx`) y se
 * extrajo acá para que el builder de programas confirme el guardado con la MISMA
 * pieza (pedido del owner, QA 22-08). El look del check-in se conserva verbatim:
 * mismas medidas, misma tipografía, mismo confeti.
 *
 * Dos usos, según `durationMs` (la política pura vive en `lib/success-overlay.ts`):
 * - fugaz (default ~1,4 s): se cierra sola y llama `onDone` — el builder navega ahí.
 * - `durationMs={null}`: se queda hasta que el usuario toca la acción que se le
 *   pasa por `children` (el «Volver al inicio» del check-in).
 *
 * Cubre TODA la pantalla en la que se monta (`StyleSheet.absoluteFill`), así que
 * sirve tanto de pantalla completa (return del check-in) como de capa encima de
 * un formulario vivo (builder). Safe areas por `react-native-safe-area-context`;
 * reduce-motion apaga confeti y spring.
 */
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check } from 'lucide-react-native'
import { MotiView } from 'moti'
import { Confetti } from 'react-native-fast-confetti'
import { useTheme } from '../context/ThemeContext'
import { useEvaMotion } from '../lib/motion'
import { haptics } from '../lib/haptics'
import { TYPE, FONT } from '../lib/typography'
import { SHADOWS } from '../lib/shadows'
import { successOverlayPlan, type SuccessOverlayTone } from '../lib/success-overlay'
import { AppBackground } from './AppBackground'

// Neutral DS fijo para el prop `color` de lucide (una className no expresa el
// color literal de un icono) — mismo patrón que el resto de pantallas alumno.
const ICON_WHITE = '#FFFFFF'

/** Relleno del disco por tono. Clase literal para que NativeWind la compile estáticamente. */
const TONE_FILL: Record<SuccessOverlayTone, string> = {
  success: 'bg-success-500',
}

export interface SuccessOverlayProps {
  title: string
  subtitle?: string | null
  /** Hoy solo `success` (verde del DS). */
  tone?: SuccessOverlayTone
  /**
   * ms visibles antes de `onDone`. Omitido ⇒ ~1,4 s. `null` ⇒ no se cierra solo
   * (el usuario cierra con la acción de `children`).
   */
  durationMs?: number | null
  /** Se llama cuando termina la ventana (solo en el modo fugaz). */
  onDone?: () => void
  /** Acción bajo el copy (p. ej. el botón «Volver al inicio» del check-in). */
  children?: ReactNode
  testID?: string
}

export function SuccessOverlay({
  title,
  subtitle,
  tone = 'success',
  durationMs,
  onDone,
  children,
  testID,
}: SuccessOverlayProps) {
  const { theme, resolvedScheme } = useTheme()
  const { reduced } = useEvaMotion()
  const plan = useMemo(() => successOverlayPlan({ durationMs, reduced }), [durationMs, reduced])

  // `onDone` por ref: si el call-site pasa una lambda nueva en cada render, el
  // timer se reiniciaría en cada uno y el overlay no cerraría NUNCA.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    if (!plan.haptic) return
    void haptics.success()
  }, [plan.haptic])

  useEffect(() => {
    if (plan.visibleMs === null) return
    const timer = setTimeout(() => onDoneRef.current?.(), plan.visibleMs)
    return () => clearTimeout(timer)
  }, [plan.visibleMs])

  return (
    <View
      style={StyleSheet.absoluteFill}
      className="bg-surface-app"
      accessibilityViewIsModal
      testID={testID}
    >
      <AppBackground />
      {plan.confetti ? (
        <Confetti autoplay fadeOutOnEnd colors={[theme.primary, theme.warning, theme.success, theme.cyan]} />
      ) : null}
      <SafeAreaView style={styles.safe}>
        <View style={styles.wrap} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <MotiView
            from={plan.entrance === 'spring' ? { scale: 0.8, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              plan.entrance === 'spring'
                ? { type: 'spring', damping: 13, stiffness: 180 }
                : { type: 'timing', duration: 0 }
            }
            className={TONE_FILL[tone]}
            style={[styles.circle, SHADOWS[resolvedScheme].lg]}
          >
            <Check size={44} color={ICON_WHITE} strokeWidth={2.5} />
          </MotiView>
          <Text
            className="text-strong"
            style={[TYPE.h2, styles.title, { fontSize: 27, lineHeight: 32, fontFamily: FONT.displayBlack }]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-muted" style={[TYPE.body, styles.subtitle]}>
              {subtitle}
            </Text>
          ) : null}
          {children}
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 48 },
  circle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 8, maxWidth: 300 },
})
