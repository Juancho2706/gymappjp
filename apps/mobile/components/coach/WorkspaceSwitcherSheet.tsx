import { View } from 'react-native'
import { Building2, Check, User, Users } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Sheet } from '../Sheet'
import { ListRow } from '../ListRow'
import { useWorkspace, type WorkspaceKind, type WorkspaceRef } from '../../lib/workspace'

/**
 * WorkspaceSwitcherSheet (E7-07) — bottom-sheet DS que lista los workspaces navegables del coach
 * (`useWorkspace().workspaces`) y cambia el ACTIVO al tocar uno (`setActiveWorkspace`, persistente).
 * Espejo del switcher web (el avatar del header abre este sheet). El HEADER no es de este dominio:
 * quien lo monte controla `open`/`onClose` (ver montaje en la nota de integracion del handoff).
 *
 * Se auto-oculta (render null) cuando hay <= 1 workspace: un coach standalone sin team/org no tiene
 * nada que elegir. Sin logica de red propia: el store de `lib/workspace` resuelve/persiste todo.
 */

const KIND_META: Record<WorkspaceKind, { icon: LucideIcon; subtitle: string }> = {
  standalone: { icon: User, subtitle: 'Tu negocio personal' },
  team_owner: { icon: Users, subtitle: 'Equipo · lo gestionas' },
  team_member: { icon: Users, subtitle: 'Equipo' },
  enterprise: { icon: Building2, subtitle: 'Organización' },
}

export interface WorkspaceSwitcherSheetProps {
  open: boolean
  onClose: () => void
}

export function WorkspaceSwitcherSheet({ open, onClose }: WorkspaceSwitcherSheetProps) {
  const { theme } = useTheme()
  const { workspaces, setActiveWorkspace } = useWorkspace()

  // Oculto si no hay a donde cambiar (ruling: sin pagina dedicada, sin switcher trivial).
  if (workspaces.length <= 1) return null

  function handlePick(ws: WorkspaceRef) {
    if (!ws.isActive) setActiveWorkspace(ws.id)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cambiar de espacio"
      description="Elige el espacio de trabajo que quieres administrar."
      snapPoints={['50%', '80%']}
    >
      <View testID="workspace-switcher-sheet" style={{ gap: 8 }}>
        {workspaces.map((ws) => {
          const meta = KIND_META[ws.kind]
          const Icon = meta.icon
          return (
            <ListRow
              key={ws.id}
              testID={`workspace-option-${ws.id}`}
              accessibilityLabel={`${ws.label}${ws.isActive ? ', activo' : ''}`}
              onPress={() => handlePick(ws)}
              title={ws.label}
              subtitle={meta.subtitle}
              leading={
                <View
                  className={ws.isActive ? 'bg-sport-100' : 'bg-surface-sunken'}
                  style={{ width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon size={19} color={ws.isActive ? theme.primary : theme.mutedForeground} strokeWidth={2} />
                </View>
              }
              trailing={
                ws.isActive ? <Check size={20} color={theme.primary} strokeWidth={2.4} /> : undefined
              }
            />
          )
        })}
      </View>
    </Sheet>
  )
}
