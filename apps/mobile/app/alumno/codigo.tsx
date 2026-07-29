import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, Link } from 'lucide-react-native'
import { MotiView } from 'moti'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import {
  fetchBrandingByCoachIdentifier,
  normalizeCoachIdentifier,
  saveStoredBranding,
} from '../../lib/branding'
import { commitResolvedBranding } from '../../lib/branding-transition'
import { ForceScheme, useTheme } from '../../context/ThemeContext'
import { EntryGrain } from '../../components/entry/EntryBackground'
import { EvaFigure } from '../../components/entry/EvaFigure'
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
 * La logica de resolucion del coach (parseo, fetch, commit del branding, auto-submit por
 * enlace) NO cambia en esta fase: solo cambia la piel.
 */
type ErrorKind = 'format' | 'not-found' | 'network' | null

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
  const { theme, setBranding } = useTheme()
  const reduced = useReducedMotion()
  const insets = useSafeAreaInsets()
  const [value, setValue] = useState(initialIdentifier ?? '')
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const [errorKind, setErrorKind] = useState<ErrorKind>(null)
  const handledIntent = useRef(false)
  const submitting = useRef(false)

  // C3 — error de codigo invalido: translateX ±6, 2 ciclos, 180 ms. Es el UNICO caso de
  // toda la entrada donde la haptica sube de nivel (`notificationAsync(Error)`).
  const shake = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))
  const fail = useCallback(
    (kind: Exclude<ErrorKind, null>) => {
      setErrorKind(kind)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      if (reduced) return
      shake.value = withSequence(
        withTiming(-6, { duration: 45, easing: EASE.standard }),
        withTiming(6, { duration: 45, easing: EASE.standard }),
        withTiming(-6, { duration: 45, easing: EASE.standard }),
        withTiming(0, { duration: 45, easing: EASE.standard }),
      )
    },
    [reduced, shake],
  )
  useEffect(() => () => cancelAnimation(shake), [shake])

  const submit = useCallback(
    async (rawValue: string) => {
      if (submitting.current) return

      const identifier = normalizeCoachIdentifier(rawValue)
      if (!identifier) {
        fail('format')
        return
      }

      submitting.current = true
      setLoading(true)
      setErrorKind(null)
      try {
        const found = await fetchBrandingByCoachIdentifier(identifier)
        if (!found) {
          fail('not-found')
          return
        }

        await commitResolvedBranding(found, setBranding, saveStoredBranding)
        Keyboard.dismiss()
        router.push('/(auth)/login?role=alumno')
      } catch {
        fail('network')
      } finally {
        submitting.current = false
        setLoading(false)
      }
    },
    [fail, router, setBranding],
  )

  useEffect(() => {
    if (auto !== '1' || !initialIdentifier || handledIntent.current) return
    handledIntent.current = true
    setValue(initialIdentifier)
    void submit(initialIdentifier)
  }, [auto, initialIdentifier, submit])

  /** Chip `Pegar`: el codigo casi siempre llega copiado de WhatsApp. */
  const pasteIntoField = useCallback(async () => {
    const clip = (await Clipboard.getStringAsync().catch(() => '')).trim()
    if (!clip) return
    setValue(clip)
    setErrorKind(null)
  }, [])

  /** Boton fantasma: pegar el ENLACE de invitacion y resolverlo de una. */
  const openInvitationLink = useCallback(async () => {
    const clip = (await Clipboard.getStringAsync().catch(() => '')).trim()
    if (!clip) {
      fail('format')
      return
    }
    setValue(clip)
    void submit(clip)
  }, [fail, submit])

  const errorMessage = errorCopy(errorKind)
  const canSubmit = Boolean(value.trim()) && !loading

  return (
    <View style={styles.root}>
      <LightLayer spec={ENTRY_LIGHT.code} />
      <EntryGrain />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.root}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 34) },
          ]}
        >
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
              Te lo comparte por WhatsApp, o te manda un enlace y entras directo sin escribir nada.
            </Text>
          </Reveal>

          <Reveal step={2} reduced={reduced}>
            <Animated.View style={shakeStyle}>
              <View
                style={[
                  styles.field,
                  focused ? styles.fieldFocused : styles.fieldIdle,
                  errorKind ? { borderColor: theme.destructive, borderWidth: 1.5 } : null,
                ]}
              >
                {focused && !errorKind ? <View pointerEvents="none" style={styles.fieldRing} /> : null}
                <View
                  pointerEvents="none"
                  style={[styles.fieldInset, { opacity: focused ? 1 : 0.9 }]}
                />
                <View style={styles.fieldValue}>
                  <TextInput
                    testID="coach-identifier-input"
                    value={value}
                    editable={!loading}
                    onChangeText={(next) => {
                      setValue(next)
                      if (errorKind) setErrorKind(null)
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onSubmitEditing={() => void submit(value)}
                    autoFocus={auto !== '1'}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="go"
                    enterKeyHint="go"
                    selectionColor={ENTRY_TOKENS.luxSoft}
                    accessibilityLabel="Código, slug o enlace de tu coach"
                    accessibilityHint="Escribe o pega el dato que te compartió tu coach"
                    style={styles.input}
                  />
                  {/* Placeholder dibujado: RN aplica UNA sola tipografia al TextInput y el
                      valor va en mono con tracking .13em (un codigo se lee mejor
                      monoespaciado), mientras el placeholder es Hanken. */}
                  {value.length === 0 ? (
                    <View pointerEvents="none" style={styles.placeholderSlot}>
                      <Text style={styles.placeholder}>Ej: JOSEFIT</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pegar desde el portapapeles"
                  onPress={() => void pasteIntoField()}
                  hitSlop={8}
                  style={styles.paste}
                >
                  <Text style={styles.pasteLabel}>Pegar</Text>
                </Pressable>
              </View>
            </Animated.View>

            {errorMessage ? (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[styles.helper, { color: theme.destructive }]}
              >
                {errorMessage}
              </Text>
            ) : (
              <Text style={styles.helper}>Letras y números, sin espacios.</Text>
            )}
          </Reveal>

          <Reveal step={3} reduced={reduced}>
            <CtaButton
              label={loading ? 'Buscando tu coach…' : 'Continuar'}
              disabled={!canSubmit}
              onPress={() => void submit(value)}
            />
          </Reveal>

          <Reveal step={4} reduced={reduced}>
            <View style={styles.orsep}>
              <View style={styles.orsepLine} />
              <Text style={styles.orsepLabel}>o</Text>
              <View style={styles.orsepLine} />
            </View>

            <Pressable
              testID="code-open-link"
              accessibilityRole="button"
              accessibilityLabel="Abrir mi enlace de invitación"
              accessibilityHint="Pega el enlace que te compartió tu coach"
              onPress={() => void openInvitationLink()}
              disabled={loading}
              style={styles.ghost}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.015)'] as const}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={styles.ghostInset} />
              <Link size={17} color="#CDD3DB" strokeWidth={2} />
              <Text style={styles.ghostLabel}>Abrir mi enlace de invitación</Text>
            </Pressable>

            <Text style={styles.foot}>
              ¿No tienes código?{'\n'}
              <Text style={styles.footStrong}>Pídeselo a tu coach</Text> — es el mismo que usa en su
              perfil.
            </Text>
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

/** CTA de 56 pt (§1.6): unico caso de la familia donde el `shadow*` nativo aproxima bien. */
function CtaButton({
  label,
  disabled,
  onPress,
}: {
  label: string
  disabled: boolean
  onPress: () => void
}) {
  const reduced = useReducedMotion()
  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      testID="coach-identifier-submit"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
    >
      <MotiView
        animate={{ scale: pressed && !reduced ? 0.98 : 1 }}
        transition={{ type: 'spring', damping: 18, stiffness: 220, mass: 1 }}
        // 42% de opacidad en reposo deshabilitado (§3.3).
        style={[styles.cta, disabled ? styles.ctaDisabled : null]}
      >
        <View pointerEvents="none" style={styles.ctaInset} />
        <Text style={styles.ctaLabel} numberOfLines={1}>
          {label}
        </Text>
      </MotiView>
    </Pressable>
  )
}

function errorCopy(kind: ErrorKind): string | null {
  switch (kind) {
    case 'format':
      return 'Revisa el dato. El código tiene 5 caracteres; también puedes pegar el enlace completo.'
    case 'not-found':
      return 'No encontramos ese coach. Revisa el código o pídele un enlace nuevo.'
    case 'network':
      return 'No pudimos conectarnos. Comprueba tu internet e inténtalo otra vez.'
    default:
      return null
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ENTRY_TOKENS.canvasEntry },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },

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

  field: {
    height: 62,
    borderRadius: 14,
    backgroundColor: '#1F262F',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    marginBottom: 11,
  },
  fieldIdle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },
  fieldFocused: { borderWidth: 1.5, borderColor: ENTRY_TOKENS.lux },
  // El `0 0 0 4px` del foco es un anillo dibujado, no una sombra.
  fieldRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: 'rgba(26,107,230,0.15)',
  },
  fieldInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  fieldValue: { flex: 1, minWidth: 0, justifyContent: 'center' },
  input: {
    flex: 1,
    paddingVertical: 0,
    fontFamily: FONT.monoBold,
    fontSize: 19,
    letterSpacing: 2.47,
    color: '#F4F6F8',
  },
  placeholderSlot: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  placeholder: {
    fontFamily: FONT.uiSemibold,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 1.4,
    color: ENTRY_TOKENS.textGhost,
  },
  paste: {
    borderWidth: 1,
    borderColor: 'rgba(127,176,255,0.3)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  pasteLabel: {
    fontFamily: FONT.uiExtra,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 0.735,
    textTransform: 'uppercase',
    color: ENTRY_TOKENS.luxSoft,
  },

  helper: {
    fontFamily: FONT.uiSemibold,
    fontSize: 12,
    lineHeight: 17,
    color: '#86919E',
    marginBottom: 24,
  },

  cta: {
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ENTRY_TOKENS.lux,
    shadowColor: ENTRY_TOKENS.lux,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaDisabled: { opacity: 0.42 },
  ctaInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  ctaLabel: {
    fontFamily: FONT.displayBlack,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.16,
    color: '#FFFFFF',
  },

  orsep: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  orsepLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  orsepLabel: {
    fontFamily: FONT.uiExtra,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 1.575,
    textTransform: 'uppercase',
    color: ENTRY_TOKENS.textGhost,
  },

  ghost: {
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  ghostInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  ghostLabel: { fontFamily: FONT.uiExtra, fontSize: 14, lineHeight: 18, color: '#CDD3DB' },

  foot: {
    marginTop: 'auto',
    paddingTop: 24,
    textAlign: 'center',
    fontFamily: FONT.uiSemibold,
    fontSize: 12,
    lineHeight: 18,
    color: '#86919E',
  },
  footStrong: { fontFamily: FONT.uiExtra, color: ENTRY_TOKENS.luxSoft },
})
