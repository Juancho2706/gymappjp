import { Pressable, Text, View } from 'react-native'
import { Copy, GitMerge, MoreVertical, Pencil, Trash2, Users } from 'lucide-react-native'
import { Badge, type BadgeTone } from '../../Badge'
import { DropdownMenu, type MenuAction } from '../../DropdownMenu'
import { FONT, textStyle } from '../../../lib/typography'
import { themedIcon } from './themed-icon'
import {
  dayLabel,
  firstExerciseNames,
  getProgramStats,
  initials,
  sortedPlans,
  type ProgramItem,
} from './program-model'

const IconMore = themedIcon(MoreVertical)

const T_TITLE = textStyle('md', FONT.displayBold, { ls: 'tight' })
const T_TITLE_COMPACT = textStyle('sm', FONT.displayBold, { ls: 'tight' })
const T_META = textStyle('2xs', FONT.ui, { lh: 'snug' })
const T_CLIENT = textStyle('xs', FONT.uiSemibold)
const T_AVATAR = textStyle('3xs', FONT.displayBold)
const T_DAY_LABEL = textStyle('3xs', FONT.uiBold)
const T_DAY_COUNT = textStyle('sm', FONT.displayBold)

type StatusView = { tone: BadgeTone; label: string; accent: string }

function statusView(program: ProgramItem): StatusView {
  if (!program.client_id) return { tone: 'sport', label: 'Plantilla', accent: 'bg-sport-500' }
  if (program.is_active) return { tone: 'success', label: 'Activo', accent: 'bg-success-500' }
  return { tone: 'neutral', label: 'Inactivo', accent: 'bg-ink-300' }
}

export function ProgramCard({
  program,
  compact,
  busy,
  onPreview,
  onEdit,
  onAssign,
  onDuplicate,
  onDelete,
  onSync,
}: {
  program: ProgramItem
  compact: boolean
  busy: boolean
  onPreview: () => void
  onEdit: () => void
  onAssign: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSync: () => void
}) {
  const stats = getProgramStats(program)
  const isTemplate = !program.client_id
  const status = statusView(program)
  const days = sortedPlans(program).filter((plan) => (plan.workout_blocks?.length ?? 0) > 0)
  const exercises = firstExerciseNames(program)

  const items: MenuAction[] = [
    { key: 'edit', label: 'Editar', icon: Pencil, onSelect: onEdit },
    ...(isTemplate
      ? [{ key: 'assign', label: 'Asignar a alumnos', icon: Users, onSelect: onAssign, disabled: busy }]
      : []),
    { key: 'duplicate', label: 'Duplicar como plantilla', icon: Copy, onSelect: onDuplicate, disabled: busy },
    ...(program.source_template_id
      ? [{ key: 'sync', label: 'Sincronizar con plantilla', icon: GitMerge, onSelect: onSync, disabled: busy }]
      : []),
    {
      key: 'delete',
      label: isTemplate ? 'Eliminar plantilla' : 'Eliminar programa',
      icon: Trash2,
      onSelect: onDelete,
      destructive: true,
      disabled: busy,
    },
  ]

  return (
    <Pressable
      testID={`program-card-${program.id}`}
      accessibilityRole="button"
      onPress={onPreview}
      className="mb-space-3 flex-row overflow-hidden rounded-card border border-subtle bg-surface-card active:opacity-90"
    >
      <View className={`w-[5px] ${status.accent}`} />
      <View className="flex-1 gap-space-3 p-space-4">
        <View className="flex-row items-start gap-space-3">
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-space-3">
              <Text
                numberOfLines={1}
                style={compact ? T_TITLE_COMPACT : T_TITLE}
                className="min-w-0 flex-1 text-strong"
              >
                {program.name}
              </Text>
              <Badge tone={status.tone} variant="soft" size="sm">
                {status.label}
              </Badge>
            </View>
            <Text numberOfLines={1} style={[T_META, { marginTop: 2 }]} className="text-muted">
              {stats.daysWithWork} dias · {stats.blockCount} bloques · {program.weeks_to_repeat ?? 1} sem.
              {stats.structureKind === 'cycle' ? ` · ciclo ${program.cycle_length ?? '?'}d` : ''}
            </Text>
          </View>
          <DropdownMenu
            align="end"
            trigger={
              <View
                testID={`program-actions-${program.id}`}
                className="h-9 w-9 items-center justify-center rounded-lg active:opacity-70"
              >
                <IconMore size={18} className="text-muted" />
              </View>
            }
            items={items}
          />
        </View>

        {!isTemplate && program.client?.full_name ? (
          <View className="flex-row items-center gap-space-3">
            <View className="h-7 w-7 items-center justify-center rounded-pill border border-sport-500/40 bg-sport-100 dark:bg-sport-100/20">
              <Text style={T_AVATAR} className="text-sport-700">
                {initials(program.client.full_name)}
              </Text>
            </View>
            <Text numberOfLines={1} style={T_CLIENT} className="min-w-0 flex-1 text-strong">
              {program.client.full_name}
            </Text>
          </View>
        ) : null}

        {!compact ? (
          <>
            {program.ab_mode || stats.hasPhases || program.duration_type === 'async' || program.source_template_id ? (
              <View className="flex-row flex-wrap gap-space-2">
                {program.ab_mode ? <Badge tone="sport" variant="soft" size="sm">A/B</Badge> : null}
                {stats.hasPhases ? <Badge tone="sport" variant="soft" size="sm">Fases</Badge> : null}
                {program.duration_type === 'async' ? <Badge tone="sport" variant="soft" size="sm">Flexible</Badge> : null}
                {program.source_template_id ? <Badge tone="sport" variant="soft" size="sm">Vinculado</Badge> : null}
              </View>
            ) : null}

            {days.length ? (
              <View className="flex-row gap-space-2">
                {days.slice(0, 7).map((plan) => (
                  <View
                    key={plan.id}
                    className="min-w-[42px] items-center gap-[2px] rounded-md border border-subtle bg-surface-sunken px-space-3 py-space-2"
                  >
                    <Text style={T_DAY_LABEL} className="uppercase text-primary">
                      {dayLabel(plan.day_of_week)}
                    </Text>
                    <Text style={T_DAY_COUNT} className="text-strong">
                      {plan.workout_blocks?.length ?? 0}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {exercises.length ? (
              <View className="flex-row flex-wrap gap-space-2">
                {exercises.map((name) => (
                  <Badge key={name} tone="neutral" variant="soft" size="sm">
                    {name}
                  </Badge>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </Pressable>
  )
}
