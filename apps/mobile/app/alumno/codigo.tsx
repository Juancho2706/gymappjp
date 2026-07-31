import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import { ForceScheme } from '../../context/ThemeContext'
import { EntryGrain } from '../../components/entry/EntryBackground'
import { EvaFigure } from '../../components/entry/EvaFigure'
import { CoachIdentifierForm } from '../../components/entry/CoachIdentifierForm'
import { ENTRY_LIGHT, LightLayer } from '../../components/entry/LightLayer'
import { EASE } from '../../lib/motion'
import { ENTRY_TOKENS } from '../../lib/theme'
import { FONT } from '../../lib/typography'

/**
 * FRAME 04 — `/alumno/codigo` dark.
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §3.4 + §4 (C1-C3).
 *
 * Presupuesto de novedad: todo el motion expresivo se gasto en los frames 01 y 02. **Aca
 * la pantalla es deliberadamente aburrida** — familiar, rapida, sin sorpresas. Lo unico
 * que importa es que sea DEL MISMO COLOR: el canvas `#07080C` y el crosshatch siguen
 * siendo los mismos, asi que al llegar no hay ni un frame de otro color.
 *
 * Desde el morph en la misma pantalla (frame 4 del concepto C) el camino NORMAL del alumno
 * ya no pasa por aca: la card "Soy alumno" se expande hasta ser el sheet que contiene este
 * mismo form (`components/entry/CoachCodeSheet.tsx`). Esta ruta sigue siendo obligatoria
 * para todo lo que llega por URL o por rebote:
 *   - deep links `/c/:slug` y `/invite/:code` (`+native-intent.ts` → `?identifier=…&auto=1`),
 *   - "cambiar de coach" desde el login (`(auth)/login.tsx`),
 *   - los rebotes de `alumno/suspended`, `alumno/consent` y `StudentAccessBlocked`.
 *
 * El form es UNA sola implementacion compartida (`CoachIdentifierForm`): parseo, fetch,
 * commit del branding, auto-submit y shake viven ahi, no aca. Esta pantalla aporta su piel
 * (canvas + capa de luz + crosshatch), su navbar y su cascada C1.
 */
export default function CodigoRoute() {
  // Bloqueante del concepto (§3.4): con `ForceLightTheme` esta ruta entraba en flash
  // blanco. `branded={false}` ademas evita teñirla con la marca del coach que el usuario
  // esta justamente intentando reemplazar.
  return (
    <ForceScheme scheme="dark" branded={false}>
      <CodigoScreen />
    </ForceScheme>
  )
}

/** C1 — cascada de la pantalla: 220 ms, stagger 60 ms, 5 pasos. Mas corta y mas plana
 *  que la del frame 02 a proposito: el usuario ya decidio, ahora solo quiere terminar. */
const STEP_MS = 220
const STAGGER_MS = 60
const REDUCED_MS = 180

function Reveal({
  step,
  reduced,
  style,
  children,
}: {
  step: number
  reduced: boolean
  style?: React.ComponentProps<typeof MotiView>['style']
  children: React.ReactNode
}) {
  return (
    <MotiView
      from={reduced ? { opacity: 0 } : { opacity: 0, translateY: 12 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, translateY: 0 }}
      transition={{
        type: 'timing',
        duration: reduced ? REDUCED_MS : STEP_MS,
        delay: reduced ? 0 : step * STAGGER_MS,
        easing: EASE.standard,
      }}
      style={style}
    >
      {children}
    </MotiView>
  )
}

function CodigoScreen() {
  const router = useRouter()
  const { identifier: initialIdentifier, auto } = useLocalSearchParams<{
    identifier?: string
    auto?: string
  }>()
  const reduced = useReducedMotion()

  return (
    <View style={styles.root}>
      <LightLayer spec={ENTRY_LIGHT.code} />
      <EntryGrain />

      <CoachIdentifierForm
        variant="screen"
        initialIdentifier={initialIdentifier}
        auto={auto === '1'}
        autoFocus={auto !== '1'}
        // Los bloques del form son los pasos 2-4 de la cascada; el navbar y los titulares
        // (0 y 1) los aporta la cabecera de esta pantalla.
        renderBlock={(block, index) => (
          <Reveal step={2 + index} reduced={reduced}>
            {block}
          </Reveal>
        )}
        header={
          <>
            <Reveal step={0} reduced={reduced}>
              <View style={styles.navbar}>
                <Pressable
                  testID="code-back"
                  accessibilityRole="button"
                  accessibilityLabel="Volver"
                  onPress={() => router.back()}
                  hitSlop={12}
                  style={styles.back}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)'] as const}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View pointerEvents="none" style={styles.backInset} />
                  <ArrowLeft size={18} color="#CDD3DB" strokeWidth={2.2} />
                </Pressable>
                {/* La misma pieza del frame 01, sin wordmark: a partir de aca la marca es
                    firma, no protagonista. */}
                <EvaFigure size={22} opacity={0.82} />
                <Text style={styles.step}>Paso 1 de 2</Text>
              </View>

              <Text style={styles.title}>{'Ingresa el código\nde tu coach'}</Text>
            </Reveal>

            <Reveal step={1} reduced={reduced}>
              <Text style={styles.subtitle}>
                Te lo comparte por WhatsApp, o te manda un enlace y entras directo sin escribir
                nada.
              </Text>
            </Reveal>
          </>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ENTRY_TOKENS.canvasEntry },

  navbar: {
    paddingTop: 6,
    marginBottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  step: {
    fontFamily: FONT.uiExtra,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#86919E',
  },

  title: {
    fontFamily: FONT.displayBlack,
    fontSize: 29,
    lineHeight: 31,
    letterSpacing: -0.87,
    color: '#F4F6F8',
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: FONT.uiSemibold,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#CDD3DB',
    maxWidth: 308,
    marginBottom: 26,
  },
})
