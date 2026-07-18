import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Check, ChevronLeft, Circle, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { Button, Input } from '../components'
import { AppBackground } from '../components/AppBackground'
import { supabase } from '../lib/supabase'
import { clearForcePasswordChange } from '../lib/api'
import { sessionFlags } from '../lib/session-flags'

export default function ChangePasswordScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reglas reactivas — espejo de la web `change-password/page.tsx`. Solo las `gates` bloquean el
  // submit (>= 8 chars + coinciden, lo que valida el server); "1 numero"/"1 mayuscula" son pistas
  // de fuerza (ayudan con la proteccion de contraseñas filtradas de Supabase) pero no bloquean.
  const rules: { label: string; ok: boolean; gates: boolean }[] = [
    { label: '8+ caracteres', ok: pwd.length >= 8, gates: true },
    { label: '1 número', ok: /\d/.test(pwd), gates: false },
    { label: '1 mayúscula', ok: /[A-Z]/.test(pwd), gates: false },
    { label: 'Coinciden', ok: pwd.length > 0 && pwd === confirm, gates: true },
  ]
  const canSubmit = rules.filter((r) => r.gates).every((r) => r.ok)

  async function save() {
    setError(null)
    if (!canSubmit) return
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password: pwd })
    if (err) { setSaving(false); setError(err.message); return }

    // E1-18: limpieza AUTORITATIVA del flag via endpoint service-role (evita el loop del gate si
    // una policy bloquea el UPDATE por PostgREST). sessionFlags es el backstop optimista local.
    sessionFlags.pwChanged = true
    try {
      await clearForcePasswordChange()
    } catch {
      // no-op: el backstop de sesion cubre esta sesion; el proximo login re-evaluara el flag real.
    }

    setSaving(false)
    router.replace('/alumno/home')
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.header}>
        <TouchableOpacity testID="change-password-back" onPress={() => router.back()} hitSlop={10} style={styles.back} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.primary} />
          <Text className="text-sport-600 font-sans-semibold" style={styles.backText}>Volver</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <View className="bg-sport-100" style={[styles.iconWrap, { borderRadius: theme.radius['2xl'] }]}>
          <ShieldCheck size={28} color={theme.primary} strokeWidth={1.75} />
        </View>
        <Text className="text-strong font-display-black" style={styles.title}>Crea tu contraseña</Text>
        <Text className="text-muted font-sans" style={styles.sub}>
          Es tu primer acceso. Por seguridad, debes crear una contraseña propia.
        </Text>

        {error ? (
          <View className="bg-danger-100 border-danger-500" style={styles.errorBox}>
            <Text className="text-danger-600 font-sans-semibold" style={{ fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.fields}>
          <Input
            testID="change-password-input"
            leftIcon={Lock}
            rightIcon={show ? EyeOff : Eye}
            onRightIconPress={() => setShow((v) => !v)}
            value={pwd}
            onChangeText={setPwd}
            placeholder="Nueva contraseña"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete="new-password"
          />
          <Input
            testID="change-password-confirm"
            leftIcon={Lock}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repetir contraseña"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete="new-password"
          />
        </View>

        {/* Chips reactivos de reglas — viran a verde a medida que se cumplen (espejo web). */}
        <View style={styles.chips}>
          {rules.map((r) => (
            <View
              key={r.label}
              className={r.ok ? 'bg-success-100' : 'bg-surface-sunken'}
              style={styles.chip}
            >
              {r.ok
                ? <Check size={12} color={theme.success} strokeWidth={3} />
                : <Circle size={12} color={theme.mutedForeground} />}
              <Text className={r.ok ? 'text-success-600 font-sans-bold' : 'text-subtle font-sans-bold'} style={styles.chipText}>
                {r.label}
              </Text>
            </View>
          ))}
        </View>

        <Button
          testID="change-password-submit"
          label={saving ? 'Guardando...' : 'Guardar nueva contraseña'}
          variant="sport"
          onPress={save}
          loading={saving}
          disabled={!canSubmit}
          full
          size="lg"
          style={{ marginTop: 4 }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 12, paddingVertical: 10 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { fontSize: 13 },
  body: { flex: 1, paddingHorizontal: 24, gap: 12, alignItems: 'stretch', justifyContent: 'center', paddingBottom: 60 },
  iconWrap: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 24, letterSpacing: -0.5, textAlign: 'center', marginTop: 6 },
  sub: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 6, maxWidth: 300, alignSelf: 'center' },
  errorBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  fields: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 10, borderRadius: 999 },
  chipText: { fontSize: 11.5 },
})
