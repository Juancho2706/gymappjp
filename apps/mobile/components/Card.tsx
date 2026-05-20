import { StyleSheet, View } from 'react-native'
import type { ViewProps, ViewStyle } from 'react-native'
import { useTheme } from '../context/ThemeContext'

interface CardProps extends ViewProps {
  variant?: 'default' | 'highlighted' | 'success' | 'destructive'
  padding?: number
  radius?: 'lg' | 'xl' | '2xl'
  style?: ViewStyle
}

export function Card({
  variant = 'default',
  padding = 16,
  radius = 'xl',
  style,
  children,
  ...rest
}: CardProps) {
  const { theme } = useTheme()

  const borderColor =
    variant === 'highlighted'
      ? theme.primary
      : variant === 'success'
      ? theme.success
      : variant === 'destructive'
      ? theme.destructive
      : theme.border

  const borderWidth = variant === 'highlighted' || variant === 'success' ? 2 : 1

  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: theme.card,
          borderColor,
          borderWidth,
          borderRadius: theme.radius[radius],
          padding,
        },
        variant === 'highlighted' && theme.shadowGlowBlue,
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({})
