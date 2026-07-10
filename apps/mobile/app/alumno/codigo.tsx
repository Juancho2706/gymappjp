import { useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Ticket } from 'lucide-react-native'
import { MotiView } from 'moti'
import { fetchBrandingByCoachIdentifier, normalizeCoachIdentifier } from '../../lib/branding'
import { ForceLightTheme, useTheme } from '../../context/ThemeContext'
import { applyCoachBranding, lightTheme } from '../../lib/theme'
import { Button } from '../../components'

const CODE_LEN = 5
// Invite codes son alfanumericos [A-Z2-9]{5} (ver lib/branding INVITE_CODE_RE).
const sanitizeCode = (raw: string) =>
  raw
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, CODE_LEN)

// Familia de entrada = SIEMPRE tema claro (#13). El wrapper neutraliza tambien
// las clases NativeWind (Button, etc.); los colores explicitos de abajo quedan
// como red de seguridad legible sobre base clara.
export default function CodigoRoute() {
  return (
    <ForceLightTheme>
      <CodigoScreen />
    </ForceLightTheme>
  )
}

function CodigoScreen() {
  const router = useRouter()
  const { branding } = useTheme()
  const theme = applyCoachBranding(lightTheme, branding?.primaryColor)

  const [code, setCode] = useState('')
  const [slug, setSlug] = useState('')
  const [showSlug, setShowSlug] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<TextInput>(null)

  async function submit(rawValue: string) {
    const identifier = normalizeCoachIdentifier(rawValue)
    if (!identifier) {
      setError('Ingresa el codigo o el enlace de tu coach')
      return
    }
    setLoading(true)
    setError(null)
    const found = await fetchBrandingByCoachIdentifier(identifier)
    if (!found) {
      setError('No encontramos ese coach. Revisa el codigo o el enlace.')
      setLoading(false)
      return
    }
    router.push('/(auth)/login?role=alumno')
  }

  function handleCodeChange(raw: string) {
    const next = sanitizeCode(raw)
    setCode(next)
    if (error) setError(null)
    if (next.length === CODE_LEN) submit(next)
  }

  const activeIndex = Math.min(code.length, CODE_LEN - 1)

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: lightTheme.background }]}>
      {/* Back chevron arriba-izquierda */}
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="code-back"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <ChevronLeft size={18} color={theme.primary} />
          <Text className="font-sans-semibold" style={[styles.backLabel, { color: theme.primary }]}>
            Volver
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500 }}
          style={styles.inner}
        >
          {/* Tile azul suave con icono Ticket */}
          <View
            style={[
              styles.heroIcon,
              { borderRadius: theme.radius['2xl'], backgroundColor: theme.primary + '1F' },
            ]}
          >
            <Ticket size={26} color={theme.primary} strokeWidth={1.75} />
          </View>

          <Text className="font-display-black" style={[styles.title, { color: lightTheme.text }]}>
            Entra con tu coach
          </Text>
          <Text className="font-sans" style={[styles.subtitle, { color: lightTheme.mutedForeground }]}>
            Ingresa el codigo de 5 digitos que te dio tu coach para abrir su app.
          </Text>

          {/* OTP: 1 TextInput OCULTO + 5 celdas visuales (patron estandar; evita el
              bug de foco de Fabric #45798 que provocan 5 inputs reales). */}
          <Pressable onPress={() => inputRef.current?.focus()} style={styles.otpRow}>
            {Array.from({ length: CODE_LEN }).map((_, i) => {
              const char = code[i] ?? ''
              const isActive = i === activeIndex && code.length < CODE_LEN
              const isFilled = char !== ''
              return (
                <View
                  key={i}
                  testID={`code-cell-${i}`}
                  style={[
                    styles.cell,
                    {
                      borderRadius: theme.radius.lg,
                      backgroundColor: lightTheme.card,
                      borderColor: error
                        ? lightTheme.destructive
                        : isActive
                          ? theme.primary
                          : isFilled
                            ? lightTheme.textSecondary
                            : lightTheme.border,
                      borderWidth: isActive ? 2 : 1.5,
                    },
                  ]}
                >
                  <Text className="font-display-black" style={[styles.cellText, { color: lightTheme.text }]}>
                    {char}
                  </Text>
                </View>
              )
            })}
          </Pressable>

          <TextInput
            testID="code-otp-input"
            ref={inputRef}
            value={code}
            onChangeText={handleCodeChange}
            // NOTA: el mockup pedia number-pad, pero los invite codes son
            // alfanumericos [A-Z2-9]{5} — number-pad impediria tipear las letras
            // y romperia el login. Usamos teclado default en mayusculas.
            keyboardType="default"
            maxLength={CODE_LEN}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            caretHidden
            style={styles.hiddenInput}
          />

          {error ? (
            <View
              style={[
                styles.errorBanner,
                { backgroundColor: lightTheme.destructive + '14', borderColor: lightTheme.destructive },
              ]}
            >
              <Text className="font-sans" style={[styles.errorText, { color: lightTheme.destructive }]}>
                {error}
              </Text>
            </View>
          ) : null}

          {loading ? (
            <Button label="Verificando" variant="sport" loading full size="lg" style={{ marginTop: 8 }} onPress={() => {}} />
          ) : null}

          {/* Slug fallback (flujo existente) */}
          {showSlug ? (
            <View style={styles.slugBlock}>
              <TextInput
                testID="code-slug-input"
                value={slug}
                onChangeText={(t) => {
                  setSlug(t.trim())
                  if (error) setError(null)
                }}
                placeholder="eva-app.cl/c/tu-coach"
                placeholderTextColor={lightTheme.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                className="font-sans"
                style={[
                  styles.slugInput,
                  { borderRadius: theme.radius.lg, backgroundColor: lightTheme.card, borderColor: lightTheme.border, color: lightTheme.text },
                ]}
              />
              <Button
                label="Continuar"
                variant="sport"
                full
                size="lg"
                onPress={() => submit(slug)}
                disabled={!normalizeCoachIdentifier(slug)}
                style={{ marginTop: 8 }}
              />
            </View>
          ) : (
            <TouchableOpacity
              testID="code-slug-link"
              onPress={() => setShowSlug(true)}
              activeOpacity={0.7}
              style={styles.slugLink}
            >
              <Text className="font-sans-semibold" style={[styles.slugLinkText, { color: theme.primary }]}>
                Tu coach usa un enlace con nombre? Usa su slug
              </Text>
            </TouchableOpacity>
          )}
        </MotiView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: { paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  backLabel: { fontSize: 13, letterSpacing: 0.3 },
  kav: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  inner: { flex: 1, justifyContent: 'center', gap: 12 },
  heroIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    alignSelf: 'center',
  },
  title: { fontSize: 28, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 8, textAlign: 'center' },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 4 },
  cell: {
    width: 54,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 26, letterSpacing: 0 },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  errorBanner: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginTop: 4 },
  errorText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  slugBlock: { marginTop: 8 },
  slugInput: { height: 52, borderWidth: 1.5, paddingHorizontal: 16, fontSize: 15 },
  slugLink: { marginTop: 16, alignItems: 'center' },
  slugLinkText: { fontSize: 13, textAlign: 'center' },
})
