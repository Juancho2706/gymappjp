import { useEffect, useState } from 'react'
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '../context/ThemeContext'
import { isOwnBrandColor } from '../lib/loader-identity'
import { EvaFigure } from './entry/EvaFigure'

// EVA Avatar — user image or initials/EVA fallback,
// with an optional colored status ring. Mirrors the web DS component 1:1.

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type AvatarRing = false | 'sport' | 'success' | 'ember'

export interface AvatarProps {
  src?: string | null
  name?: string | null
  /** DS token (xs→xl) or a raw pixel diameter (legacy). */
  size?: AvatarSize | number
  /** Colored status halo around the avatar. */
  ring?: AvatarRing
  /** Rounded-square thumbnail instead of a circle. */
  square?: boolean
  /**
   * Cómo encaja `src` en el círculo. 'cover' (default) para fotos de persona;
   * 'contain' para LOGOS de marca — no recorta y pinta un fondo neutro detrás con
   * un margen interno para que el logo respire (QA2-B2).
   */
  fit?: 'cover' | 'contain'
  /** Fallback visual para identidades de marca sin logo (EVA en vez de iniciales). */
  fallback?: 'initials' | 'eva'
  style?: StyleProp<ViewStyle>
}

const SIZES: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 72 }
const RADIUS_SQUARE = 14 // --radius-md
const PILL = 9999

/**
 * Halo de estado. `sport` = "la marca"; `success`/`ember` son semánticos y NO son white-label.
 *
 * Se quedan en TOKENS a propósito (no en `theme.primary`): `--color-sport-500` lo reescribe
 * `brandVars()` en runtime, así que el anillo ya sigue al coach — y a diferencia de
 * `theme.primary`, que es el acento clampeado por contraste y cambia entre claro y oscuro, el
 * paso 500 es el mismo tono en los dos esquemas, que es lo que un halo necesita.
 * (Hasta el fix de BRAND_VARS_IDENTITY en `context/ThemeContext.tsx` estas vars nunca llegaban
 * a aplicarse y esto salía azul EVA en cualquier marca; el token no era el problema.)
 */
const RING_CLASS: Record<'sport' | 'success' | 'ember', string> = {
  sport: 'bg-sport-500',
  success: 'bg-success-500',
  ember: 'bg-ember-500',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function Avatar({ src, name = '', size = 'md', ring = false, square = false, fit = 'cover', fallback = 'initials', style }: AvatarProps) {
  const { theme, branding, resolvedScheme } = useTheme()
  /**
   * Figura EVA como identidad de marca: MISMA regla que la pantalla de carga
   * (`LoaderFigure` en components/loaders/EvaLegacyLoader.tsx). Con marca propia la silueta se
   * tiñe con `theme.primary`; sin marca va blanca en oscuro y con la tinta del tema en claro
   * (el PNG es blanco puro: sin tinte sería invisible sobre claro). Antes en oscuro salía
   * siempre blanca, así que una cuenta rosa tenía loader rosa y avatar EVA.
   */
  const figureTint = isOwnBrandColor(branding?.primaryColor)
    ? theme.primary
    : resolvedScheme === 'light'
      ? theme.foreground
      : null
  // Si la imagen falla (URL muerta, logo borrado del bucket) el avatar NO puede quedar
  // hueco: cae a iniciales. Se resetea al cambiar de src.
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  const showImage = !!src && !failed

  const dim = typeof size === 'number' ? size : SIZES[size] ?? SIZES.md
  const initials = getInitials(name ?? '')
  const ringClass = ring ? RING_CLASS[ring] : undefined
  const hasRing = !!ringClass

  const outerRadius = square ? RADIUS_SQUARE : PILL
  const innerRadius = square ? RADIUS_SQUARE - 2 : PILL
  const fontSize = dim * 0.36

  return (
    <View
      className={ringClass}
      style={[
        {
          width: dim,
          height: dim,
          flexShrink: 0,
          padding: hasRing ? 2 : 0,
          borderRadius: outerRadius,
        },
        style,
      ]}
    >
      <View
        className={showImage ? (fit === 'contain' ? 'bg-surface-card' : undefined) : fallback === 'eva' ? 'bg-surface-card' : 'bg-surface-inverse'}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: innerRadius,
          overflow: 'hidden',
          borderWidth: hasRing ? 2 : 0,
          borderColor: theme.card, // 2px surface-card gap between ring and avatar
          padding: showImage && fit === 'contain' ? Math.round(dim * 0.11) : 0,
        }}
      >
        {showImage ? (
          <Image
            alt={name ? `Avatar de ${name}` : ''}
            source={{ uri: src }}
            style={{ width: '100%', height: '100%', borderRadius: innerRadius }}
            contentFit={fit}
            onError={() => setFailed(true)}
          />
        ) : fallback === 'eva' ? (
          <EvaFigure
            size={Math.max(16, Math.round(dim * 0.58))}
            style={figureTint ? { tintColor: figureTint } : undefined}
          />
        ) : (
          // Iniciales sobre `surface-inverse`: el paso 400 es el escalón aclarado de la rampa
          // del coach (`--color-sport-400`, reescrito por `brandVars`), así que las iniciales
          // salen en el tono de la marca y legibles sobre la tinta oscura en ambos esquemas.
          <Text
            className="font-display-bold text-sport-400"
            style={{ fontSize, letterSpacing: fontSize * -0.02 }}
            numberOfLines={1}
          >
            {initials || '?'}
          </Text>
        )}
      </View>
    </View>
  )
}
