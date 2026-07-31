import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
import { useRouter } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { Link } from 'lucide-react-native'
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
import { useTheme } from '../../context/ThemeContext'
import {
  COACH_IDENTIFIER_HELPER,
  canSubmitCoachIdentifier,
  coachIdentifierErrorCopy,
  type CoachIdentifierErrorKind,
} from '../../lib/coach-identifier-form'
import { EASE } from '../../lib/motion'
import { ENTRY_TOKENS } from '../../lib/theme'
import { FONT } from '../../lib/typography'

/**
 * CoachIdentifierForm — el form del identificador del coach, UNA sola implementacion para
 * sus dos superficies.
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §3.3 (`sheetlg` del morph) y §3.4
 * (frame 04, la ruta `/alumno/codigo`).
 *
 * Por que compartido: desde el concepto C el alumno entra el codigo **sin cambiar de
 * pantalla** (la card morfea a sheet y el sheet ES el form). Pero la ruta
 * `/alumno/codigo` sigue viva y es obligatoria: la usan los deep links
 * (`+native-intent.ts` → `?identifier=…&auto=1`), el "cambiar de coach" del login, y las
 * pantallas de bloqueo (`suspended`, `consent`, `StudentAccessBlocked`). Dos copias de este
 * form serian dos comportamientos de auth divergiendo en silencio, asi que hay una sola.
 *
 * Lo que NO decide este componente: el canvas, la capa de luz ni el crosshatch (los monta
 * cada superficie) y tampoco su cabecera. Lo que SI es suyo, identico en ambas: parseo,
 * fetch, commit del branding, auto-submit por enlace, shake de error y la navegacion al
 * login brandeado.
 *
 * Gotchas respetados:
 *  - Anti-patron Fabric #45798: el arbol del `TextInput` NO cambia al enfocar — el foco
 *    solo mueve estilos del contenedor y de views HERMANAS (misma estructura que ya
 *    shippeaba el frame 04).
 *  - `className` + `style` funcion esta PROHIBIDO (a1 §2.1): aca no hay `className`.
 */

export type CoachIdentifierFormVariant = 'screen' | 'sheet'

export interface CoachIdentifierFormProps {
  /** `'screen'` = aire del frame 04; `'sheet'` = padding 30/22/34 de §3.3. */
  variant: CoachIdentifierFormVariant
  /** Cabecera de la superficie: navbar + titulares (frame 04) o grab + titulares (sheet). */
  header?: ReactNode
  /** `?identifier=` del deep link. */
  initialIdentifier?: string
  /** `?auto=1`: resuelve el enlace sin que el usuario toque nada. */
  auto?: boolean
  /** `autoFocus` nativo del campo. El sheet lo deja en `false`: el teclado no puede abrirse
   *  mientras corre el morph (§4.2 prohibe meter relayout en el hot path). */
  autoFocus?: boolean
  /** Enfoca el campo cuando pasa a `true`. El sheet lo activa al terminar el recorrido. */
  focusWhenReady?: boolean
  /**
   * `keyboardVerticalOffset`. El sheet debe pasar su desplazamiento vertical REAL: el
   * `KeyboardAvoidingView` mide su frame relativo al padre, asi que una caja que arranca
   * `insets.top + 67` mas abajo (§3.3) se queda corta justo por esa distancia y el CTA
   * termina bajo el teclado. Default = el del frame 04, que si arranca en el borde.
   */
  keyboardOffset?: number
  /**
   * Envuelve cada bloque (0 campo+helper · 1 CTA · 2 pie). El frame 04 lo usa para su
   * cascada C1 (pasos 2-4); el sheet entra como UN nodo (M4) y devuelve el bloque tal cual.
   */
  renderBlock?: (block: ReactNode, index: number) => ReactNode
}

export function CoachIdentifierForm({
  variant,
  header,
  initialIdentifier,
  auto = false,
  autoFocus = false,
  focusWhenReady = false,
  keyboardOffset,
  renderBlock,
}: CoachIdentifierFormProps) {
  const router = useRouter()
  const { theme, setBranding } = useTheme()
  const reduced = useReducedMotion()
  const insets = useSafeAreaInsets()
  const [value, setValue] = useState(initialIdentifier ?? '')
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const [errorKind, setErrorKind] = useState<CoachIdentifierErrorKind | null>(null)
  const handledIntent = useRef(false)
  const submitting = useRef(false)
  const inputRef = useRef<TextInput>(null)

  // C3 — error de codigo invalido: translateX ±6, 2 ciclos, 180 ms. Es el UNICO caso de
  // toda la entrada donde la haptica sube de nivel (`notificationAsync(Error)`).
  const shake = useSharedValue(0)
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))
  const fail = useCallback(
    (kind: CoachIdentifierErrorKind) => {
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
    if (!auto || !initialIdentifier || handledIntent.current) return
    handledIntent.current = true
    setValue(initialIdentifier)
    void submit(initialIdentifier)
  }, [auto, initialIdentifier, submit])

  // El sheet enfoca DESPUES del morph: `autoFocus` abriria el teclado a mitad del recorrido.
  useEffect(() => {
    if (!focusWhenReady) return
    inputRef.current?.focus()
  }, [focusWhenReady])

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

  const errorMessage = coachIdentifierErrorCopy(errorKind)
  const canSubmit = canSubmitCoachIdentifier(value, loading)
  const isSheet = variant === 'sheet'

  const blocks: ReactNode[] = [
    <Fragment key="field">
      <Animated.View style={shakeStyle}>
        <View
          style={[
            styles.field,
            focused ? styles.fieldFocused : styles.fieldIdle,
            errorKind ? { borderColor: theme.destructive, borderWidth: 1.5 } : null,
          ]}
        >
          {focused && !errorKind ? <View pointerEvents="none" style={styles.fieldRing} /> : null}
          <View pointerEvents="none" style={[styles.fieldInset, { opacity: focused ? 1 : 0.9 }]} />
          <View style={styles.fieldValue}>
            <TextInput
              ref={inputRef}
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
              autoFocus={autoFocus}
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
        <Text style={styles.helper}>{COACH_IDENTIFIER_HELPER}</Text>
      )}
    </Fragment>,

    <CtaButton
      key="cta"
      label={loading ? 'Buscando tu coach…' : 'Continuar'}
      disabled={!canSubmit}
      onPress={() => void submit(value)}
    />,

    <Fragment key="foot">
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
    </Fragment>,
  ]

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
      keyboardVerticalOffset={keyboardOffset ?? (Platform.OS === 'ios' ? 8 : 0)}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          isSheet
            ? { paddingTop: 30, paddingHorizontal: 22, paddingBottom: Math.max(insets.bottom, 34) }
            : {
                paddingTop: insets.top,
                paddingHorizontal: 24,
                paddingBottom: Math.max(insets.bottom, 34),
              },
        ]}
      >
        {header}
        {/* `Fragment` con key y no `View`: envolver los bloques en una view propia
            cambiaria el arbol que hoy shippea el frame 04 (y el `marginTop:'auto'` del
            pie depende de quien es su padre flex). */}
        {blocks.map((block, index) => (
          <Fragment key={`coach-identifier-block-${index}`}>
            {renderBlock ? renderBlock(block, index) : block}
          </Fragment>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },

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
