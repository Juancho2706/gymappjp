import { useMemo, useState, type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import {
  ChevronRight,
  ClipboardX,
  Clock,
  Dumbbell,
  Gauge,
  Pencil,
  PlayCircle,
  Plus,
  Target,
  Timer,
  Weight,
} from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { groupContiguousSupersetRuns } from '@eva/workout-engine'
import { useTheme } from '../../../context/ThemeContext'
import { Button, Sheet } from '../../../components'
import {
  effectiveWeekVariantFromPlans,
  filterPlansForStructureView,
  resolveActiveWeekVariantForDisplay,
} from '../../../lib/program-week-variant'
import type { CoachClientDetailData, ProgramBlock, ProgramDay } from '../../../lib/coach-client-detail'
import { getTodayInSantiago } from '../../../lib/date-utils'
import { FONT } from '../../../lib/typography'

const DAY_LABELS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const PHASE_CLASSES = ['bg-sport-500', 'bg-ember-500', 'bg-aqua-500', 'bg-success-500', 'bg-warning-500'] as const
const MUSCLE_DOT_CLASSES = PHASE_CLASSES

type Program = NonNullable<CoachClientDetailData['activeProgram']>
type Phase = Program['program_phases'][number]

function signedCalendarDays(fromYmd: string, toYmd: string): number | null {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10))
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN
  }
  const from = parse(fromYmd)
  const to = parse(toYmd)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.round((to - from) / 86_400_000)
}

function resolveProgramMeta(program: Program | null, todayIso: string) {
  const totalWeeks = Math.max(1, Number(program?.weeks_to_repeat) || 1)
  const hasSchedule = Boolean(program?.start_date && program?.end_date)
  if (!program || !hasSchedule) {
    return { totalWeeks, currentWeek: 0, daysRemaining: 0, hasSchedule: false }
  }
  const daysFromStart = signedCalendarDays(program.start_date!, todayIso) ?? 0
  const elapsedDays = Math.max(0, daysFromStart)
  const currentWeek = Math.min(totalWeeks, Math.max(1, Math.ceil(elapsedDays / 7)))
  const daysRemaining = signedCalendarDays(todayIso, program.end_date!) ?? 0
  return { totalWeeks, currentWeek, daysRemaining, hasSchedule: true }
}

function nativePhaseColor(color: string | undefined): string | undefined {
  if (!color || color.trim().startsWith('var(')) return undefined
  return color
}

function phaseClass(index: number): string {
  return PHASE_CLASSES[index % PHASE_CLASSES.length]!
}

function muscleDotClass(group: string | null): string {
  if (!group) return MUSCLE_DOT_CLASSES[0]
  let hash = 0
  for (let index = 0; index < group.length; index += 1) hash = (hash * 31 + group.charCodeAt(index)) >>> 0
  return MUSCLE_DOT_CLASSES[hash % MUSCLE_DOT_CLASSES.length]!
}

function uniqueMuscleGroups(blocks: ProgramBlock[]): string[] {
  const groups = new Set<string>()
  for (const block of blocks) {
    const group = block.muscleGroup?.trim()
    if (group) groups.add(group)
  }
  return [...groups].sort((a, b) => a.localeCompare(b))
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <Text className="text-strong" style={styles.sectionTitle}>{children}</Text>
}

function InverseChip({ children, tone = 'dark' }: { children: ReactNode; tone?: 'dark' | 'sport' | 'warning' }) {
  const shell = tone === 'sport'
    ? 'border-sport-500 bg-sport-500'
    : tone === 'warning'
      ? 'border-warning-500 bg-warning-500'
      : 'border-inverse/10 bg-transparent'
  const text = tone === 'warning' ? 'text-on-warning' : tone === 'sport' ? 'text-on-sport' : 'text-on-dark-muted'
  return (
    <View className={`rounded-pill border ${shell}`} style={styles.inverseChip}>
      <Text className={text} style={styles.inverseChipText}>{children}</Text>
    </View>
  )
}

