import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import type { PressableProps, ViewStyle, TextStyle } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { HapticPressable } from './HapticPressable'

type Variant = 'primary' | 'electric' | 'outline' | 'ghost' | 'destructive' | 'glass' | 'secondary'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: LucideIcon
  rightIcon?: LucideIcon
  full?: boolean
  style?: ViewStyle
}

const SIZE_MAP = {
  sm: { height: 36, paddingHorizontal: 14, fontSize: 13, iconSize: 14 },
  md: { height: 48, paddingHorizontal: 18, fontSize: 15, iconSize: 16 },
  lg: { height: 52, paddingHorizontal: 24, fontSize: 16, iconSize: 18 },
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  full,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { theme } = useTheme()
  const sz = SIZE_MAP[size]

  const containerStyle = getVariantContainer(variant, theme)
  const textColor = getVariantTextColor(variant, theme)
  const shadow = variant === 'primary' || variant === 'electric' ? theme.shadowGlowBlue : null
  const dimAlpha = disabled || loading ? 0.6 : 1

  return (
    <HapticPressable
      haptic={variant === 'destructive' ? 'medium' : 'light'}
      disabled={disabled || loading}
      style={[
        styles.base,
        {
          height: sz.height,
          paddingHorizontal: sz.paddingHorizontal,
          borderRadius: theme.radius.lg,
          opacity: dimAlpha,
          width: full ? '100%' : undefined,
        },
        containerStyle,
        shadow ?? undefined,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.inner}>
          {LeftIcon ? <LeftIcon size={sz.iconSize} color={textColor} /> : null}
          <Text
            style={[
              styles.label,
              {
                color: textColor,
                fontSize: sz.fontSize,
                fontFamily: 'Montserrat_700Bold',
              },
            ]}
          >
            {label}
          </Text>
          {RightIcon ? <RightIcon size={sz.iconSize} color={textColor} /> : null}
        </View>
      )}
    </HapticPressable>
  )
}

function getVariantContainer(variant: Variant, theme: ReturnType<typeof useTheme>['theme']): ViewStyle {
  switch (variant) {
    case 'primary':
    case 'electric':
      return { backgroundColor: theme.primary }
    case 'secondary':
      return { backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border }
    case 'outline':
      return { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border }
    case 'ghost':
      return { backgroundColor: 'transparent' }
    case 'destructive':
      return {
        backgroundColor: theme.destructive + '0D',
        borderWidth: 1,
        borderColor: theme.destructive,
      }
    case 'glass':
      return {
        backgroundColor: theme.card + 'B3',
        borderWidth: 1,
        borderColor: theme.border,
      }
  }
}

function getVariantTextColor(variant: Variant, theme: ReturnType<typeof useTheme>['theme']): string {
  switch (variant) {
    case 'primary':
    case 'electric':
      return theme.primaryForeground
    case 'destructive':
      return theme.destructive
    case 'ghost':
    case 'outline':
    case 'secondary':
    case 'glass':
      return theme.foreground
  }
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    letterSpacing: 0.3,
  } satisfies TextStyle,
})
