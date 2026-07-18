import { Pressable, Text, View } from 'react-native'
import { ChevronRight, Dumbbell } from 'lucide-react-native'
import { Badge, type BadgeTone } from '../../Badge'
import { FONT, textStyle } from '../../../lib/typography'
import { themedIcon } from './themed-icon'
import { getProgramStats, type ProgramItem } from './program-model'

const IconDumbbell = themedIcon(Dumbbell)
const IconChevron = themedIcon(ChevronRight)

// Web: nombre text-[15px] font-bold · cliente text-xs · meta font-mono text-[11.5px].
const T_NAME = { fontFamily: FONT.uiBold, fontSize: 15, lineHeight: 19 }
const T_CLIENT = textStyle('xs', FONT.ui)
const T_META = { fontFamily: FONT.mono, fontSize: 11.5, lineHeight: 16 }
const T_META_STRONG = { fontFamily: FONT.monoBold, fontSize: 11.5 }

function statusBadge(program: ProgramItem): { tone: BadgeTone; label: string; dot?: boolean } {
  if (!program.client_id) return { tone: 'sport', label: 'Plantilla' }
  return program.is_active
    ? { tone: 'success', label: 'Activo', dot: true }
    : { tone: 'neutral', label: 'Inactivo' }
}

/** Progreso real del plan asignado a partir de start_date + weeks_to_repeat (1:1 web ProgramRow). */
export function assignedProgress(p: ProgramItem): { curWeek: number; weeks: number; pct: number } | null {
  const weeks = p.weeks_to_repeat || 0
  if (!p.start_date || weeks <= 0) return null
  const start = new Date(p.start_date).getTime()
  if (Number.isNaN(start)) return null
  const diffWeeks = Math.floor((Date.now() - start) / (7 * 24 * 60 * 60 * 1000))
  const curWeek = Math.min(Math.max(diffWeeks + 1, 1), weeks)
  return { curWeek, weeks, pct: Math.round((curWeek / weeks) * 100) }
}

/**
 * Fila de programa — diseño móvil minimal (1:1 web `ProgramRow`): icono + nombre +
 * StatusBadge + cliente, meta mono o barra de progreso, chevron. Tap abre la vista
 * previa (con las acciones). Sin acciones inline: la card es sólo lectura + tap.
 */
export function ProgramRow({ program, onOpen }: { program: ProgramItem; onOpen: () => void }) {
  const stats = getProgramStats(program)
  const isTemplate = !program.client_id
  const clientName = program.client?.full_name
  const progress = !isTemplate ? assignedProgress(program) : null
  const status = statusBadge(program)

  return (
    <Pressable
      testID={`program-row-${program.id}`}
      accessibilityRole="button"
      onPress={onOpen}
      className="mb-space-3 flex-row items-center gap-space-3 overflow-hidden rounded-card border border-subtle bg-surface-card px-space-3 py-space-3 active:opacity-90"
    >
      <View className="h-11 w-11 items-center justify-center rounded-md bg-sport-100 dark:bg-sport-100/20">
        <IconDumbbell size={20} className="text-sport-600" />
      </View>

      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} style={T_NAME} className="text-strong">
          {program.name}
        </Text>

        <View className="mt-1 flex-row items-center gap-space-2">
          <Badge tone={status.tone} variant="soft" size="sm" dot={status.dot}>
            {status.label}
          </Badge>
          {clientName ? (
            <Text numberOfLines={1} style={T_CLIENT} className="min-w-0 flex-1 text-muted">
              · {clientName}
            </Text>
          ) : null}
        </View>

        {progress ? (
          <View className="mt-2">
            <View className="mb-1 flex-row items-center justify-between">
              <Text style={T_META} className="text-muted">
                {stats.daysWithWork} días · {program.weeks_to_repeat} sem
              </Text>
              <Text style={T_META_STRONG} className="text-strong">
                Sem {progress.curWeek}/{progress.weeks}
              </Text>
            </View>
            <View className="h-[5px] overflow-hidden rounded-full bg-surface-sunken">
              <View
                className={`h-full rounded-full ${program.is_active ? 'bg-success-500' : 'bg-ink-300'}`}
                style={{ width: `${progress.pct}%` }}
              />
            </View>
          </View>
        ) : (
          <View className="mt-2 flex-row flex-wrap gap-space-3">
            <Text style={T_META} className="text-muted">
              <Text style={T_META_STRONG} className="text-strong">{stats.daysWithWork}</Text> días
            </Text>
            <Text style={T_META} className="text-muted">
              <Text style={T_META_STRONG} className="text-strong">{program.weeks_to_repeat}</Text> sem
            </Text>
            <Text style={T_META} className="text-muted">
              <Text style={T_META_STRONG} className="text-strong">{stats.blockCount}</Text> bloques
            </Text>
          </View>
        )}
      </View>

      <IconChevron size={18} className="text-muted" />
    </Pressable>
  )
}
