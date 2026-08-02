import { View } from 'react-native'
import { useTheme } from '../context/ThemeContext'
import { EvaFigure } from './entry/EvaFigure'
import { CircularBrandLogo } from './CircularBrandLogo'

/**
 * Círculo de marca del coach (logo o inicial). Extraído del `BrandDot` local de
 * `alumno/home/DashboardHeader.tsx` (QA-5 FIX-4) para poder reusarlo en el hero de
 * `alumno/(tabs)/perfil.tsx` sin duplicar la precedencia de logo.
 *
 * El logo sale del branding RUNTIME (`ThemeContext.branding`, ya saneado por tier en
 * `resolveEffectiveCoachBrandPresentation`: bajo Pro el logo llega en null y cae a las
 * iniciales), con la misma precedencia que el login (`login.tsx:160-161`):
 * `logoUrlDark` en dark → `logoUrl` → inicial sobre `theme.primary`. Cero hex de marca
 * hardcodeado.
 */
export function BrandLogoCircle({ size }: { size: number; brandName?: string | null }) {
  const { theme, branding, resolvedScheme } = useTheme()
  const logoUri = (resolvedScheme === 'dark' ? branding?.logoUrlDark : null) || branding?.logoUrl || null

  if (logoUri) {
    return <CircularBrandLogo uri={logoUri} size={size} contentFit="cover" backgroundColor={theme.card} style={{ borderWidth: 1, borderColor: theme.border }} />
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.card,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <EvaFigure
        size={Math.max(14, Math.round(size * 0.58))}
        style={resolvedScheme === 'light' ? { tintColor: theme.foreground } : undefined}
      />
    </View>
  )
}
