import { Text, View } from 'react-native'
import { ArrowRight, Check, Dumbbell, Moon, Play } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { FONT, textStyle } from '../../../lib/typography'
import { Button } from '../../Button'
import { Card } from '../../Card'
import { ProgressRing } from '../../ProgressRing'
import type { HeroBlock, Plan } from './types'
import { DAY_SHORT, SUCCESS_500 } from './types'

/**
 * §5 HeroSection (web `hero/HeroSection.tsx` → WorkoutHeroCard | RestDayCard).
 * El "que hago hoy". Tres variantes: entreno (card inverse + anillo + lista de
 * bloques), descanso (card sunken + luna animada), sin programa (coach armando).
 */
export function HeroSection({
  todayPlan,
  nextPlan,
  loggedByBlock,
  isAlreadyLogged,
  hasProgram,
  coachName,
  nutritionEnabled,
  onStart,
  onRest,
  onNoPlan,
}: {
  todayPlan: Plan | null
  nextPlan: Plan | null
  loggedByBlock: Map<string, number>
  isAlreadyLogged: boolean
  hasProgram: boolean
  coachName: string | null
  nutritionEnabled: boolean
  onStart: (planId: string) => void
  onRest: () => void
  onNoPlan: () => void
}) {
  if (todayPlan) {
    return (
      <WorkoutHero plan={todayPlan} loggedByBlock={loggedByBlock} isAlreadyLogged={isAlreadyLogged} onStart={onStart} />
    )
  }
  if (hasProgram) {
    return <RestDayCard nextPlan={nextPlan} nutritionEnabled={nutritionEnabled} onRest={onRest} />
  }
  return <NoPlanCard coachName={coachName} onNoPlan={onNoPlan} />
}

