import { useCallback, useEffect, useState } from 'react'
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Bell, Newspaper, Pin, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { supabase } from '../../lib/supabase'
import {
  getPublishedNewsItems,
  getUnreadNewsCount,
  markAllNewsAsRead,
  type NewsItem,
} from '../../lib/news'

// Espejo de TYPE_ICON / TYPE_LABEL (apps/web/src/components/coach/NewsBellButton.tsx).
const TYPE_ICON: Record<string, string> = {
  feature: '🟢',
  improvement: '🔧',
  fix: '🐛',
  announcement: '📢',
}
const TYPE_LABEL: Record<string, string> = {
  feature: 'Nueva función',
  improvement: 'Mejora',
  fix: 'Corrección',
  announcement: 'Anuncio',
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Espejo de relativeDate (web).
function relativeDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays} días`
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

// ── Markdown ligero (espejo de inlineMd / MarkdownContent, sin deps) ──────────
function InlineMd({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  if (parts.length === 1) return <Text style={{ color }}>{text}</Text>
  return (
    <Text style={{ color }}>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <Text key={i} style={{ fontWeight: '700' }}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </Text>
  )
}

function MarkdownContent({ text }: { text: string }) {
  const { theme } = useTheme()
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let bullets: string[] = []
  let k = 0
  const flush = () => {
    if (!bullets.length) return
    const captured = bullets
    nodes.push(
      <View key={`ul-${k++}`} style={styles.mdList}>
        {captured.map((b, i) => (
          <View key={i} style={styles.mdBulletRow}>
            <Text style={[styles.mdBulletDot, { color: theme.mutedForeground }]}>•</Text>
            <View style={{ flex: 1 }}>
              <InlineMd text={b} color={theme.mutedForeground} />
            </View>
          </View>
        ))}
      </View>,
    )
    bullets = []
  }
  for (const line of lines) {
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2))
    } else {
      flush()
      if (line.startsWith('## ')) {
        nodes.push(
          <Text key={k++} style={[styles.mdH2, { color: theme.foreground }]}>
            {line.slice(3)}
          </Text>,
        )
      } else if (line.startsWith('### ')) {
        nodes.push(
          <Text key={k++} style={[styles.mdH3, { color: theme.foreground }]}>
            {line.slice(4).toUpperCase()}
          </Text>,
        )
      } else if (line === '---') {
        nodes.push(<View key={k++} style={[styles.mdHr, { backgroundColor: theme.border }]} />)
      } else if (line.trim() === '') {
        nodes.push(<View key={k++} style={{ height: 4 }} />)
      } else {
        nodes.push(
          <View key={k++} style={{ marginVertical: 1 }}>
            <InlineMd text={line} color={theme.mutedForeground} />
          </View>,
        )
      }
    }
  }
  flush()
  return <View style={{ gap: 1 }}>{nodes}</View>
}

function NewsFeedList({ items, onNavigate }: { items: NewsItem[]; onNavigate: () => void }) {
  const { theme } = useTheme()
  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Newspaper size={40} color={hexToRgba(theme.mutedForeground, 0.4)} strokeWidth={1.6} />
        <Text style={[styles.emptyText, { color: theme.mutedForeground }]}>No hay novedades por ahora.</Text>
      </View>
    )
  }
  return (
    <View style={{ gap: 12 }}>
      {items.map((item) => (
        <View
          key={item.id}
          style={[
            styles.newsCard,
            {
              borderColor: item.is_pinned ? hexToRgba(theme.primary, 0.2) : theme.border,
              backgroundColor: item.is_pinned ? hexToRgba(theme.primary, 0.04) : theme.card,
              borderRadius: theme.radius.xl,
            },
          ]}
        >
          {item.is_pinned ? (
            <View style={styles.pinCorner}>
              <Pin size={14} color={theme.primary} />
            </View>
          ) : null}
          <View style={styles.newsMetaRow}>
            <Text style={styles.newsTypeIcon}>{TYPE_ICON[item.type] || '•'}</Text>
            <Text style={[styles.newsTypeLabel, { color: theme.mutedForeground }]}>
              {(TYPE_LABEL[item.type] || item.type).toUpperCase()}
            </Text>
            <Text style={[styles.newsDate, { color: theme.mutedForeground }]}>{relativeDate(item.published_at)}</Text>
          </View>
          <Text style={[styles.newsTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            {item.title}
          </Text>
          <MarkdownContent text={item.content} />
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={[styles.newsImage, { borderRadius: theme.radius.lg }]}
              contentFit="cover"
              transition={150}
            />
          ) : null}
          {item.cta_url ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Linking.openURL(item.cta_url!).catch(() => {})
                onNavigate()
              }}
            >
              <Text style={[styles.newsCta, { color: theme.primary }]}>{(item.cta_label || 'Ver más') + ' →'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  )
}

/**
 * Campana de novedades del coach (header). Espejo de NewsBellButton (web):
 *  - badge con conteo no leído (9+ tope)
 *  - al abrir el sheet ⇒ markAllAsRead (optimista: badge → 0)
 *  - bottom sheet con el feed (markdown ligero, pinned primero)
 *  - refresca el conteo al volver a foreground (web: visibilitychange → mobile: AppState)
 */
export function NewsBell() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [items, setItems] = useState<NewsItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [coachId, setCoachId] = useState<string | null>(null)

  const refreshCount = useCallback(async (id: string | null) => {
    if (!id) return
    const c = await getUnreadNewsCount(id)
    setUnread(c)
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const id = auth.user?.id ?? null
      if (!mounted) return
      setCoachId(id)
      const [list] = await Promise.all([getPublishedNewsItems().then((l) => (mounted ? setItems(l) : null))])
      void list
      await refreshCount(id)
    })().catch(() => {})
    return () => {
      mounted = false
    }
  }, [refreshCount])

  const handleOpen = useCallback(async () => {
    setOpen(true)
    if (unread === 0) return
    const prev = unread
    setUnread(0)
    const res = await markAllNewsAsRead()
    if (!res.success) setUnread(prev)
  }, [unread])

  const badge = unread > 9 ? '9+' : unread > 0 ? String(unread) : null

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.75}
        style={styles.bellButton}
        accessibilityRole="button"
        accessibilityLabel="Novedades"
        onPress={handleOpen}
      >
        <Bell size={20} color={theme.mutedForeground} strokeWidth={2.2} />
        {badge ? (
          <View style={[styles.badge, { backgroundColor: theme.destructive }]}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
          <MotiView
            from={{ translateY: 600 }}
            animate={{ translateY: 0 }}
            transition={{ type: 'timing', duration: 220 }}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                Novedades
              </Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                accessibilityLabel="Cerrar"
                style={styles.sheetClose}
                activeOpacity={0.7}
              >
                <X size={20} color={theme.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
              <NewsFeedList items={items} onNavigate={() => setOpen(false)} />
            </ScrollView>
          </MotiView>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  bellButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 20, letterSpacing: -0.3 },
  sheetClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  sheetScroll: { paddingBottom: 8 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14 },
  newsCard: { borderWidth: 1, padding: 16 },
  pinCorner: { position: 'absolute', top: 8, right: 8 },
  newsMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  newsTypeIcon: { fontSize: 12 },
  newsTypeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  newsDate: { fontSize: 10, marginLeft: 'auto' },
  newsTitle: { fontSize: 14, lineHeight: 19, marginBottom: 4 },
  newsImage: { width: '100%', height: 160, marginTop: 8 },
  newsCta: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  mdList: { marginVertical: 4, marginLeft: 8, gap: 2 },
  mdBulletRow: { flexDirection: 'row', gap: 6 },
  mdBulletDot: { fontSize: 12, lineHeight: 18 },
  mdH2: { fontSize: 14, fontWeight: '700', marginTop: 12, marginBottom: 4 },
  mdH3: { fontSize: 11, fontWeight: '700', marginTop: 8, marginBottom: 2, letterSpacing: 0.5 },
  mdHr: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
})
