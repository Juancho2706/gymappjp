import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Apple, Dumbbell, Eye, KeyRound, Pause, Play, Share2, Smartphone, Trash2, type LucideIcon } from 'lucide-react-native'
import { FONT } from '../../../lib/typography'
import type { DirectoryClient } from '../../../lib/clients-directory'
import { DANGER, EMBER, INFO, SUCCESS, WARNING } from './directory-shared'

/**
 * ClientActionsSheet — bottom-sheet de acciones por alumno (fila del directorio),
 * espejo del `ClientActionsSheet` web. Reusa los handlers ya existentes del
 * directorio (los mismos de la ClientCard): ficha · WhatsApp · compartir · entreno ·
 * nutrición · reset · pausar/activar · eliminar. Las confirmaciones viven en los
 * handlers (Alert nativo), así que aquí solo se dispara la acción.
 */
export function ClientActionsSheet({
  visible,
  client,
  theme,
  onClose,
  onProfile,
  onWhatsApp,
  onShare,
  onWorkout,
  onNutrition,
  onReset,
  onToggle,
  onDelete,
}: {
  visible: boolean
  client: DirectoryClient
  theme: any
  onClose: () => void
  onProfile: () => void
  onWhatsApp?: () => void
  onShare: () => void
  onWorkout: () => void
  onNutrition: () => void
  onReset: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const initials = client.fullName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const actions: { key: string; icon: LucideIcon; label: string; tone: string; danger?: boolean; on: () => void }[] = [
    { key: 'profile', icon: Eye, label: 'Ver ficha completa', tone: theme.foreground, on: onProfile },
    ...(onWhatsApp ? [{ key: 'whatsapp', icon: Smartphone, label: 'Enviar WhatsApp', tone: SUCCESS, on: onWhatsApp }] : []),
    { key: 'share', icon: Share2, label: 'Compartir acceso', tone: theme.foreground, on: onShare },
    { key: 'workout', icon: Dumbbell, label: 'Programa de entreno', tone: theme.primary, on: onWorkout },
    { key: 'nutrition', icon: Apple, label: 'Nutrición', tone: EMBER, on: onNutrition },
    { key: 'reset', icon: KeyRound, label: 'Resetear contraseña', tone: INFO, on: onReset },
    { key: 'toggle', icon: client.isActive ? Pause : Play, label: client.isActive ? 'Pausar acceso' : 'Activar acceso', tone: WARNING, on: onToggle },
    { key: 'delete', icon: Trash2, label: 'Eliminar alumno', tone: DANGER, danger: true, on: onDelete },
  ]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.card }]}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />

        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: theme.foreground }]}>
            <Text style={[styles.avatarTxt, { color: theme.primary }]}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.foreground }]}>{client.fullName}</Text>
            {client.email ? (
              <Text numberOfLines={1} style={[styles.email, { color: theme.mutedForeground }]}>{client.email}</Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {actions.map((a) => {
          const Icon = a.icon
          return (
            <TouchableOpacity
              key={a.key}
              testID={`client-actions-${a.key}`}
              activeOpacity={0.75}
              style={styles.action}
              onPress={() => { onClose(); a.on() }}
            >
              <Icon size={19} color={a.danger ? DANGER : a.tone} />
              <Text style={[styles.actionLabel, { color: a.danger ? DANGER : theme.foreground }]}>{a.label}</Text>
            </TouchableOpacity>
          )
        })}
        <View style={{ height: 12 }} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingBottom: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 15, fontFamily: FONT.displayBold },
  name: { fontSize: 15.5, fontFamily: FONT.uiBold },
  email: { fontSize: 12.5, marginTop: 1, fontFamily: FONT.ui },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 12 },
  actionLabel: { fontSize: 14.5, fontFamily: FONT.uiSemibold },
})