function WorkoutHero({
  plan,
  loggedByBlock,
  isAlreadyLogged,
  onStart,
}: {
  plan: Plan
  loggedByBlock: Map<string, number>
  isAlreadyLogged: boolean
  onStart: (planId: string) => void
}) {
  const { theme } = useTheme()
  const show = plan.blocks.slice(0, 4)
  const more = plan.blocks.length - show.length
  const totalTarget = plan.blocks.reduce((s, b) => s + (b.sets || 0), 0)
  const totalLogged = plan.blocks.reduce((s, b) => s + Math.min(b.sets || 0, loggedByBlock.get(b.id) ?? 0), 0)
  const pct = totalTarget > 0 ? Math.min(100, (totalLogged / totalTarget) * 100) : 0
  const cta = isAlreadyLogged ? 'Ver registro' : totalLogged > 0 ? 'Continuar' : 'Empezar entrenamiento'

  return (
    <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450, delay: 80 }}>
      <Card variant="inverse" padding="lg">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-sport-400" style={{ fontFamily: FONT.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
              Hoy entrenás
            </Text>
            <Text className="text-on-dark" numberOfLines={2} style={[textStyle('2xl', FONT.displayBlack, { lh: 'tight', ls: 'tight' }), { marginTop: 6, fontSize: 23 }]}>
              {plan.title}
            </Text>
            <Text className="text-on-dark-muted font-sans" style={{ fontSize: 13, marginTop: 4 }}>
              {plan.blocks.length} {plan.blocks.length === 1 ? 'ejercicio' : 'ejercicios'} · {totalTarget} series
            </Text>
          </View>
          <ProgressRing
            value={pct}
            size={64}
            stroke={7}
            color={theme.primary}
            track="rgba(255,255,255,0.12)"
            showValue={false}
            label={
              <Text className="text-on-dark" style={{ fontFamily: FONT.displayBlack, fontSize: 15, fontVariant: ['tabular-nums'] }}>
                {totalLogged}/{totalTarget}
              </Text>
            }
          />
        </View>

        {show.length > 0 ? (
          <View style={{ marginTop: 16, marginBottom: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' }}>
            {show.map((b, i) => (
              <HeroBlockRow key={b.id} block={b} logged={loggedByBlock.get(b.id) ?? 0} first={i === 0} />
            ))}
            {more > 0 ? (
              <Text className="text-on-dark-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 11, paddingHorizontal: 12, paddingVertical: 8 }}>
                + {more} ejercicios más
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={{ height: 16 }} />
        )}

        <Button testID="home-hero-start" label={cta} variant="sport" size="lg" leftIcon={Play} full onPress={() => onStart(plan.id)} />

        {isAlreadyLogged ? (
          <View
            style={{ position: 'absolute', inset: 0, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(31,184,119,0.22)' }}
          >
            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: SUCCESS_500 }}>
              <Check size={26} color="#fff" strokeWidth={3} />
            </View>
            <Text className="text-on-dark" style={{ fontFamily: FONT.displayBlack, fontSize: 14 }}>Entrenamiento completado</Text>
          </View>
        ) : null}
      </Card>
    </MotiView>
  )
}

function HeroBlockRow({ block, logged, first }: { block: HeroBlock; logged: number; first: boolean }) {
  const full = logged >= block.sets && block.sets > 0
  const fillPct = block.sets ? Math.min(100, (logged / block.sets) * 100) : 0
  return (
    <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, overflow: 'hidden', borderTopWidth: first ? 0 : 1, borderTopColor: 'rgba(255,255,255,0.04)' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fillPct}%`, backgroundColor: full ? 'rgba(76,201,164,0.12)' : 'rgba(255,255,255,0.07)' }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="text-on-dark font-sans-semibold" numberOfLines={1} style={{ fontSize: 13.5 }}>{block.name}</Text>
        <Text className="text-on-dark-muted" style={{ fontFamily: FONT.ui, fontSize: 11 }}>{block.sets} × {block.reps}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 11.5, fontVariant: ['tabular-nums'], color: full ? '#4CC9A4' : 'rgba(255,255,255,0.55)' }}>
          {logged}/{block.sets}
        </Text>
        {full ? <Check size={14} color="#4CC9A4" strokeWidth={2.6} /> : null}
      </View>
    </View>
  )
}

function RestDayCard({ nextPlan, nutritionEnabled, onRest }: { nextPlan: Plan | null; nutritionEnabled: boolean; onRest: () => void }) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  return (
    <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450, delay: 80 }}>
      <Card variant="sunken" padding="lg" style={{ alignItems: 'center' }}>
        <MotiView
          from={{ translateY: 0 }}
          animate={motion.reduced ? { translateY: 0 } : { translateY: [0, -8, 0] }}
          transition={motion.reduced ? undefined : { type: 'timing', duration: 3000, loop: true }}
          style={{ marginBottom: 12, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.cyan + '22' }}
        >
          <Moon size={26} color={theme.cyan} strokeWidth={2.25} />
        </MotiView>
        <Text className="text-strong" style={[textStyle('xl', FONT.displayBlack, { lh: 'snug', ls: 'tight' }), { textAlign: 'center' }]}>Día de descanso</Text>
        <Text className="text-muted font-sans" style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 20, marginTop: 6, maxWidth: 280 }}>
          {nextPlan ? (
            <>
              Próximo: <Text className="text-body font-sans-semibold">{nextPlan.title}</Text>
              {nextPlan.day_of_week ? ` · ${DAY_SHORT[nextPlan.day_of_week]}` : ''}
            </>
          ) : (
            'Recupera bien para la próxima sesión.'
          )}
        </Text>
        {nutritionEnabled ? (
          <Button label="Ver nutrición de hoy" variant="secondary" size="lg" rightIcon={ArrowRight} onPress={onRest} style={{ marginTop: 16 }} />
        ) : null}
      </Card>
    </MotiView>
  )
}

function NoPlanCard({ coachName, onNoPlan }: { coachName: string | null; onNoPlan: () => void }) {
  const { theme } = useTheme()
  return (
    <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450, delay: 80 }}>
      <Card padding="lg" style={{ alignItems: 'center' }}>
        <View style={{ marginBottom: 12, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary + '1A' }}>
          <Dumbbell size={28} color={theme.primary} strokeWidth={2.25} />
        </View>
        <Text className="text-strong" style={[textStyle('xl', FONT.displayBlack, { lh: 'snug', ls: 'tight' }), { textAlign: 'center' }]}>Tu coach está armando tu plan</Text>
        <Text className="text-muted font-sans" style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 20, marginTop: 6, maxWidth: 300 }}>
          {coachName ?? 'Tu coach'} está preparando tu programa. Te avisamos apenas esté listo.
        </Text>
        <Button label="Hacer un check-in" variant="sport" size="lg" rightIcon={ArrowRight} onPress={onNoPlan} style={{ marginTop: 16 }} />
      </Card>
    </MotiView>
  )
}
