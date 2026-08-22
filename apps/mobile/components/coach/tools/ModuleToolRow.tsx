import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronRight, type LucideIcon } from 'lucide-react-native'
import { Badge } from '../../Badge'
import { useTheme } from '../../../context/ThemeContext'
import { hexToRgba } from '../../../lib/theme'

/**
 * Fila de módulo del hub `/coach/tools`.
 *
 * Vocabulario del DS, NO una card por módulo: es la misma anatomía que `ListRow` (hub de Opciones)
 * y que `DirRowCard` (directorio) — tile de 46, título + una línea de descripción, chip de ESTADO y
 * chevron; la fila ENTERA es el botón. Antes cada módulo era una card con círculo de marca, dos
 * chips y un botón primario a todo el ancho: tres pesos visuales compitiendo por módulo, algo que
 * no aparece en ninguna otra pantalla de la app (QA del owner 2026-08-22, «no tiene la estética del
 * resto de la app»).
 *
 * White-label: el tile se tiñe con la MARCA por `theme.primary` (`hexToRgba(..., .14)` de fondo,
 * ícono a color pleno) y el apagado con `theme.muted` (= `surface-sunken`). Nada de `bg-sport-*`
 * ni de hex sueltos: `theme.primary` ya viene contrast-clampeado por esquema
 * (`applyEffectiveCoachBranding`), así que sigue a la marca rosa/magenta del coach igual en claro
 * que en oscuro.
 */

/** Estado de la fila. `managed` = coach de team/org: lo activa su equipo, la fila no navega. */
export type ModuleToolState = 'active' | 'locked' | 'managed'

/** Tile de 46×46 (el mismo del `IconTile` del hub de Opciones), teñido con la marca. */
function ToolTile({ Icon, lit }: { Icon: LucideIcon; lit: boolean }) {
  const { theme } = useTheme()
  return (
    // renderToHardwareTextureAndroid: Skia rasteriza el borderRadius con AA (en Android los tiles
    // redondeados salen dentados, RN #50029, peor con newArch). No-op en iOS.
    <View
      renderToHardwareTextureAndroid
      style={{
        width: 46,
        height: 46,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.control,
        backgroundColor: lit ? hexToRgba(theme.primary, 0.14) : theme.muted,
      }}
    >
      <Icon size={22} strokeWidth={2} color={lit ? theme.primary : theme.mutedForeground} />
    </View>
  )
}

export function ModuleToolRow({
  icon,
  label,
  description,
  state,
  onPress,
  testID,
}: {
  icon: LucideIcon
  label: string
  /** UNA línea: la anatomía de la fila la trunca, no la envuelve. */
  description: string
  state: ModuleToolState
  onPress?: () => void
  testID?: string
}) {
  const { theme } = useTheme()
  const [pressed, setPressed] = useState(false)
  const active = state === 'active'
  // El módulo gestionado por el equipo NO navega a ningún lado: no hay nada que el coach pueda
  // hacer desde acá, así que tampoco lleva chevron (un affordance que no cumple es peor que nada).
  const interactive = state !== 'managed' && typeof onPress === 'function'

  const content = (
    <>
      <ToolTile Icon={icon} lit={active} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View className="flex-row items-center" style={{ gap: 7, minWidth: 0 }}>
          <Text
            className={active ? 'font-sans-bold text-strong' : 'font-sans-bold text-muted'}
            style={{ fontSize: 15, flexShrink: 1 }}
            numberOfLines={1}
          >
            {label}
          </Text>
          {active ? (
            <Badge tone="success" variant="soft" size="sm" dot>
              Activo
            </Badge>
          ) : (
            <Badge tone="neutral" variant="soft" size="sm">
              No incluido
            </Badge>
          )}
        </View>
        <Text
          className={active ? 'font-sans text-muted' : 'font-sans text-subtle'}
          style={{ fontSize: 12.5, lineHeight: 17 }}
          numberOfLines={1}
        >
          {description}
        </Text>
      </View>
      {interactive ? <ChevronRight size={18} strokeWidth={2.25} color={theme.ink300} /> : null}
    </>
  )

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: theme.radius.control,
    // Aspecto deshabilitado SIN `opacity`: el apagado se dice con TOKENS de tinta (tile neutro,
    // título `text-muted`, bajada `text-subtle`, chip neutral). Un `opacity` global sobre texto que
    // ya es apagado lo hunde bajo el contraste mínimo — el DS baja de escalón, no de alfa.
    backgroundColor: pressed && interactive ? theme.muted : 'transparent',
  }

  if (!interactive) {
    return (
      <View testID={testID} accessibilityLabel={`${label}. No incluido en tu plan`} style={rowStyle}>
        {content}
      </View>
    )
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${active ? 'Activo' : 'No incluido en tu plan'}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      // `style` ESTÁTICO (objeto), nunca función: css-interop descarta el prop cuando es
      // función y la fila pierde todo el estilo inline (AGENTS.md §UI nativa).
      style={rowStyle}
    >
      {content}
    </Pressable>
  )
}
