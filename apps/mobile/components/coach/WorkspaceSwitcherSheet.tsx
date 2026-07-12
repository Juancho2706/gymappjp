import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Building2, Check, Dumbbell, UsersRound } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { cssInterop } from 'nativewind'
import { useTheme } from '../../context/ThemeContext'
import { Sheet } from '../Sheet'
import { useWorkspace, type WorkspaceKind, type WorkspaceRef } from '../../lib/workspace'

/**
 * WorkspaceSwitcherSheet (E7-07) — bottom-sheet DS que lista los workspaces navegables del coach
 * (`useWorkspace().workspaces`) y cambia el ACTIVO al tocar uno (`setActiveWorkspace`, persistente).
 * Espejo 1:1 del switcher web movil (`WorkspaceSwitchSheet.tsx`). El HEADER no es de este dominio:
 * quien lo monte controla `open`/`onClose` (montaje en `CoachDashboardSections.tsx`).
 *
 * Se auto-oculta (render null) cuando hay <= 1 workspace: un coach standalone sin team/org no tiene
 * nada que elegir. Sin logica de red propia: el store de `lib/workspace` resuelve/persiste todo (y
 * revalida en foreground/auth-change, asi que el sheet NO se congela — gotcha 6b cubierto por el store).
 *
 * P0 (gotcha 6a): el cambio de workspace es CRITICO (un coach org/team no opera sin el), asi que el
 * `<Sheet>` usa `nativeModal` (patron ronda 7, RN Modal) — evita la bomba containerHeight=-999 del
 * path @gorhom bajo reanimated 4 / Fabric en el primer present().
 */

// Deja que NativeWind maneje el color del Check via className (text-sport-600), 1:1 con el web
// (WorkspaceSwitchSheet.tsx:105-106). Aislado a Check; los demas usos pasan `color`, sin regresion.
cssInterop(Check, { className: { target: 'style', nativeStyleToProp: { color: true } } })

// Iconografia por tipo — espejo de `iconFor()` web (WorkspaceSwitchSheet.tsx:16-22): standalone =
// Dumbbell, team = UsersRound, enterprise = Building2. El subtitulo se mantiene LOCALIZADO (frases DS
// en latino neutro) en vez del tipo crudo web — mas legible, no cambia el gesto (spec D4).
const KIND_META: Record<WorkspaceKind, { icon: LucideIcon; subtitle: string }> = {
  standalone: { icon: Dumbbell, subtitle: 'Tu negocio personal' },
  team_owner: { icon: UsersRound, subtitle: 'Equipo · lo gestionas' },
  team_member: { icon: UsersRound, subtitle: 'Equipo' },
  enterprise: { icon: Building2, subtitle: 'Organización' },
}

export interface WorkspaceSwitcherSheetProps {
  open: boolean
  onClose: () => void
}

/**
 * Fila de workspace — espejo del `button` web (WorkspaceSwitchSheet.tsx:76-111). Sub-componente para
 * aislar el estado `pressed` por fila (haptic + tinte de press, paridad con `ListRow`). No usa
 * `ListRow` porque este necesita tinte/borde de fila ACTIVA (sport-100/sport-300) que `ListRow` no
 * expone (y es READ-ONLY de otra unidad); render custom manteniendo haptic + a11y.
 */
function WorkspaceOption({ ws, onPick }: { ws: WorkspaceRef; onPick: (ws: WorkspaceRef) => void }) {
  const { theme } = useTheme()
  const [pressed, setPressed] = useState(false)
  const meta = KIND_META[ws.kind]
  const Icon = meta.icon
  const active = ws.isActive

  // Fila activa tintada (web :84); inactiva con tinte de press (web hover:bg-surface-sunken).
  const rowBg = active ? 'bg-sport-100' : pressed ? 'bg-surface-sunken' : 'bg-surface-card'
  const rowBorder = active ? 'border-sport-300' : 'border-subtle'

  return (
    <Pressable
      testID={`workspace-option-${ws.id}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${ws.label}${active ? ', activo' : ''}`}
      onPress={() => onPick(ws)}
      onPressIn={() => {
        setPressed(true)
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }}
      onPressOut={() => setPressed(false)}
      className={`min-h-[56px] flex-row items-center gap-[14px] rounded-card border p-3 ${rowBg} ${rowBorder}`}
    >
      {/* Caja de icono: activa RELLENA color marca + icono on-sport (web :92); inactiva tenue (web :93). */}
      <View
        className={`h-[42px] w-[42px] items-center justify-center rounded-control ${active ? 'bg-sport-500' : 'bg-surface-sunken'}`}
      >
        <Icon size={20} color={active ? theme.primaryForeground : theme.mutedForeground} strokeWidth={2} />
      </View>

      <View className="flex-1" style={{ minWidth: 0 }}>
        <Text className="text-[14.5px] font-sans-bold text-strong" numberOfLines={1}>
          {ws.label}
        </Text>
        <Text className="mt-0.5 text-[11.5px] text-subtle" numberOfLines={1}>
          {meta.subtitle}
        </Text>
      </View>

      {/* Trailing activo: Check + "Actual" (web :104-107). RN es local/sincronico → sin spinner (D5). */}
      {active ? (
        <View className="shrink-0 flex-row items-center gap-1">
          <Check className="text-sport-600" size={14} strokeWidth={2.5} />
          <Text className="text-[11px] font-sans-extra text-sport-600">Actual</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export function WorkspaceSwitcherSheet({ open, onClose }: WorkspaceSwitcherSheetProps) {
  const { workspaces, setActiveWorkspace } = useWorkspace()

  // Oculto si no hay a donde cambiar (paridad con web: el avatar de 1-solo es Link, no sheet).
  if (workspaces.length <= 1) return null

  function handlePick(ws: WorkspaceRef) {
    if (!ws.isActive) setActiveWorkspace(ws.id)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="¿En qué espacio quieres trabajar?"
      description="Cada espacio separa datos, marca y permisos."
      snapPoints={['50%', '80%']}
      showCloseButton={false}
      nativeModal
    >
      <View testID="workspace-switcher-sheet" style={{ gap: 8 }}>
        {workspaces.map((ws) => (
          <WorkspaceOption key={ws.id} ws={ws} onPick={handlePick} />
        ))}
      </View>
    </Sheet>
  )
}
