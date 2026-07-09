import { Pressable, Text, View } from 'react-native'
import { CheckCircle2, Info } from 'lucide-react-native'
import type { ReconciledSessionLog } from '@eva/workout-engine'
import { TYPE } from '../../../lib/typography'
import type { EffectiveTarget } from '../../../lib/workout/progression'
import { resolveExercise, type SessionBlock } from '../../../lib/workout-session'
import { SetRow } from './SetRow'
import { overloadChipLabel } from './workout-ui'

const SPORT_400 = '#5C9DFF'
const ON_DARK_MUTED = '#939DAB'
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Card de superserie (mobile) — grupo visual sport-bordered con sus miembros (A/B/C), prescripción,
 * técnica y las series de cada uno. Espeja `SupersetGroupCard` de web; el orden intercalado por rondas
 * (A1→B1→A2…) con auto-cue queda como seam de pulido (Wave B).
 */
export function SupersetGroupCard({
  members,
  sessionLogs,
  effByBlock,
  currentWeek,
  onOpenTechnique,
  onOpenSet,
}: {
  members: SessionBlock[]
  sessionLogs: ReconciledSessionLog[]
  effByBlock: Map<string, EffectiveTarget | null>
  currentWeek: number | null
  onOpenTechnique: (block: SessionBlock) => void
  onOpenSet: (blockId: string, setNumber: number) => void
}) {
  const maxSets = members.reduce((mx, m) => Math.max(mx, m.sets), 0)

  return (
    <View className="gap-3 rounded-card border border-sport-500/30 bg-sport-500/[0.05] p-4">
      <View className="flex-row items-center gap-2">
        <Text className="font-display-bold text-sm text-on-dark">Superserie</Text>
        <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">
          {members.length} ejercicios · {maxSets} ronda{maxSets === 1 ? '' : 's'}
        </Text>
      </View>
      <Text style={TYPE.caption} className="text-[12px] text-on-dark-muted">
        Completa una serie de cada ejercicio y repite. Descansa al cerrar la ronda.
      </Text>

      {members.map((block, idx) => {
        const exercise = resolveExercise(block)
        if (!exercise) return null
        const letter = LETTERS[idx] ?? '?'
        const eff = effByBlock.get(block.id) ?? null
        const suggested = eff?.weightKg ?? block.target_weight_kg
        const blockLogs = sessionLogs.filter((l) => l.block_id === block.id)
        const doneCount = new Set(
          blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number),
        ).size
        const complete = doneCount >= block.sets
        let firstUnlogged: number | null = null
        for (let i = 1; i <= block.sets; i += 1) {
          if (!blockLogs.some((l) => l.set_number === i)) { firstUnlogged = i; break }
        }
        const overload = overloadChipLabel(block, eff, currentWeek)
        const hasTechnique = !!(exercise.gif_url || exercise.video_url)

        return (
          <View key={block.id} className="gap-2 rounded-card border border-inverse/50 bg-white/[0.03] p-3">
            <View className="flex-row items-start justify-between gap-2">
              <View className="min-w-0 flex-1 flex-row items-start gap-2">
                <View className="h-6 w-6 items-center justify-center rounded-full bg-sport-500/15">
                  <Text className="font-display-black text-[12px] text-sport-300">{letter}</Text>
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-display-bold text-[16px] leading-[19px] text-on-dark" numberOfLines={2}>{exercise.name}</Text>
                  <View className="mt-1 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Text style={TYPE.mono} className="text-[11px] text-on-dark font-mono-bold">{block.sets} × {block.reps}</Text>
                    {block.target_weight_kg != null && (
                      <Text style={TYPE.mono} className="text-[11px] text-on-dark font-mono-bold">· {suggested ?? block.target_weight_kg}kg</Text>
                    )}
                    {overload && <Text style={TYPE.caption} className="text-[10.5px] text-sport-300 font-sans-bold">· {overload}</Text>}
                  </View>
                  {hasTechnique && (
                    <Pressable testID={`btn-technique-${block.id}`} onPress={() => onOpenTechnique(block)} className="mt-1.5 flex-row items-center gap-1">
                      <Info size={13} color={ON_DARK_MUTED} />
                      <Text style={TYPE.caption} className="text-[11px] text-on-dark-muted">Ver tecnica</Text>
                    </Pressable>
                  )}
                </View>
              </View>
              {complete && <CheckCircle2 size={22} color={SPORT_400} />}
            </View>

            <View className="gap-1.5">
              {Array.from({ length: block.sets }).map((_, i) => {
                const setNumber = i + 1
                const log = blockLogs.find((l) => l.set_number === setNumber)
                return (
                  <SetRow
                    key={setNumber}
                    setNumber={setNumber}
                    log={log}
                    isActive={setNumber === firstUnlogged}
                    onPress={() => onOpenSet(block.id, setNumber)}
                  />
                )
              })}
            </View>
          </View>
        )
      })}
    </View>
  )
}
