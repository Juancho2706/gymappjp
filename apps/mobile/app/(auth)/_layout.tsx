import { Stack } from 'expo-router'
import { ForceLightTheme } from '../../context/ThemeContext'

// Toda la familia de auth (login, register, forgot/reset/verify) = SIEMPRE tema
// claro (ruling CEO ronda 4, #13). ForceLightTheme scopea el claro al subarbol
// sin tocar el colorScheme global (el resto de la app sigue dark-aware).
export default function AuthLayout() {
  return (
    <ForceLightTheme>
      <Stack screenOptions={{ headerShown: false }} />
    </ForceLightTheme>
  )
}