export function PlanTab({ data, onEdit }: { data: CoachClientDetailData; onEdit: (programId?: string) => void }) {
  const { theme } = useTheme()
  const program = data.activeProgram
  const todayIso = getTodayInSantiago().iso
  const santiagoToday = new Date(`${todayIso}T12:00:00Z`)
  const todayDow = santiagoToday.getUTCDay() === 0 ? 7 : santiagoToday.getUTCDay()
  const [selected, setSelected] = useState<ProgramBlock | null>(null)
  const [openDow, setOpenDow] = useState<number | null>(todayDow)
  const meta = resolveProgramMeta(program, todayIso)
  const structure = (program?.program_structure_type as 'weekly' | 'cycle' | null) || 'weekly'
  const isWeekly = structure === 'weekly'
  const abMode = Boolean(program?.ab_mode)
  const cycleVariant = resolveActiveWeekVariantForDisplay(program, meta.currentWeek || null, santiagoToday)
  const activeVariant = effectiveWeekVariantFromPlans(program?.workoutPlans ?? [], cycleVariant, abMode)
  const plansView = useMemo(
    () => filterPlansForStructureView(program?.workoutPlans, structure, { abMode, activeVariant }),
    [program?.workoutPlans, structure, abMode, activeVariant],
  )
  const planByDow = useMemo(() => {
    const map = new Map<number, ProgramDay>()
    for (const plan of plansView) {
      const dow = Number(plan.day_of_week)
      if (!map.has(dow)) map.set(dow, plan)
    }
    return map
  }, [plansView])
  const phases = program?.program_phases ?? []
  const structureWeeks = meta.totalWeeks > 1 ? meta.totalWeeks : 0
  const progressPct = meta.hasSchedule && meta.totalWeeks > 0
    ? Math.min(100, Math.round((meta.currentWeek / meta.totalWeeks) * 100))
    : 0

  function phaseForWeek(week: number): { phase: Phase | null; index: number } {
    if (!phases.length) return { phase: null, index: 0 }
    let accumulated = 0
    for (let index = 0; index < phases.length; index += 1) {
      accumulated += Math.max(1, phases[index]!.weeks)
      if (week <= accumulated) return { phase: phases[index]!, index }
    }
    return { phase: phases[phases.length - 1]!, index: phases.length - 1 }
  }

  if (!program) {
    return (
      <View className="items-center border border-subtle bg-surface-card" style={[styles.emptyCard, { borderRadius: theme.radius.card }]}>
        <View className="items-center justify-center rounded-pill bg-surface-sunken" style={styles.emptyIcon}>
          <ClipboardX size={24} color={theme.mutedForeground} />
        </View>
        <Text className="text-strong" style={styles.emptyTitle}>Sin programa asignado</Text>
        <Text className="text-muted" style={styles.emptyCopy}>Este alumno no tiene un plan de entrenamiento activo.</Text>
        <Button label="Crear o asignar programa" variant="sport" leftIcon={Plus} onPress={() => onEdit()} full />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View className="border border-inverse/10 bg-surface-inverse" style={[styles.inverseCard, { borderRadius: theme.radius.card }]}>
        <View style={styles.programTopRow}>
          <View style={styles.programTitleWrap}>
            <Text className="text-on-dark-muted" style={styles.programKicker}>PROGRAMA ACTIVO</Text>
            <Text className="text-on-dark" style={styles.programName}>{program.name}</Text>
          </View>
          {meta.hasSchedule ? (
            <InverseChip tone={meta.daysRemaining <= 3 ? 'warning' : 'sport'}>
              {meta.daysRemaining <= 0 ? 'Vencido' : `${meta.daysRemaining} días`}
            </InverseChip>
          ) : (
            <InverseChip>En curso</InverseChip>
          )}
        </View>

        <View style={styles.inverseMetaRow}>
          <InverseChip>{isWeekly ? 'Semanal' : 'Cíclico'}</InverseChip>
          {abMode ? <InverseChip tone="sport">Variante {activeVariant} · esta semana</InverseChip> : null}
          <InverseChip>{meta.totalWeeks} sem. ciclo</InverseChip>
          {program.cycle_length ? <InverseChip>{program.cycle_length} días / ciclo</InverseChip> : null}
        </View>

        {phases.length ? <InversePhases phases={phases} /> : null}

        {meta.hasSchedule ? (
          <View style={styles.inverseProgress}>
            <View style={styles.progressLabelRow}>
              <Text className="text-on-dark-muted" style={styles.progressLabel}>Semana {meta.currentWeek} de {meta.totalWeeks}</Text>
              <Text className="text-on-dark-muted" style={styles.progressPct}>{progressPct}%</Text>
            </View>
            <View className="overflow-hidden rounded-pill bg-white/10" style={styles.progressTrack}>
              <View className="rounded-pill bg-sport-500" style={{ height: '100%', width: `${progressPct}%` }} />
            </View>
          </View>
        ) : (
          <Text className="text-on-dark-muted" style={styles.noSchedule}>Sin fechas inicio/fin en el programa · progreso por semanas no disponible</Text>
        )}
      </View>

      {structureWeeks > 1 ? (
        <View>
          <SectionTitle>Estructura del ciclo · {structureWeeks} semanas</SectionTitle>
          <View className="border border-subtle bg-surface-card" style={[styles.structureCard, { borderRadius: theme.radius.card }]}>
            <View style={styles.weekGrid}>
              {Array.from({ length: structureWeeks }, (_, index) => {
                const week = index + 1
                const visual = phaseForWeek(week)
                const current = meta.hasSchedule && week === meta.currentWeek
                const variant = week % 2 === 1 ? 'A' : 'B'
                const customColor = nativePhaseColor(visual.phase?.color)
                return (
                  <View
                    key={week}
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={`Semana ${week}${visual.phase?.name ? `, fase ${visual.phase.name}` : ''}${abMode ? `, variante ${variant}` : ''}${current ? ', actual' : ''}`}
                    style={styles.weekCell}
                  >
                    <View
                      className={`items-center justify-center ${customColor ? '' : phaseClass(visual.index)}`}
                      style={[
                        styles.weekBlock,
                        { opacity: current ? 1 : 0.42, borderColor: current ? theme.foreground : 'transparent' },
                        customColor ? { backgroundColor: customColor } : null,
                      ]}
                    >
                      {abMode ? <Text className="text-on-sport" style={styles.weekVariant}>{variant}</Text> : null}
                    </View>
                    <Text style={[styles.weekNumber, { color: current ? theme.foreground : theme.mutedForeground, fontFamily: current ? FONT.monoBold : FONT.mono }]}>{week}</Text>
                  </View>
                )
              })}
            </View>
            <View style={styles.structureLegend}>
              {phases.map((phase, index) => {
                const customColor = nativePhaseColor(phase.color)
                return (
                  <View key={`${phase.name}-${index}`} style={styles.structureLegendItem}>
                    <View className={customColor ? '' : phaseClass(index)} style={[styles.structureLegendDot, customColor ? { backgroundColor: customColor } : null]} />
                    <Text className="text-muted" style={styles.structureLegendText}>{phase.name}</Text>
                  </View>
                )
              })}
              {abMode ? <Text className="text-muted" style={styles.abLegend}>A/B = variante semanal alternada</Text> : null}
            </View>
          </View>
        </View>
      ) : null}

      <View>
        <SectionTitle>{isWeekly ? 'Microciclo (L–D)' : 'Días del programa'}</SectionTitle>
        <View style={styles.dayList}>
          {isWeekly ? (
            [1, 2, 3, 4, 5, 6, 7].map((dow) => (
              <DayCard
                key={dow}
                plan={planByDow.get(dow)}
                dow={dow}
                label={DAY_LABELS[dow] ?? `D${dow}`}
                isToday={dow === todayDow}
                open={openDow === dow}
                onToggle={() => setOpenDow(openDow === dow ? null : dow)}
                onBlock={setSelected}
              />
            ))
          ) : plansView.length ? (
            plansView.map((plan) => {
              const dow = Number(plan.day_of_week)
              return (
                <DayCard
                  key={plan.id}
                  plan={plan}
                  dow={dow}
                  label={dow >= 1 && dow <= 7 ? DAY_LABELS[dow] ?? `D${dow}` : String(dow)}
                  isToday={false}
                  open={openDow === dow}
                  onToggle={() => setOpenDow(openDow === dow ? null : dow)}
                  onBlock={setSelected}
                />
              )
            })
          ) : (
            <View className="border border-subtle bg-surface-card" style={[styles.cycleEmpty, { borderRadius: theme.radius.md }]}>
              <Text className="text-muted" style={styles.cycleEmptyText}>No hay días con ejercicios en este programa (revisa variantes de semana en el builder).</Text>
            </View>
          )}
        </View>
      </View>

      <Button label="Editar en builder" variant="sport" leftIcon={Pencil} onPress={() => onEdit(program.id)} full />

      <Sheet
        open={selected != null}
        onClose={() => setSelected(null)}
        nativeModal
        snapPoints={['88%']}
        showCloseButton={false}
        accessibilityLabel={selected ? `Detalle de ${selected.exerciseName}` : 'Detalle del ejercicio'}
        footer={<Button label="Cerrar" variant="secondary" onPress={() => setSelected(null)} full />}
      >
        {selected ? <ExerciseDetail key={selected.id} block={selected} /> : null}
      </Sheet>
    </View>
  )
}

function InversePhases({ phases }: { phases: Phase[] }) {
  const total = phases.reduce((sum, phase) => sum + Math.max(1, phase.weeks), 0) || 1
  return (
    <View style={styles.inversePhases}>
      <View style={styles.phaseBar}>
        {phases.map((phase, index) => {
          const customColor = nativePhaseColor(phase.color)
          return (
            <View
              key={`${phase.name}-${index}`}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${phase.name}, ${phase.weeks} ${phase.weeks === 1 ? 'semana' : 'semanas'}`}
              className={customColor ? '' : phaseClass(index)}
              style={[
                { flex: Math.max(1, phase.weeks) / total, height: '100%' },
                index < phases.length - 1 ? styles.phaseSeparator : null,
                customColor ? { backgroundColor: customColor } : null,
              ]}
            />
          )
        })}
      </View>
      <View style={styles.inversePhaseLegend}>
        {phases.map((phase, index) => {
          const customColor = nativePhaseColor(phase.color)
          return (
            <View key={`${phase.name}-legend-${index}`} style={styles.inversePhaseLegendItem}>
              <View className={customColor ? '' : phaseClass(index)} style={[styles.inversePhaseDot, customColor ? { backgroundColor: customColor } : null]} />
              <Text className="text-on-dark-muted" style={styles.inversePhaseText}>{phase.name} · {phase.weeks}s</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function DayCard({
  plan,
  dow,
  label,
  isToday,
  open,
  onToggle,
  onBlock,
}: {
  plan?: ProgramDay
  dow: number
  label: string
  isToday: boolean
  open: boolean
  onToggle: () => void
  onBlock: (block: ProgramBlock) => void
}) {
  const { theme } = useTheme()
  const blocks = [...(plan?.blocks ?? [])].sort((a, b) => a.order_index - b.order_index)
  const groups = uniqueMuscleGroups(blocks)
  const hasWork = Boolean(plan && blocks.length)

  if (!hasWork) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${label}, Descanso${isToday ? ', Hoy' : ''}`}
        className={`flex-row items-center border bg-surface-card ${isToday ? 'border-sport-400' : 'border-subtle'}`}
        style={[
          styles.restCard,
          { borderRadius: theme.radius.md },
        ]}
      >
        <View className="items-center justify-center rounded-control bg-surface-sunken" style={styles.dayLabelBox}>
          <Text className="text-muted" style={styles.dayLabelText}>{label}</Text>
        </View>
        <Text className="text-muted" style={styles.restText}>Descanso</Text>
        {isToday ? <TodayBadge /> : null}
      </View>
    )
  }

  const grouped = groupContiguousSupersetRuns(
    blocks.map((block) => ({ ...block, superset_group: block.supersetGroup })),
  )

  return (
    <View
      className={`overflow-hidden border bg-surface-card ${isToday ? 'border-sport-400' : 'border-subtle'}`}
      style={[
        styles.dayCard,
        { borderRadius: theme.radius.md, borderWidth: isToday ? 2 : 1 },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${plan?.title || 'Entrenamiento'}, ${blocks.length} ${blocks.length === 1 ? 'ejercicio' : 'ejercicios'}${groups.length ? `, ${groups.join(', ')}` : ''}${isToday ? ', Hoy' : ''}`}
        style={styles.dayHead}
      >
        <View className="items-center justify-center rounded-control bg-sport-100 dark:bg-sport-100/20" style={styles.dayLabelBox}>
          <Text className="text-sport-700" style={styles.dayLabelText}>{label}</Text>
        </View>
        <View style={styles.dayText}>
          <View style={styles.dayTitleRow}>
            <Text className="text-strong" numberOfLines={1} style={styles.dayTitle}>{plan?.title || 'Entrenamiento'}</Text>
            {isToday ? <TodayBadge /> : null}
          </View>
          <Text className="text-muted" numberOfLines={1} style={styles.daySub}>
            {blocks.length} ej.{groups.length ? ` · ${groups.slice(0, 3).join(', ')}${groups.length > 3 ? '…' : ''}` : ''}
          </Text>
        </View>
        <ChevronRight size={18} color={theme.mutedForeground} style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }} />
      </TouchableOpacity>

      {open ? (
        <View className="border-t border-subtle">
          {grouped.map((group, groupIndex) => {
            if (group.type !== 'superset') {
              return <ExerciseRow key={group.key} block={group.blocks[0]!} onPress={onBlock} topBorder={groupIndex > 0} />
            }
            const letter = group.supersetLetter ?? '?'
            return (
              <View key={group.key} className={groupIndex > 0 ? 'border-t border-subtle' : ''} style={styles.supersetOuter}>
                <View className="overflow-hidden border border-sport-300/40 border-l-sport-500 bg-sport-100/50 dark:bg-sport-100/10" style={[styles.supersetBox, { borderRadius: theme.radius.sm }]}>
                  <Text className="text-sport-700" style={styles.supersetLabel}>Superserie {letter} · {group.blocks.length} ejercicios</Text>
                  {group.blocks.map((block, index) => (
                    <ExerciseRow key={block.id} block={block} onPress={onBlock} topBorder={index > 0} ordinal={`${letter}${index + 1}`} />
                  ))}
                </View>
              </View>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

function TodayBadge() {
  return (
    <View className="rounded-control bg-sport-500" style={styles.todayBadge}>
      <Text className="text-on-sport" style={styles.todayBadgeText}>Hoy</Text>
    </View>
  )
}

function ExerciseRow({
  block,
  onPress,
  topBorder,
  ordinal,
}: {
  block: ProgramBlock & { superset_group?: string | null }
  onPress: (block: ProgramBlock) => void
  topBorder: boolean
  ordinal?: string
}) {
  const { theme } = useTheme()
  const hasSets = block.sets > 0
  const hasReps = block.reps.trim().length > 0
  const prescription = hasSets || hasReps ? `${hasSets ? block.sets : '—'}${hasReps ? `×${block.reps}` : ''}` : ''
  return (
    <TouchableOpacity
      activeOpacity={0.76}
      onPress={() => onPress(block)}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${block.exerciseName}${prescription ? `, ${prescription}` : ''}`}
      className={topBorder ? 'border-t border-subtle' : ''}
      style={styles.exerciseRow}
    >
      {ordinal ? (
        <View className="items-center justify-center rounded-control bg-sport-100 dark:bg-sport-100/20" style={styles.ordinalChip}>
          <Text className="text-sport-700" style={styles.ordinalText}>{ordinal}</Text>
        </View>
      ) : (
        <View className={muscleDotClass(block.muscleGroup)} style={styles.muscleDot} />
      )}
      <Text className="text-strong" numberOfLines={1} style={styles.exerciseName}>{block.exerciseName || 'Ejercicio'}</Text>
      {prescription ? <Text className="text-muted" style={styles.exercisePrescription}>{prescription}</Text> : null}
      <ChevronRight size={15} color={theme.mutedForeground} />
    </TouchableOpacity>
  )
}

function MediaPlaceholder() {
  const { theme } = useTheme()
  return (
    <View className="items-center justify-center border border-dashed border-subtle bg-surface-sunken" style={[styles.media, { borderRadius: theme.radius.md }]}>
      <PlayCircle size={30} color={theme.mutedForeground} />
      <Text className="text-muted" style={styles.mediaPlaceholderText}>GIF demostración</Text>
    </View>
  )
}

function ExerciseMedia({ block }: { block: ProgramBlock }) {
  const { theme } = useTheme()
  const reducedMotion = useReducedMotion()
  const [gifLoaded, setGifLoaded] = useState(false)
  const [gifErrored, setGifErrored] = useState(false)
  const showGif = Boolean(block.gifUrl && !gifErrored)
  if (!block.gifUrl && !block.thumbnailUrl) return <MediaPlaceholder />
  if (gifErrored && !block.thumbnailUrl) return <MediaPlaceholder />
  return (
    <View className="items-center justify-center overflow-hidden border border-subtle bg-surface-sunken" style={[styles.media, { borderRadius: theme.radius.md }]}>
      {block.thumbnailUrl ? (
        <MotiView
          animate={{ opacity: showGif && gifLoaded ? 0 : 1 }}
          transition={{ type: 'timing', duration: reducedMotion ? 0 : 500 }}
          style={styles.mediaLayer}
        >
          <Image
            source={{ uri: block.thumbnailUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            accessibilityLabel={block.exerciseName}
          />
        </MotiView>
      ) : null}
      {showGif ? (
        <MotiView
          animate={{ opacity: gifLoaded ? 1 : 0 }}
          transition={{ type: 'timing', duration: reducedMotion ? 0 : 500 }}
          style={styles.mediaLayer}
        >
          <Image
            source={{ uri: block.gifUrl! }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            autoplay
            onLoad={() => setGifLoaded(true)}
            onError={() => setGifErrored(true)}
            accessibilityLabel={`Demostración de ${block.exerciseName}`}
          />
        </MotiView>
      ) : null}
      {!block.thumbnailUrl && showGif && !gifLoaded ? <ActivityIndicator color={theme.mutedForeground} /> : null}
    </View>
  )
}

function ExerciseDetail({ block }: { block: ProgramBlock }) {
  const { theme } = useTheme()
  const rows: { label: string; value: string; Icon: LucideIcon }[] = [
    block.sets > 0 || block.reps.trim().length > 0
      ? { label: 'Series × reps', value: `${block.sets > 0 ? block.sets : '—'} × ${block.reps.trim() || '—'}`, Icon: Dumbbell }
      : null,
    block.target_weight_kg != null ? { label: 'Obj. peso', value: `${block.target_weight_kg} kg`, Icon: Weight } : null,
    block.rest_time ? { label: 'Descanso', value: String(block.rest_time), Icon: Timer } : null,
    block.rir != null && block.rir !== '' ? { label: 'RIR', value: String(block.rir), Icon: Gauge } : null,
    block.tempo ? { label: 'Tempo', value: String(block.tempo), Icon: Clock } : null,
  ].filter(Boolean) as { label: string; value: string; Icon: LucideIcon }[]

  return (
    <View style={styles.exerciseDetail}>
      <Text className="text-strong" style={styles.sheetTitle}>{block.exerciseName || 'Ejercicio'}</Text>
      <View style={styles.muscleRow}>
        {block.muscleGroup ? (
          <View className="flex-row items-center border border-subtle" style={[styles.muscleChip, { borderRadius: theme.radius.pill }]}>
            <Target size={12} color={theme.mutedForeground} />
            <Text className="text-muted" style={styles.muscleChipText}>{block.muscleGroup}</Text>
          </View>
        ) : (
          <Text className="text-muted" style={styles.sheetDescription}>Ejercicio del programa</Text>
        )}
      </View>

      <ExerciseMedia block={block} />

      {rows.length ? (
        <View className="overflow-hidden border border-subtle" style={{ borderRadius: theme.radius.md }}>
          {rows.map((row, index) => (
            <View key={row.label} className={index > 0 ? 'border-t border-subtle' : ''} style={styles.detailRow}>
              <row.Icon size={17} className="text-sport-500" />
              <Text className="text-muted" style={styles.detailLabel}>{row.label}</Text>
              <Text className="text-strong" style={styles.detailValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {block.notes ? (
        <View className="bg-surface-sunken" style={[styles.notes, { borderRadius: theme.radius.md }]}>
          <Text className="text-muted" style={styles.notesHeader}>NOTAS DEL COACH</Text>
          <Text className="text-body" style={styles.notesText}>{block.notes}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 14 },
  emptyCard: { paddingHorizontal: 24, paddingVertical: 40, gap: 10 },
  emptyIcon: { width: 56, height: 56, marginBottom: 2 },
  emptyTitle: { fontFamily: FONT.displayBold, fontSize: 16, textAlign: 'center' },
  emptyCopy: { fontFamily: FONT.uiMedium, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 4 },
  inverseCard: { padding: 20, gap: 12 },
  programTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  programTitleWrap: { flex: 1, minWidth: 0 },
  programKicker: { fontFamily: FONT.ui, fontSize: 12 },
  programName: { fontFamily: FONT.displayBold, fontSize: 18, lineHeight: 22 },
  inverseMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  inverseChip: { minHeight: 20, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  inverseChipText: { fontFamily: FONT.uiBold, fontSize: 11 },
  inversePhases: { gap: 6 },
  phaseBar: { flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden' },
  phaseSeparator: { marginRight: 2 },
  inversePhaseLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  inversePhaseLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inversePhaseDot: { width: 8, height: 8, borderRadius: 2 },
  inversePhaseText: { fontFamily: FONT.ui, fontSize: 11 },
  inverseProgress: { gap: 6 },
  progressLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { fontFamily: FONT.ui, fontSize: 12 },
  progressPct: { fontFamily: FONT.mono, fontSize: 12, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 8 },
  noSchedule: { fontFamily: FONT.uiMedium, fontSize: 11, lineHeight: 15 },
  sectionTitle: { fontFamily: FONT.displayBold, fontSize: 17, letterSpacing: -0.34, marginTop: 4, marginBottom: 10 },
  structureCard: { padding: 16, gap: 10 },
  weekGrid: { flexDirection: 'row', gap: 4 },
  weekCell: { flex: 1, alignItems: 'center', gap: 4, minWidth: 0 },
  weekBlock: { width: '100%', height: 26, borderRadius: 4, borderWidth: 2 },
  weekVariant: { fontFamily: FONT.uiExtra, fontSize: 10 },
  weekNumber: { fontSize: 9, fontVariant: ['tabular-nums'] },
  structureLegend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  structureLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  structureLegendDot: { width: 10, height: 10, borderRadius: 2 },
  structureLegendText: { fontFamily: FONT.ui, fontSize: 10.5 },
  abLegend: { fontFamily: FONT.ui, fontSize: 10.5, marginLeft: 'auto' },
  dayList: { gap: 8 },
  restCard: { minHeight: 62, gap: 12, padding: 14, opacity: 0.72 },
  restText: { flex: 1, fontFamily: FONT.ui, fontSize: 14 },
  dayCard: { borderWidth: 1 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dayLabelBox: { width: 34, height: 34 },
  dayLabelText: { fontFamily: FONT.uiExtra, fontSize: 12 },
  dayText: { flex: 1, minWidth: 0 },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayTitle: { flexShrink: 1, fontFamily: FONT.uiBold, fontSize: 14 },
  daySub: { fontFamily: FONT.ui, fontSize: 12, marginTop: 1 },
  todayBadge: { paddingHorizontal: 7, paddingVertical: 2 },
  todayBadgeText: { fontFamily: FONT.uiBold, fontSize: 10 },
  supersetOuter: { paddingHorizontal: 8, paddingVertical: 8 },
  supersetBox: { borderWidth: 1, borderLeftWidth: 3 },
  supersetLabel: { fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6 },
  exerciseRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  ordinalChip: { minWidth: 22, height: 20, paddingHorizontal: 4 },
  ordinalText: { fontFamily: FONT.uiExtra, fontSize: 10, fontVariant: ['tabular-nums'] },
  muscleDot: { width: 8, height: 8, borderRadius: 4 },
  exerciseName: { flex: 1, minWidth: 0, fontFamily: FONT.ui, fontSize: 14 },
  exercisePrescription: { fontFamily: FONT.mono, fontSize: 12, fontVariant: ['tabular-nums'] },
  cycleEmpty: { padding: 16 },
  cycleEmptyText: { fontFamily: FONT.ui, fontSize: 14, lineHeight: 20 },
  exerciseDetail: { gap: 14 },
  sheetTitle: { fontFamily: FONT.displayBold, fontSize: 20, lineHeight: 24, letterSpacing: -0.4 },
  muscleRow: { flexDirection: 'row', flexWrap: 'wrap' },
  muscleChip: { gap: 4, height: 22, paddingHorizontal: 8 },
  muscleChipText: { fontFamily: FONT.uiBold, fontSize: 11 },
  sheetDescription: { fontFamily: FONT.ui, fontSize: 12 },
  media: { width: '100%', height: 150, gap: 6 },
  mediaLayer: { ...StyleSheet.absoluteFillObject },
  mediaPlaceholderText: { fontFamily: FONT.ui, fontSize: 12 },
  detailRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  detailLabel: { flex: 1, fontFamily: FONT.ui, fontSize: 14 },
  detailValue: { fontFamily: FONT.mono, fontSize: 15, fontVariant: ['tabular-nums'] },
  notes: { paddingHorizontal: 14, paddingVertical: 12 },
  notesHeader: { fontFamily: FONT.displayBold, fontSize: 11, letterSpacing: 0.44, marginBottom: 4 },
  notesText: { fontFamily: FONT.ui, fontSize: 14, lineHeight: 20 },
})
