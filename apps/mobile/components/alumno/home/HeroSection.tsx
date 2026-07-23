import { useRef } from 'react'
import { Text, View } from 'react-native'
import { ArrowRight, Check, Dumbbell, Moon, Play } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { SHADOWS } from '../../../lib/shadows'
import { hexToChannels } from '../../../lib/theme'
import { FONT, textStyle } from '../../../lib/typography'
import { Button } from '../../Button'
import { Card } from '../../Card'
import { measureMorphOrigin, useTriggerMorphHide, type MorphOrigin } from '../workout/v3/session-morph'
import { InfoTooltip } from '../../InfoTooltip'
import { ProgressRing } from '../../ProgressRing'
import type { HeroBlock, Plan } from './types'
import { DAY_SHORT, SUCCESS_500 } from './types'

// P0-2 — fondo del overlay "Entrenamiento completado". El web (WorkoutHeroCard.tsx:52)
// usa `color-mix(in srgb, success-500 22%, surface-inverse)` sobre `surface-inverse`
// OPACO (sin alpha): el 22% es cantidad de TINTE verde, NO opacidad → superficie solida
// que TAPA el hero. Se replica computando el mix 78/22 desde tokens (no hex crudo del
// resultado): surface-inverse (`--color-surface-inverse`, global.css: light `11 14 19`
// / dark `42 50 61`) + success-500 (SUCCESS_500 `#1FB877`). Da light rgb(15,51,41) y
// dark rgb(40,79,74). El bg opaco por si solo deja el hero ilegible detras (paridad
// con el scrim web); el `backdrop-blur-sm` web es cosmetico y se omite (regla 10).
const SURFACE_INVERSE_CH: Record<'light' | 'dark', string> = { light: '11 14 19', dark: '42 50 61' }
function completedOverlayBg(scheme: 'light' | 'dark'): string {
  const [sr, sg, sb] = hexToChannels(SUCCESS_500).split(' ').map(Number)
  const [ir, ig, ib] = SURFACE_INVERSE_CH[scheme].split(' ').map(Number)
  const mix = (fg: number, bg: number) => Math.round(0.22 * fg + 0.78 * bg)
  return `rgb(${mix(sr, ir)}, ${mix(sg, ig)}, ${mix(sb, ib)})`
}

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
  onStart: (planId: string, origin?: MorphOrigin | null) => void
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
  onStart: (planId: string, origin?: MorphOrigin | null) => void
}) {
  const { theme } = useTheme()
  const ctaRef = useRef<View>(null)
  // Al lanzar el Despegue el CTA real debe quedar INVISIBLE (el clon flotante lo reemplaza); si no, se
  // ve la caja del botón detrás del morph. Se restaura tras la ventana (ya navegado).
  const { hidden: ctaHidden, hide: hideCta } = useTriggerMorphHide()
  const show = plan.blocks.slice(0, 4)
  const more = plan.blocks.length - show.length
  const totalTarget = plan.blocks.reduce((s, b) => s + (b.sets || 0), 0)
  const totalLogged = plan.blocks.reduce((s, b) => s + Math.min(b.sets || 0, loggedByBlock.get(b.id) ?? 0), 0)
  const pct = totalTarget > 0 ? Math.min(100, (totalLogged / totalTarget) * 100) : 0
  const cta = isAlreadyLogged ? 'Ver registro' : totalLogged > 0 ? 'Continuar' : 'Empezar entrenamiento'

  return (
    <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450, delay: 80 }}>
      {/* shadow-lg: override explicito del hero web (WorkoutHeroCard.tsx:51), no el
          shadow-md por defecto del Card inverse. Card compone [base, S.md, style] →
          este style gana (Card.tsx:123). */}
      <Card variant="inverse" padding="lg" style={SHADOWS[theme.scheme].lg}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Eyebrow + InfoTooltip (web WorkoutHeroCard.tsx:62-65 `flex items-center gap-2`
                + `<InfoTooltip content={t('section.workoutHero')} />`; copy es.json:416). */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text className="text-sport-400" style={{ fontFamily: FONT.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                Hoy entrenas
              </Text>
              <InfoTooltip content="Tu entrenamiento asignado para hoy. Toca la tarjeta para comenzar y registrar tus series una por una." />
            </View>
            <Text className="text-on-dark" numberOfLines={1} style={[textStyle('2xl', FONT.displayBlack, { lh: 'tight', ls: 'tight' }), { marginTop: 6, fontSize: 23 }]}>
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
          <View style={{ marginTop: 16, marginBottom: 16, borderRadius: theme.radius.control, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' }}>
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

        {/* Ref-wrapper medible: al tocar el CTA se mide su rect real en ventana para que el morph
            "Impulso" nazca EXACTO del botón (QA6). `collapsable={false}` evita que Android colapse el
            View y measureInWindow devuelva 0. Si la medición falla, el morph cae al origen sintético. */}
        <View ref={ctaRef} collapsable={false} style={{ opacity: ctaHidden ? 0 : 1 }}>
          <Button
            testID="home-hero-start"
            label={cta}
            variant="sport"
            size="lg"
            leftIcon={Play}
            full
            onPress={() => {
              hideCta()
              measureMorphOrigin(ctaRef.current, 16, (origin) => onStart(plan.id, origin))
            }}
          />
        </View>

        {isAlreadyLogged ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: theme.radius.card,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: completedOverlayBg(theme.scheme),
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: SUCCESS_500,
                // glow verde — web shadow-[0_0_24px_rgba(31,184,119,0.5)] (shadowColor literal DS).
                shadowColor: SUCCESS_500,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 24,
                elevation: 8,
              }}
            >
              <Check size={28} color="#fff" strokeWidth={2} />
            </View>
            <Text className="text-on-dark" style={{ fontFamily: FONT.displayBlack, fontSize: 14 }}>Entrenamiento completado</Text>
          </View>
        ) : null}
      </Card>
    </MotiView>
  )
}

