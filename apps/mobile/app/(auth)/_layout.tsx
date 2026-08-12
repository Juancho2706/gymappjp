import { Stack } from 'expo-router'
import { ForceScheme } from '../../context/ThemeContext'

/**
 * Toda la familia de auth (login, register, forgot/reset/verify) = tema OSCURO, igual que el
 * login, que es la pantalla que la gente ve primero (decision del owner 12-08).
 *
 * Antes era `ForceLightTheme`, y en un telefono con el SO en oscuro la pantalla salia ILEGIBLE:
 * el fondo lo pintaba `theme.background` (que si respetaba el claro forzado) pero los tokens de
 * las clases seguian resolviendo oscuro, asi que quedaba texto casi blanco sobre fondo casi
 * blanco y el input negro en medio. Con el esquema forzado en oscuro las dos vias coinciden.
 */
export default function AuthLayout() {
  return (
    <ForceScheme scheme="dark">
      <Stack screenOptions={{ headerShown: false }} />
    </ForceScheme>
  )
}
