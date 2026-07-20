import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Send } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT, TYPE } from '../../../lib/typography'
import { ApiError } from '../../../lib/api'
import { InfoTooltip } from '../../InfoTooltip'
import { toast } from '../../Toast'
import {
  getNutritionNotes,
  postNutritionNote,
  type NutritionNoteComment,
} from '../../../lib/nutrition-notes.api'

/**
 * NotesThread (E4-12) — hilo bidireccional coach⇄alumno de nutrición, POR DÍA,
 * espejo del web `components/nutrition/NotesThread` montado en `NutritionShell`
 * ("Notas del día", `currentRole="client"`, scope `logDate = selectedDate`).
 *
 * Presentación + optimismo local (RN no usa `useOptimistic`): al enviar se
 * agrega una burbuja temporal, se reemplaza por la fila real al resolver y se
 * revierte + `toast.error` + se restaura el borrador si el POST falla. Refresca
 * el hilo al foco de la pantalla y cuando cambia el día (`useFocusEffect` con
 * `logDate` como dep = "pull de nuevos al foco"). El gate y el `author_id` son
 * server-side (bearer); acá jamás se envía identidad.
 *
 * Distinción de autor por alineación + color + etiqueta explícita (nunca color
 * solo): coach = izquierda / azul-proteína, alumno = derecha / superficie muted.
 */

// Mirror del token web `--color-macro-protein` (light / dark). Acento de la
// burbuja del coach — TOKENS.md, NO white-label.
const COACH_ACCENT = { light: '#5E9FD6', dark: '#7FB3E0' } as const

const ROLE_LABEL: Record<'client' | 'coach', string> = {
  client: 'Alumno',
  coach: 'Coach',
}

/** Hora corta y locale-estable (mismo formato que la web es-CL). */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface NotesThreadProps {
  /** Día del hilo (YYYY-MM-DD) — normalmente `selectedDate` del shell. */
  logDate: string
  /** Se desmonta/no fetchea si el shell aún no tiene datos. Default true. */
  enabled?: boolean
}

export function NotesThread({ logDate, enabled = true }: NotesThreadProps) {
  const { theme, resolvedScheme } = useTheme()
  const coachAccent = COACH_ACCENT[resolvedScheme]

  const [comments, setComments] = useState<NutritionNoteComment[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  // Pull al foco + al cambiar de día (dep = logDate). Errores de carga silenciosos
  // (offline / sin sesión no deben spamear toasts).
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return
      let alive = true
      getNutritionNotes(logDate)
        .then((res) => {
          if (alive) setComments(res.comments ?? [])
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setLoading(false)
        })
      return () => {
        alive = false
      }
    }, [enabled, logDate]),
  )

  async function handleSend() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const tempId = `temp-${Date.now()}`
    const optimistic: NutritionNoteComment = {
      id: tempId,
      author_role: 'client',
      body,
      created_at: new Date().toISOString(),
    }
    setComments((prev) => [...prev, optimistic])
    setDraft('')
    try {
      const { comment } = await postNutritionNote({ logDate, body })
      setComments((prev) => prev.map((c) => (c.id === tempId ? comment : c)))
    } catch (e) {
      setComments((prev) => prev.filter((c) => c.id !== tempId))
      setDraft(body)
      toast.error(e instanceof ApiError ? e.message : 'No se pudo enviar la nota.')
    } finally {
      setSending(false)
    }
  }

  const canSend = draft.trim().length > 0 && !sending
  const isEmpty = comments.length === 0

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] },
      ]}
      testID="notes-thread"
    >
      <View style={styles.header}>
        <Text style={[TYPE.label, { color: theme.foreground }]}>Notas del día</Text>
        <InfoTooltip content="Deja una nota para tu coach sobre tu nutrición de hoy. Tu coach también puede responderte aquí." />
      </View>

      {loading && isEmpty ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.mutedForeground} />
        </View>
      ) : isEmpty ? (
        <Text
          style={[TYPE.caption, styles.emptyHint, { color: theme.mutedForeground }]}
          testID="notes-thread-empty"
        >
          Escribe una nota a tu coach sobre tu día (antojos, cómo te sentiste, dudas).
        </Text>
      ) : (
        <View style={styles.list} accessibilityRole="summary" accessibilityLabel="Conversación de retroalimentación">
          {comments.map((c) => {
            const isCoach = c.author_role === 'coach'
            const isOwn = !isCoach
            return (
              <View
                key={c.id}
                style={[styles.bubbleRow, { alignItems: isOwn ? 'flex-end' : 'flex-start' }]}
                testID="notes-thread-bubble"
              >
                <View style={styles.metaRow}>
                  <Text
                    style={{
                      fontFamily: FONT.uiBold,
                      fontSize: 11,
                      color: isCoach ? coachAccent : theme.mutedForeground,
                    }}
                  >
                    {ROLE_LABEL[c.author_role]}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FONT.ui,
                      fontSize: 11,
                      color: theme.mutedForeground,
                      fontVariant: ['tabular-nums'],
                      opacity: 0.7,
                    }}
                  >
                    {formatTime(c.created_at)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.bubble,
                    isCoach
                      ? { backgroundColor: coachAccent + '1F', borderTopLeftRadius: 4 }
                      : { backgroundColor: theme.muted, borderTopRightRadius: 4 },
                  ]}
                >
                  <Text style={[TYPE.body, { color: theme.foreground, fontSize: 14 }]}>{c.body}</Text>
                </View>
              </View>
            )
          })}
        </View>
      )}

      <View style={styles.composeRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder="Escribe una nota…"
          placeholderTextColor={theme.mutedForeground}
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
              color: theme.foreground,
              fontFamily: FONT.ui,
            },
          ]}
          testID="notes-thread-input"
          accessibilityLabel="Escribir una nota"
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          hitSlop={8}
          style={[styles.sendBtn, { backgroundColor: theme.primary, opacity: canSend ? 1 : 0.4 }]}
          testID="notes-thread-send"
          accessibilityRole="button"
          accessibilityLabel="Enviar nota"
        >
          {sending ? (
            <ActivityIndicator size="small" color={theme.primaryForeground} />
          ) : (
            <Send size={16} color={theme.primaryForeground} strokeWidth={2.25} />
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loadingBox: { paddingVertical: 20, alignItems: 'center' },
  emptyHint: { paddingVertical: 16, textAlign: 'center' },
  list: { gap: 10 },
  bubbleRow: { gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  composeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
