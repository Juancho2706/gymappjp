import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Send } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'

/**
 * Hilo bidireccional de notas coach <-> alumno — lado ALUMNO (mobile). Espejo de
 * apps/web/src/components/nutrition/NotesThread.tsx. Burbujas distinguidas por alineacion +
 * color + label de rol explicito (nunca color solo). Optimista al enviar.
 */

export interface NotesThreadComment {
  id: string
  author_role: 'client' | 'coach'
  body: string
  created_at: string
}

const ROLE_LABEL: Record<'client' | 'coach', string> = { client: 'Alumno', coach: 'Coach' }

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function tempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

interface Props {
  comments: NotesThreadComment[]
  onSubmit: (body: string) => Promise<void>
  emptyHint?: string
}

export function NotesThread({ comments, onSubmit, emptyHint }: Props) {
  const { theme } = useTheme()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // Estado optimista local (la pantalla re-fetchea y reemplaza al refrescar).
  const [optimistic, setOptimistic] = useState<NotesThreadComment[]>([])

  const all = [...comments, ...optimistic]
  const isEmpty = all.length === 0

  async function handleSubmit() {
    const body = draft.trim()
    if (!body || sending) return
    setDraft('')
    setSending(true)
    const bubble: NotesThreadComment = {
      id: tempId(),
      author_role: 'client',
      body,
      created_at: new Date().toISOString(),
    }
    setOptimistic((prev) => [...prev, bubble])
    try {
      await onSubmit(body)
    } finally {
      setSending(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.list}>
        {isEmpty ? (
          <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {emptyHint ?? 'Sin notas todavía.'}
          </Text>
        ) : (
          all.map((c) => {
            const isOwn = c.author_role === 'client'
            const isCoach = c.author_role === 'coach'
            return (
              <View key={c.id} style={[styles.bubbleWrap, isOwn ? styles.alignEnd : styles.alignStart]}>
                <View style={styles.metaRow}>
                  <Text
                    style={[
                      styles.role,
                      { color: isCoach ? theme.macro.protein : theme.mutedForeground, fontFamily: 'Inter_600SemiBold' },
                    ]}
                  >
                    {ROLE_LABEL[c.author_role]}
                  </Text>
                  <Text style={[styles.time, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {formatTime(c.created_at)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: isCoach ? theme.macro.protein + '1F' : theme.secondary,
                      borderTopLeftRadius: isOwn ? 16 : 4,
                      borderTopRightRadius: isOwn ? 4 : 16,
                    },
                  ]}
                >
                  <Text style={[styles.body, { color: theme.foreground, fontFamily: theme.fontSans }]}>{c.body}</Text>
                </View>
              </View>
            )
          })
        )}
      </View>

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Escribe una nota…"
          placeholderTextColor={theme.mutedForeground}
          multiline
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
        />
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!draft.trim() || sending}
          activeOpacity={0.8}
          style={[styles.sendBtn, { backgroundColor: theme.primary, opacity: !draft.trim() || sending ? 0.4 : 1 }]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={theme.primaryForeground} />
          ) : (
            <Send size={16} color={theme.primaryForeground} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  list: { gap: 8 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  bubbleWrap: { gap: 3, maxWidth: '85%' },
  alignEnd: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  alignStart: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  role: { fontSize: 11 },
  time: { fontSize: 11, opacity: 0.7 },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  body: { fontSize: 14, lineHeight: 19 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 110, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
