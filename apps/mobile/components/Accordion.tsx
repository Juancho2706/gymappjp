import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { ChevronDown } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

interface Props {
  question: string
  answer: string
  defaultOpen?: boolean
}

/** P1: item de accordion reutilizable (chevron animado + fade del cuerpo). */
export function Accordion({ question, answer, defaultOpen = false }: Props) {
  const { theme } = useTheme()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <View style={[styles.card, { borderColor: open ? theme.primary + '55' : theme.border, backgroundColor: open ? theme.secondary : theme.card }]}>
      <TouchableOpacity activeOpacity={0.75} onPress={() => setOpen((v) => !v)} style={styles.header}>
        <Text style={[styles.q, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>{question}</Text>
        <MotiView animate={{ rotate: open ? '180deg' : '0deg' }} transition={{ type: 'timing', duration: 200 }}>
          <ChevronDown size={18} color={open ? theme.primary : theme.mutedForeground} />
        </MotiView>
      </TouchableOpacity>
      {open ? (
        <MotiView from={{ opacity: 0, translateY: -4 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 220 }}>
          <Text style={[styles.a, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{answer}</Text>
        </MotiView>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 13 },
  q: { fontSize: 13.5, flex: 1, lineHeight: 19 },
  a: { fontSize: 13, lineHeight: 20, paddingBottom: 14, paddingTop: 2 },
})
