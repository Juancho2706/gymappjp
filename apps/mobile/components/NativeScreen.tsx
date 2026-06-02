import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { ReactNode } from 'react'
import { useTheme } from '../context/ThemeContext'

interface NativeScreenProps {
  children: ReactNode
  keyboard?: boolean
}

export function NativeScreen({ children, keyboard }: NativeScreenProps) {
  const { theme } = useTheme()
  const content = (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {children}
    </SafeAreaView>
  )

  if (!keyboard) return content

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.safe}
    >
      {content}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
})
