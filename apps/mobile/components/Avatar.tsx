import { useEffect, useState } from 'react'
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '../context/ThemeContext'

// EVA Avatar — user image or initials fallback (ink fill, sport initials),
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
  style?: StyleProp<ViewStyle>
}

const SIZES: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 72 }
const RADIUS_SQUARE = 14 // --radius-md
const PILL = 9999

const RING_CLASS: Record<'sport' | 'success' | 'ember', string> = {
  sport: 'bg-sport-500', // brand-aware via runtime --color-sport-* vars
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

export function Avatar({ src, name = '', size = 'md', ring = false, square = false, fit = 'cover', style }: AvatarProps) {
  const { theme } = useTheme()
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
        className={showImage ? (fit === 'contain' ? 'bg-surface-card' : undefined) : 'bg-surface-inverse'}
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
            source={{ uri: src }}
            style={{ width: '100%', height: '100%' }}
            contentFit={fit}
            onError={() => setFailed(true)}
          />
        ) : (
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
