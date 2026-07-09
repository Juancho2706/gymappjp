import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../context/ThemeContext'

/**
 * Native "Continuar con Google" / "Registrarse con Google" button (COACH only).
 *
 * A diferencia del web (iframe GIS no estilizable) acá SÍ controlamos el chrome, así que el botón
 * respeta el DS: surface-card + border-default, logo oficial de Google (multicolor, único hex
 * permitido — es marca de un tercero). Dispara el flujo nativo vía onPress del padre.
 */
interface GoogleSignInButtonProps {
  intent: 'login' | 'register'
  onPress: () => void
  loading?: boolean
  disabled?: boolean
}

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  )
}

export function GoogleSignInButton({ intent, onPress, loading = false, disabled = false }: GoogleSignInButtonProps) {
  const { theme } = useTheme()
  const label = intent === 'register' ? 'Registrarse con Google' : 'Continuar con Google'
  const isDisabled = disabled || loading

  return (
    <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 300 }}>
      <Pressable
        testID="google-signin-button"
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          if (isDisabled) return
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
          onPress()
        }}
        disabled={isDisabled}
        className="flex-row items-center justify-center rounded-control bg-surface-card border-[1.5px] border-default"
        style={({ pressed }) => ({
          height: 52,
          gap: 10,
          opacity: isDisabled ? 0.6 : pressed ? 0.9 : 1,
        })}
      >
        {loading ? (
          <ActivityIndicator size="small" color={theme.mutedForeground} />
        ) : (
          <>
            <GoogleLogo />
            <Text className="text-strong font-sans-semibold" style={{ fontSize: 15 }}>
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </MotiView>
  )
}

/** Separador "o" entre credenciales y Google, alineado al DS. */
export function AuthDivider({ label = 'o' }: { label?: string }) {
  const { theme } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
      <Text className="text-subtle font-sans" style={{ fontSize: 12 }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
    </View>
  )
}
