import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Building2, ChevronDown, Dumbbell, UsersRound, type LucideIcon } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import {
  workspaceTypeLabel,
  type WorkspaceSummary,
} from '../../lib/workspaces'

/**
 * Cambiador de workspace (mobile) — espejo de WorkspaceSwitcher (web,
 * apps/web/src/components/workspace/WorkspaceSwitcher.tsx).
 *  - NO se muestra con <=1 workspace (paridad exacta con la web).
 *  - Lista los workspaces con su ícono por tipo + label + "Actual" en el activo.
 *  - Al elegir uno, persiste y notifica al padre (re-deriva el nav gating).
 */

function iconFor(type: string): LucideIcon {
  if (type === 'enterprise_coach') return Building2
  if (type === 'coach_team') return UsersRound
  return Dumbbell
}

interface Props {
  workspaces: WorkspaceSummary[]
  currentKey: string | null
  onSelect: (ws: WorkspaceSummary) => void
}

export function CoachWorkspaceSwitcher({ workspaces, currentKey, onSelect }: Props) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)

  // Espejo del guard de la web: <=1 workspace ⇒ sin switcher.
  if (workspaces.length <= 1) return null

  const current = workspaces.find((w) => w.key === currentKey) ?? workspaces[0]

  function handlePick(ws: WorkspaceSummary) {
    setOpen(false)
    if (ws.key !== current.key) onSelect(ws)
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.trigger}
        accessibilityRole="button"
        accessibilityLabel="Cambiar workspace"
        onPress={() => setOpen(true)}
      >
        <ChevronDown size={14} color={theme.mutedForeground} strokeWidth={2.2} />
        <Text numberOfLines={1} style={[styles.triggerLabel, { color: theme.mutedForeground }]}>
          {current.label}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
          <MotiView
            from={{ translateY: 500 }}
            animate={{ translateY: 0 }}
            transition={{ type: 'timing', duration: 200 }}
            style={[
              styles.sheet,
              { backgroundColor: theme.background, borderColor: theme.border, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <Text style={[styles.heading, { color: theme.mutedForeground }]}>CAMBIAR WORKSPACE</Text>
            {workspaces.map((ws) => {
              const Icon = iconFor(ws.type)
              const isCurrent = ws.key === current.key
              return (
                <TouchableOpacity
                  key={ws.key}
                  activeOpacity={0.7}
                  onPress={() => handlePick(ws)}
                  style={[
                    styles.row,
                    isCurrent ? { backgroundColor: theme.secondary, borderRadius: theme.radius.lg } : null,
                  ]}
                >
                  <Icon size={18} color={theme.mutedForeground} strokeWidth={2.1} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={[styles.rowLabel, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}
                    >
                      {ws.label}
                    </Text>
                    <Text numberOfLines={1} style={[styles.rowType, { color: theme.mutedForeground }]}>
                      {workspaceTypeLabel(ws.type)}
                    </Text>
                  </View>
                  {isCurrent ? <Text style={[styles.current, { color: theme.primary }]}>Actual</Text> : null}
                </TouchableOpacity>
              )
            })}
          </MotiView>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 130,
  },
  triggerLabel: { fontSize: 12 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  heading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 14 },
  rowType: { fontSize: 10, textTransform: 'capitalize', marginTop: 1 },
  current: { fontSize: 9, fontWeight: '700' },
})
