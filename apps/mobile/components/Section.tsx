import { StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import { useTheme } from '../context/ThemeContext'

interface SectionProps {
  title: string
  children: ReactNode
}

export function Section({ title, children }: SectionProps) {
  const { theme } = useTheme()
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
      ]}
    >
      <Text style={[styles.title, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
        {title}
      </Text>
      {children}
    </View>
  )
}

interface InfoRowProps {
  label: string
  value: string
  valueColor?: string
  last?: boolean
}

export function InfoRow({ label, value, valueColor, last }: InfoRowProps) {
  const { theme } = useTheme()
  return (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}
    >
      <Text style={[styles.rowLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.rowValue,
          { color: valueColor ?? theme.foreground, fontFamily: theme.fontSans },
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, overflow: 'hidden' },
  title: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '500', textAlign: 'right', flexShrink: 1 },
})
