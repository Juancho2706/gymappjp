import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { WebView } from 'react-native-webview'
import { X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'

interface Props {
  brandName?: string
  enabled: boolean
  content: string
  type: 'text' | 'video'
  version: number
}

const STORAGE_KEY_PREFIX = 'eva_welcome_modal_v'

/** Normaliza links de YouTube/Vimeo a su URL embebible para el WebView. */
function toEmbedUrl(raw: string): string {
  const url = (raw ?? '').trim()
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?playsinline=1`
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return url
}

export function WelcomeModal({ brandName, enabled, content, type, version }: Props) {
  const { theme } = useTheme()
  const [visible, setVisible] = useState(false)
  const [dontShow, setDontShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return
    checkAndShow()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [enabled, version])

  async function checkAndShow() {
    const key = `${STORAGE_KEY_PREFIX}${version}`
    const dismissed = await AsyncStorage.getItem(key)
    if (dismissed === 'true') return
    timerRef.current = setTimeout(() => setVisible(true), 800)
  }

  async function handleClose() {
    if (dontShow) {
      const key = `${STORAGE_KEY_PREFIX}${version}`
      await AsyncStorage.setItem(key, 'true')
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <MotiView
          from={{ opacity: 0, translateY: 24, scale: 0.96 }}
          animate={{ opacity: 1, translateY: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 16 }}
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              {brandName ? (
                <Text style={[styles.brand, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                  {brandName}
                </Text>
              ) : null}
              <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
                Bienvenido/a
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}
              onPress={handleClose}
              activeOpacity={0.75}
            >
              <X size={16} color={theme.mutedForeground} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {type === 'video' ? (
            <View style={styles.videoWrap}>
              <WebView
                source={{ uri: toEmbedUrl(content) }}
                style={styles.video}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
              />
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              <Text style={[styles.content, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                {content}
              </Text>
            </ScrollView>
          )}

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setDontShow((v) => !v)}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: dontShow ? theme.primary : theme.border,
                    backgroundColor: dontShow ? theme.primary : 'transparent',
                    borderRadius: 4,
                  },
                ]}
              >
                {dontShow && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.checkLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                No mostrar de nuevo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: theme.primary, borderRadius: theme.radius.lg }]}
              onPress={handleClose}
              activeOpacity={0.8}
            >
              <Text style={[styles.confirmText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>
                Entendido
              </Text>
            </TouchableOpacity>
          </View>
        </MotiView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 12,
    gap: 12,
  },
  brand: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  title: { fontSize: 20, letterSpacing: -0.4 },
  closeBtn: { padding: 8, marginTop: 2 },
  body: { maxHeight: 280, paddingHorizontal: 20, paddingBottom: 4 },
  content: { fontSize: 14, lineHeight: 22 },
  videoWrap: { height: 200, marginHorizontal: 20, borderRadius: 12, overflow: 'hidden' },
  video: { flex: 1 },
  footer: {
    padding: 20,
    paddingTop: 16,
    gap: 16,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  checkLabel: { fontSize: 13 },
  confirmBtn: { paddingVertical: 14, alignItems: 'center' },
  confirmText: { fontSize: 15 },
})
