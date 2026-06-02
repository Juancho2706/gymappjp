import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail, Sparkles } from 'lucide-react-native'
import { MotiView } from 'moti'
import { LoginSchema } from '@eva/schemas'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { Button, Input } from '../../components'
import { GlassCard } from '../../components/GlassCard'

const REMEMBER_KEY = 'eva_remember_email'

export default function LoginScreen() {
  const { role } = useLocalSearchParams<{ role: 'coach' | 'alumno' }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCoach = role !== 'alumno'

  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY).then((v) => { if (v) setEmail(v) })
  }, [])

  async function handleLogin() {
    setLoading(true)
    setError(null)
    const parsed = LoginSchema.safeParse({ email: email.trim(), password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    if (remember) await AsyncStorage.setItem(REMEMBER_KEY, email.trim())
    else await AsyncStorage.removeItem(REMEMBER_KEY)
    await AsyncStorage.setItem('eva_user_role', role ?? 'coach')
    router.replace(role === 'alumno' ? '/alumno/home' : '/coach/home')
  }

  return (
    <View className="flex-1 bg-background">
      {/* Brand wash — subtle, dark-first (no saturated disc) */}
      <LinearGradient
        colors={[theme.primary + '14', 'transparent']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 300 }}
        pointerEvents="none"
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Heading */}
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500 }}
            style={{ marginBottom: 24, gap: 8 }}
          >
            <View
              className="flex-row items-center self-start"
              style={{ gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius['3xl'], backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}
            >
              <Sparkles size={12} color={theme.primary} strokeWidth={2.25} />
              <Text style={{ fontSize: 11, letterSpacing: 0.3, color: theme.mutedForeground, fontFamily: theme.fontSans }}>
                {isCoach ? 'Panel del coach' : 'Tu entrenamiento'}
              </Text>
            </View>
            <Text style={{ fontSize: 30, letterSpacing: -0.5, color: theme.foreground, fontFamily: 'Montserrat_700Bold' }}>
              Bienvenido de vuelta
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: theme.mutedForeground, fontFamily: theme.fontSans }}>
              {isCoach ? 'Ingresá tus credenciales para acceder al panel' : 'Accedé a tu entrenamiento personalizado'}
            </Text>
          </MotiView>

          {/* Form card (glass-lite spotlight) */}
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500, delay: 120 }}
          >
            <GlassCard variant="solid" style={{ padding: 20 }}>
              <View style={{ gap: 16 }}>
                <Input
                  label="Email"
                  leftIcon={Mail}
                  placeholder="coach@ejemplo.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  editable={!loading}
                />

                <Input
                  label="Contraseña"
                  leftIcon={Lock}
                  rightIcon={showPwd ? EyeOff : Eye}
                  onRightIconPress={() => setShowPwd((s) => !s)}
                  placeholder="••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPwd}
                  autoComplete="password"
                  editable={!loading}
                  error={error}
                  trailingLabel={
                    <Text
                      onPress={() => router.push('/(auth)/forgot-password')}
                      style={{ fontSize: 12, fontWeight: '500', color: theme.primary, fontFamily: theme.fontSans }}
                    >
                      ¿Olvidaste tu contraseña?
                    </Text>
                  }
                />

                {/* Remember me */}
                <Pressable onPress={() => setRemember((r) => !r)} className="flex-row items-center" style={{ gap: 8 }}>
                  <View
                    style={{
                      width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1.5,
                      borderColor: remember ? theme.primary : theme.border,
                      backgroundColor: remember ? theme.primary : 'transparent',
                    }}
                  >
                    {remember ? <Check size={13} color={theme.primaryForeground} strokeWidth={3} /> : null}
                  </View>
                  <Text style={{ fontSize: 13, color: theme.mutedForeground, fontFamily: theme.fontSans }}>Recordarme</Text>
                </Pressable>

                <Button
                  label={isCoach ? 'Ingresar al panel' : 'Iniciar sesión'}
                  rightIcon={ArrowRight}
                  onPress={handleLogin}
                  loading={loading}
                  disabled={!email || !password}
                  full
                  size="lg"
                  style={{ marginTop: 4 }}
                />
              </View>
            </GlassCard>
          </MotiView>

          {/* Footer */}
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 600, delay: 360 }}
            style={{ marginTop: 28, alignItems: 'center', gap: 10 }}
          >
            {isCoach ? (
              <Text
                onPress={() => router.push('/(auth)/register')}
                style={{ fontSize: 13, fontWeight: '600', color: theme.primary, fontFamily: theme.fontSans }}
              >
                Crear cuenta nueva
              </Text>
            ) : null}
            <Text style={{ fontSize: 12, letterSpacing: 0.3, color: theme.mutedForeground, fontFamily: theme.fontSans }}>
              eva-app.cl
            </Text>
          </MotiView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