function HeroBlockRow({ block, logged, first }: { block: HeroBlock; logged: number; first: boolean }) {
  const { theme } = useTheme()
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
        {/* Ola0 P1: contador/check de bloque full en tokens (web text-sport-500 / text-on-dark-muted,
            WorkoutHeroCard.tsx:107-114), no el mint hardcodeado #4CC9A4. theme.primary = sport-500
            white-label (equivalente al `text-sport-500` web). */}
        <Text className={full ? 'text-sport-500' : 'text-on-dark-muted'} style={{ fontFamily: FONT.uiBold, fontSize: 11.5, fontVariant: ['tabular-nums'] }}>
          {logged}/{block.sets}
        </Text>
        {/* Web Check h-3.5 (14) con stroke lucide default 2 (WorkoutHeroCard.tsx:114). */}
        {full ? <Check size={14} color={theme.primary} strokeWidth={2} /> : null}
      </View>
    </View>
  )
}

function RestDayCard({ nextPlan, nutritionEnabled, onRest }: { nextPlan: Plan | null; nutritionEnabled: boolean; onRest: () => void }) {
  const motion = useEvaMotion()
  const { theme } = useTheme()
  return (
    <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450, delay: 80 }}>
      <Card variant="sunken" padding="lg" style={{ alignItems: 'center' }}>
        {/* Ola0 P1: luna de descanso scheme-aware por tokens (web RestDayCard.tsx:24
            `bg-aqua-100 text-aqua-700`), NO el aqua-500 constante `theme.cyan`. Chip suave
            = bg-aqua-100 con flip dark/[0.18] (patron Badge.tsx:63); icono lucide = color
            imperativo `theme.aqua700` (lucide-react-native toma `color`, NO className
            dark-aware). Ambos flipean: light #E3F5FB/#0A6E8D, dark rgba(24,171,212,.18)/#6FD3EA. */}
        <MotiView
          from={{ translateY: 0 }}
          animate={motion.reduced ? { translateY: 0 } : { translateY: [0, -8, 0] }}
          transition={motion.reduced ? undefined : { type: 'timing', duration: 3000, loop: true }}
          className="bg-aqua-100 dark:bg-aqua-100/[0.18]"
          style={{ marginBottom: 12, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Web Moon h-7 w-7 (28) stroke default 2 (RestDayCard.tsx:29). */}
          <Moon size={28} color={theme.aqua700} strokeWidth={2} />
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
