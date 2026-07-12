import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import {
  Apple,
  Archive,
  ArchiveRestore,
  CirclePause,
  CirclePlay,
  Dumbbell,
  IdCard,
  KeyRound,
  MessageCircle,
  Share2,
  Trash2,
  UserPen,
  type LucideIcon,
} from 'lucide-react-native'
import { FONT } from '../../../lib/typography'
import type { DirectoryClient } from '../../../lib/clients-directory'
import { DANGER, EMBER, INFO, SUCCESS, WARNING } from './directory-shared'

/**
 * ClientActionsSheet — bottom-sheet de acciones por alumno (fila del directorio),
 * espejo del `ClientActionsSheet` web. Reusa los handlers ya existentes del
 * directorio (los mismos de la ClientCard): ficha · WhatsApp · editar · compartir ·
 * entreno · nutrición · reset · pausar/reactivar · archivar · eliminar. Las
 * confirmaciones viven en los handlers (Alert nativo en `clientes.tsx`), así que
 * aquí solo se dispara la acción.
 *
 * Paridad con web (`apps/web/src/app/coach/clients/ClientActionsSheet.tsx`):
 *  - Iconos 1:1: ficha `IdCard` (web :180), WhatsApp `MessageCircle` (:191),
 *    editar `UserPen` (:202), reset `KeyRound` (:211), pausar/reactivar
 *    `CirclePause`/`CirclePlay` ≡ web `PauseCircle`/`PlayCircle` (:217),
 *    archivar `Archive`/`ArchiveRestore` (:223), eliminar `Trash2` (:229).
 *  - Copy verbatim: "Reactivar acceso" / "Pausar acceso" (web :218), "Archivar
 *    alumno" / "Desarchivar" (web :224).
 *  - `onEdit`/`onArchive` son opcionales: la fila solo se muestra si el padre
 *    (DirRowCard → clientes.tsx) provee el callback (mismo patrón que `onWhatsApp`).
 *  - Acciones RN-only sin espejo web (compartir · entreno · nutrición): se
 *    PRESERVAN (regla 2), agrupadas tras WhatsApp.
 */
export function ClientActionsSheet({
  visible,
  client,
  theme,
  onClose,
  onProfile,
  onWhatsApp,
  onEdit,
  onShare,
  onWorkout,
  onNutrition,
  onReset,
  onToggle,
  onArchive,
  onDelete,
}: {
  visible: boolean
  client: DirectoryClient
  theme: any
  onClose: () => void
  onProfile: () => void
  onWhatsApp?: () => void
  onEdit?: () => void
  onShare: () => void
  onWorkout: () => void
  onNutrition: () => void
  onReset: () => void
  onToggle: () => void
  onArchive?: () => void
  onDelete: () => void
}) {
  const initials = client.fullName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const paused = !client.isActive
  const archived = client.isArchived === true

  const actions: { key: string; icon: LucideIcon; label: string; tone: string; danger?: boolean; on: () => void }[] = [
    { key: 'profile', icon: IdCard, label: 'Ver ficha completa', tone: theme.foreground, on: onProfile },
    ...(onWhatsApp ? [{ key: 'whatsapp', icon: MessageCircle, label: 'Enviar WhatsApp', tone: SUCCESS, on: onWhatsApp }] : []),
    ...(onEdit ? [{ key: 'edit', icon: UserPen, label: 'Editar datos', tone: theme.foreground, on: onEdit }] : []),
    { key: 'share', icon: Share2, label: 'Compartir acceso', tone: theme.foreground, on: onShare },
    { key: 'workout', icon: Dumbbell, label: 'Programa de entreno', tone: theme.primary, on: onWorkout },
    { key: 'nutrition', icon: Apple, label: 'Nutrición', tone: EMBER, on: onNutrition },
    { key: 'reset', icon: KeyRound, label: 'Resetear contraseña', tone: INFO, on: onReset },
    { key: 'toggle', icon: paused ? CirclePlay : CirclePause, label: paused ? 'Reactivar acceso' : 'Pausar acceso', tone: WARNING, on: onToggle },
    ...(onArchive
      ? [{ key: 'archive', icon: archived ? ArchiveRestore : Archive, label: archived ? 'Desarchivar' : 'Archivar alumno', tone: theme.foreground, on: onArchive }]
      : []),
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

        <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
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
        </ScrollView>
        <View style={{ height: 12 }} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
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
