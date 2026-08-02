import { Image } from 'expo-image'
import { View, type StyleProp, type ViewStyle } from 'react-native'

export interface CircularBrandLogoProps {
  uri: string
  size: number
  contentFit?: 'contain' | 'cover'
  backgroundColor?: string
  padding?: number
  transition?: number
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

/**
 * Única máscara para logos de marca en RN.
 *
 * El clip vive en el contenedor Y en la imagen: Android/Fabric puede conservar
 * la capa de la imagen fuera del overflow del padre si solo se redondea el View.
 */
export function CircularBrandLogo({
  uri,
  size,
  contentFit = 'contain',
  backgroundColor = 'transparent',
  padding = 0,
  transition = 150,
  accessibilityLabel = 'Logo de la marca',
  style,
}: CircularBrandLogoProps) {
  const innerSize = Math.max(0, size - padding * 2)

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor,
        },
        style,
      ]}
    >
      <Image
        alt={accessibilityLabel}
        source={{ uri }}
        style={{ width: innerSize, height: innerSize, borderRadius: size / 2 }}
        contentFit={contentFit}
        transition={transition}
        cachePolicy="memory-disk"
      />
    </View>
  )
}
