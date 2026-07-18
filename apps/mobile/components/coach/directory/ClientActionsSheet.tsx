import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { useRef } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
  X,
  type LucideIcon,
} from 'lucide-react-native'
import { FONT } from '../../../lib/typography'

export interface ClientActionSubject {
  id: string
  fullName: string
  email: string
  phone: string | null
  isActive: boolean
  isArchived: boolean
}

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
  includeNativeShortcuts = true,
}: {
  visible: boolean
  client: ClientActionSubject
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
  /** Directory keeps RN shortcuts; profile uses the exact web action set. */
  includeNativeShortcuts?: boolean
}) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const initials = client.fullName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const paused = !client.isActive
  const archived = client.isArchived === true
  const pendingActionRef = useRef<(() => void) | null>(null)
  const runPendingAction = () => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    action?.()
  }

  const actions: { key: string; icon: LucideIcon; label: string; toneClass: string; danger?: boolean; on: () => void }[] = [
    { key: 'profile', icon: IdCard, label: 'Ver ficha completa', toneClass: 'text-strong', on: onProfile },
    ...(onWhatsApp ? [{ key: 'whatsapp', icon: MessageCircle, label: 'Enviar WhatsApp', toneClass: 'text-success-600', on: onWhatsApp }] : []),
    ...(onEdit ? [{ key: 'edit', icon: UserPen, label: 'Editar datos', toneClass: 'text-strong', on: onEdit }] : []),
    ...(includeNativeShortcuts ? [
      { key: 'share', icon: Share2, label: 'Compartir acceso', toneClass: 'text-strong', on: onShare },
      { key: 'workout', icon: Dumbbell, label: 'Programa de entreno', toneClass: 'text-sport-600', on: onWorkout },
      { key: 'nutrition', icon: Apple, label: 'Nutrición', toneClass: 'text-ember-600', on: onNutrition },
    ] : []),
    { key: 'reset', icon: KeyRound, label: 'Resetear contraseña', toneClass: 'text-info-600', on: onReset },
    { key: 'toggle', icon: paused ? CirclePlay : CirclePause, label: paused ? 'Reactivar acceso' : 'Pausar acceso', toneClass: 'text-warning-600', on: onToggle },
    ...(onArchive
      ? [{ key: 'archive', icon: archived ? ArchiveRestore : Archive, label: archived ? 'Desarchivar' : 'Archivar alumno', toneClass: 'text-ink-600', on: onArchive }]
      : []),
    { key: 'delete', icon: Trash2, label: 'Eliminar alumno', toneClass: 'text-danger-600', danger: true, on: onDelete },
  ]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={runPendingAction}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View
        accessibilityViewIsModal
        accessibilityLabel={`Acciones de ${client.fullName}`}
        style={[styles.sheet, { backgroundColor: theme.card, maxHeight: Math.min(height * 0.88, 620), paddingBottom: 24 + insets.bottom }]}
      >
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar acciones" onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.muted, borderColor: theme.border }]}>
          <X size={16} className="text-strong" />
        </TouchableOpacity>

        <View style={styles.header}>
          <View className="bg-ink-900" style={styles.avatar}>
            <Text className="text-sport-400" style={styles.avatarTxt}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.foreground }]}>{client.fullName}</Text>
            {client.email ? (
              <Text numberOfLines={1} style={[styles.email, { color: theme.mutedForeground }]}>{client.email}</Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <ScrollView style={styles.actionsScroll} showsVerticalScrollIndicator={false}>
          {actions.map((a) => {
            const Icon = a.icon
            return (
              <TouchableOpacity
                key={a.key}
                testID={`client-actions-${a.key}`}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                activeOpacity={0.75}
                style={styles.action}
                onPress={() => {
                  pendingActionRef.current = a.on
                  onClose()
                  if (Platform.OS !== 'ios') setTimeout(runPendingAction, 250)
                }}
              >
                <Icon size={19} className={a.toneClass} />
                <Text className={a.danger ? 'text-danger-600' : 'text-strong'} style={styles.actionLabel}>{a.label}</Text>
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
  closeBtn: { position: 'absolute', right: 16, top: 12, zIndex: 2, width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingBottom: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 15, fontFamily: FONT.displayBold },
  name: { fontSize: 15.5, fontFamily: FONT.uiBold },
  email: { fontSize: 12.5, marginTop: 1, fontFamily: FONT.ui },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 4 },
  actionsScroll: { flexShrink: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 12 },
  actionLabel: { fontSize: 14.5, fontFamily: FONT.uiSemibold },
})
