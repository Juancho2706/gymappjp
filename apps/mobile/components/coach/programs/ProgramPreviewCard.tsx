import { ScrollView, Text, View } from 'react-native'
import { CalendarDays, Copy, Dumbbell, GitMerge, Layers3, Pencil, Trash2, Users } from 'lucide-react-native'
import { Button } from '../../Button'
import { FONT, textStyle } from '../../../lib/typography'
import { themedIcon, type ThemedIcon } from './themed-icon'
import { getProgramStats, sortedBlocks, sortedPlans, dayLabel, type ProgramItem } from './program-model'

// Fallback de color de fase cuando la fila no trae color: sport-500 base del DS
// (literal seguro; el color por-fase real viene de datos e inyecta inline).
const SPORT_500 = '#2680FF'

const T_SECTION = textStyle('3xs', FONT.display, { ls: 'wide' })
const T_METRIC_VALUE = textStyle('lg', FONT.displayBold)
const T_METRIC_LABEL = textStyle('3xs', FONT.uiMedium)
const T_DAY_TITLE = textStyle('sm', FONT.displayBold)
const T_DAY_INDEX = textStyle('3xs', FONT.displayBold)
const T_BLOCK_NAME = textStyle('xs', FONT.uiSemibold)
const T_META = textStyle('2xs', FONT.ui, { lh: 'snug' })
const T_DOSE = textStyle('2xs', FONT.monoBold)

export function ProgramPreviewCard({
  program,
  onEdit,
  onAssign,
  onDuplicate,
  onSync,
  onDelete,
  busy,
}: {
  program: ProgramItem
  onEdit: () => void
  onAssign: () => void
  onDuplicate: () => void
  onSync?: () => void
  onDelete?: () => void
  busy?: boolean
}) {
  const plans = sortedPlans(program)
  const stats = getProgramStats(program)
  const phases = program.program_phases ?? []

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
      <View className="flex-row gap-space-3">
        <PreviewMetric icon={themedIcon(CalendarDays)} label="Dias" value={stats.daysWithWork} />
        <PreviewMetric icon={themedIcon(Dumbbell)} label="Bloques" value={stats.blockCount} />
        <PreviewMetric icon={themedIcon(Layers3)} label="Semanas" value={program.weeks_to_repeat ?? 1} />
      </View>

      {phases.length ? (
        <View className="gap-space-3">
          <Text style={T_SECTION} className="uppercase text-muted">
            FASES
          </Text>
          <View className="h-[9px] flex-row overflow-hidden rounded-pill">
            {phases.map((phase, i) => (
              <View key={`${phase.name}-${i}`} style={{ flex: Math.max(1, phase.weeks ?? 1), backgroundColor: phase.color || SPORT_500 }} />
            ))}
          </View>
          <View className="flex-row flex-wrap gap-space-2">
            {phases.map((phase, i) => (
              <View key={`c-${phase.name}-${i}`} className="rounded-sm border border-subtle bg-surface-sunken px-space-3 py-[3px]">
                <Text style={T_META} className="text-muted">
                  {phase.name} · {phase.weeks} sem.
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-space-4">
        <Text style={T_SECTION} className="uppercase text-muted">
          ESTRUCTURA
        </Text>
        {plans.length ? (
          plans.map((plan) => {
            const blocks = sortedBlocks(plan)
            const shown = blocks.slice(0, 8)
            return (
              <View key={plan.id} className="gap-space-3 rounded-lg border border-subtle bg-surface-sunken p-space-4">
                <View className="flex-row items-center gap-space-3">
                  <View className="h-[34px] min-w-[34px] items-center justify-center rounded-lg bg-sport-500 px-space-2">
                    <Text style={T_DAY_INDEX} className="text-on-sport">
                      {dayLabel(plan.day_of_week)}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} style={T_DAY_TITLE} className="text-strong">
                      {plan.title}
                    </Text>
                    <Text style={T_META} className="text-muted">
                      {blocks.length} ejercicios
                    </Text>
                  </View>
                </View>
                {shown.map((block, i) => (
                  <View
                    key={block.id}
                    className={`flex-row items-center gap-space-3 py-space-3 ${i < shown.length - 1 ? 'border-b border-subtle' : ''}`}
                  >
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} style={T_BLOCK_NAME} className="text-strong">
                        {block.exercise?.name ?? 'Ejercicio'}
                      </Text>
                      <Text numberOfLines={1} style={T_META} className="text-muted">
                        {[block.tempo && `Tempo ${block.tempo}`, block.rir && `${block.rir} RIR`, block.rest_time && `Desc. ${block.rest_time}`]
                          .filter(Boolean)
                          .join(' · ') || 'Bloque principal'}
                      </Text>
                    </View>
                    <Text style={T_DOSE} className="text-primary">
                      {block.sets}x{block.reps}
                    </Text>
                  </View>
                ))}
              </View>
            )
          })
        ) : (
          <Text style={T_META} className="text-muted">
            Este programa aun no tiene dias configurados.
          </Text>
        )}
      </View>

      <View className="gap-space-3 pt-space-1">
        <Button label="Editar" variant="sport" leftIcon={Pencil} onPress={onEdit} full />
        {!program.client_id ? (
          <Button label="Asignar plantilla" variant="outline" leftIcon={Users} onPress={onAssign} full />
        ) : null}
        <Button label="Duplicar como plantilla" variant="outline" leftIcon={Copy} onPress={onDuplicate} disabled={busy} full />
        {onSync && program.source_template_id ? (
          <Button label="Sincronizar con plantilla" variant="outline" leftIcon={GitMerge} onPress={onSync} disabled={busy} full />
        ) : null}
        {onDelete ? (
          <Button label={program.client_id ? 'Eliminar programa' : 'Eliminar plantilla'} variant="destructive" leftIcon={Trash2} onPress={onDelete} disabled={busy} full />
        ) : null}
      </View>
    </ScrollView>
  )
}

function PreviewMetric({ icon: Icon, label, value }: { icon: ThemedIcon; label: string; value: number }) {
  return (
    <View className="flex-1 gap-[3px] rounded-lg border border-subtle bg-surface-sunken p-space-3">
      <Icon size={15} className="text-primary" />
      <Text style={T_METRIC_VALUE} className="text-strong">
        {value}
      </Text>
      <Text style={T_METRIC_LABEL} className="uppercase text-muted">
        {label}
      </Text>
    </View>
  )
}
