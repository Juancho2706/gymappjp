import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRight, ChevronLeft, Link2, TicketCheck } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import {
  fetchBrandingByCoachIdentifier,
  normalizeCoachIdentifier,
  saveStoredBranding,
} from '../../lib/branding'
import { commitResolvedBranding } from '../../lib/branding-transition'
import { ForceLightTheme, useTheme } from '../../context/ThemeContext'
import { Button } from '../../components'
import { AppBackground } from '../../components/AppBackground'
import { TYPE } from '../../lib/typography'

type ErrorKind = 'format' | 'not-found' | 'network' | null

export default function CodigoRoute() {
  return (
    <ForceLightTheme branded={false}>
      <CodigoScreen />
    </ForceLightTheme>
  )
}

function CodigoScreen() {
  const router = useRouter()
  const { identifier: initialIdentifier, auto } = useLocalSearchParams<{
    identifier?: string
    auto?: string
  }>()
  const { theme, setBranding } = useTheme()
  const reducedMotion = useReducedMotion()
  const [value, setValue] = useState(initialIdentifier ?? '')
  const [loading, setLoading] = useState(false)
  const [errorKind, setErrorKind] = useState<ErrorKind>(null)
  const handledIntent = useRef(false)
  const submitting = useRef(false)

  const submit = useCallback(async (rawValue: string) => {
    if (submitting.current) return

    const identifier = normalizeCoachIdentifier(rawValue)
    if (!identifier) {
      setErrorKind('format')
      return
    }

    submitting.current = true
    setLoading(true)
    setErrorKind(null)
    try {
      const found = await fetchBrandingByCoachIdentifier(identifier)
      if (!found) {
        setErrorKind('not-found')
        return
      }

      await commitResolvedBranding(found, setBranding, saveStoredBranding)
      Keyboard.dismiss()
      router.push('/(auth)/login?role=alumno')
    } catch {
      setErrorKind('network')
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }, [router, setBranding])

  useEffect(() => {
    if (auto !== '1' || !initialIdentifier || handledIntent.current) return
    handledIntent.current = true
    setValue(initialIdentifier)
    void submit(initialIdentifier)
  }, [auto, initialIdentifier, submit])

  const errorMessage = errorCopy(errorKind)
  const enter = reducedMotion ? { opacity: 1 } : { opacity: 0, translateY: 16 }

  return (
    <View className="bg-surface-app" style={styles.root}>
      <AppBackground />
      <SafeAreaView style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity
            testID="code-back"
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <ChevronLeft size={19} color={theme.primary} strokeWidth={2.25} />
            <Text className="text-primary" style={TYPE.label}>Volver</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.root}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <MotiView
              from={enter}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: reducedMotion ? 0 : 360 }}
              style={styles.panel}
            >
              <View className="bg-sport-100" style={[styles.iconTile, { borderRadius: theme.radius['2xl'] }]}>
                <TicketCheck size={29} color={theme.primary} strokeWidth={1.9} />
              </View>

              <View style={styles.intro}>
                <Text className="text-strong" style={[TYPE.h1, styles.title]}>
                  Encuentra a tu coach
                </Text>
                <Text className="text-muted" style={[TYPE.body, styles.subtitle]}>
                  Pega su código de 5 caracteres, su slug o el enlace que te compartió.
                </Text>
              </View>

              <View style={styles.form}>
                <Text className="text-strong" style={TYPE.label}>Código o enlace</Text>
                <View
                  className="bg-surface-card border border-default"
                  style={[
                    styles.inputShell,
                    {
                      borderRadius: theme.radius.xl,
                      borderColor: errorKind ? theme.destructive : theme.border,
                    },
                  ]}
                >
                  <Link2
                    size={20}
                    color={errorKind ? theme.destructive : theme.mutedForeground}
                    strokeWidth={2}
                  />
                  <TextInput
                    testID="coach-identifier-input"
                    value={value}
                    editable={!loading}
                    onChangeText={(next) => {
                      setValue(next)
                      if (errorKind) setErrorKind(null)
                    }}
                    onSubmitEditing={() => void submit(value)}
                    placeholder="Ej. A7K9P o eva-app.cl/c/ana-fit"
                    placeholderTextColor={theme.mutedForeground}
                    autoFocus={auto !== '1'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    returnKeyType="go"
                    enterKeyHint="go"
                    accessibilityLabel="Código, slug o enlace de tu coach"
                    accessibilityHint="Escribe o pega el dato que te compartió tu coach"
                    style={[styles.input, { color: theme.text }]}
                  />
                </View>

                {errorMessage ? (
                  <View
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    style={[
                      styles.errorBox,
                      {
                        borderRadius: theme.radius.lg,
                        borderColor: theme.destructive,
                        backgroundColor: `${theme.destructive}0F`,
                      },
                    ]}
                  >
                    <Text style={[TYPE.caption, { color: theme.destructive }]}>{errorMessage}</Text>
                  </View>
                ) : (
                  <Text className="text-muted" style={TYPE.caption}>
                    Aceptamos código, nombre del enlace o URL completa.
                  </Text>
                )}

                <Button
                  testID="coach-identifier-submit"
                  label={loading ? 'Buscando tu coach' : 'Continuar'}
                  variant="sport"
                  size="lg"
                  full
                  loading={loading}
                  disabled={!value.trim()}
                  rightIcon={ArrowRight}
                  onPress={() => void submit(value)}
                  style={styles.submit}
                />
              </View>
            </MotiView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
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
  root: { flex: 1 },
  topBar: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 18 },
  backButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 34,
  },
  panel: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  iconTile: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  intro: { alignItems: 'center', marginTop: 22 },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', maxWidth: 350, marginTop: 10 },
  form: { marginTop: 34 },
  inputShell: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    marginTop: 9,
  },
  input: {
    flex: 1,
    minHeight: 54,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 22,
  },
  errorBox: {
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginTop: 10,
  },
  submit: { marginTop: 22 },
})
