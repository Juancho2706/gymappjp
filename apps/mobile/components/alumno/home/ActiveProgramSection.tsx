import { useRef, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { ArrowRight, Calendar, CheckCircle2, ChevronRight, Pencil, Play, RotateCcw } from 'lucide-react-native'
import { cssInterop } from 'nativewind'
import { deriveSportTokens } from '@eva/brand-kit'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { Badge } from '../../Badge'
import { Card } from '../../Card'
import { Sheet } from '../../Sheet'
import { ProgramPhaseBar } from './ProgramPhaseBar'
import { measureMorphOrigin, type MorphOrigin } from '../workout/v3/session-morph'
import { DAY_FULL, DAY_SHORT } from './types'
import type { PendingDay, PlanDayView, Program } from './types'

/** "martes 15 de julio" — dia calendario es-CL desde un ymd (mediodia UTC evita cruce de huso). */
function fmtSheetDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

// Rampas DS FIJAS (nunca white-label) resueltas por esquema para props de color
// de iconos lucide (className no las expresa). Valores verbatim de TOKENS.md:
// ember-700 (light globals.css/LIGHT_SCHEME_VARS #C23E14, dark #FFB79E) y ink-300
// (light #A8B1BD, dark #414C5A). `text-on-ember` = ink-950 #0B0E13, constante en
// ambos modos (icono casi negro sobre el fondo ember-500).
const EMBER_700_ICON = { light: '#C23E14', dark: '#FFB79E' } as const
const INK_300 = { light: '#A8B1BD', dark: '#414C5A' } as const
const ON_EMBER = '#0B0E13'

// className→color del glyph Calendar: el header web lo pinta `text-sport-500`
// (ActiveProgramSection.tsx:90, rampa de marca verbatim SIN contrast-clamp) — con
// cssInterop la clase brand-aware colorea el trazo (mismo patron que Flame en
// StreakRibbon). Sin registro, lucide-react-native ignora className.
cssInterop(Calendar, { className: { target: 'style', nativeStyleToProp: { color: true } } })

/**
 * §8 ActiveProgramSection (web `program/ActiveProgramSection.tsx`): nombre del
 * programa + badge "Semana X de Y" + ProgramPhaseBar (E1-05) + cola de pendientes
 * (E1-19, delta Fase L: dias pasados sin registrar → CTA "Recuperar Día X") +
 * day-cards (today/done/pending/upcoming) + link "Ver entreno de hoy →".
 */
export function ActiveProgramSection({
  program,
  currentWeek,
  totalWeeks,
  planDays,
  pending,
  todayPlanId,
  weekVariant = null,
  onStart,
  onRecover,
}: {
  program: Program | null
  currentWeek: number
  totalWeeks: number
  planDays: PlanDayView[]
  pending: PendingDay[]
  todayPlanId: string | null
  // Variante A/B EFECTIVA del ciclo (solo en programas ab_mode); null = sin A/B →
  // sin sufijo. El shell la computa (resolveEffectiveWeekVariant). Espejo del sufijo
  // web `{abMode ? ` · Sem ${activeVariant}` : ''}` (ActiveProgramSection.tsx:95).
  weekVariant?: 'A' | 'B' | null
  /** Entreno normal / repetir hoy (sin params). `origin` = rect del day-card para que el Despegue
   *  nazca de la tarjeta clickeada (null ⇒ el morph cae a su origen sintético). */
  onStart: (planId: string, origin?: MorphOrigin | null) => void
  /** Recuperar un dia pendiente → ejecutor con param `recuperar` (banner ambar). */
  onRecover: (planId: string, dateIso: string) => void
}) {
  const { theme, resolvedScheme } = useTheme()
  // Sheet doble intencion (E1.7): el day-card de un dia YA HECHO de OTRO dia lo abre; hoy/pendiente/
  // futuro navegan directo. Guarda la vista tocada para pintar dia/fecha del subtitulo.
  const [sheetView, setSheetView] = useState<PlanDayView | null>(null)

  // Enrutado por estado del day-card:
  //  · done && !isToday → sheet "Ya hiciste este entrenamiento" (revisar/repetir).
  //  · pending          → recuperar (param `recuperar`, banner ambar, se entrena hoy).
  //  · resto (today/upcoming/done-hoy) → navegacion directa (comportamiento editable actual).
  function handleDayPress(view: PlanDayView, origin: MorphOrigin | null) {
    if (view.status === 'done' && !view.isToday) { setSheetView(view); return }
    if (view.status === 'pending') { onRecover(view.plan.id, view.dateIso); return }
    onStart(view.plan.id, origin)
  }

  // Sin programa activo — web `ActiveProgramSection.tsx:26-34` hace early return de
  // esta card guia ANTES de tocar planes (misma precedencia que aca). Espejo 1:1:
  // icono Calendar 40 muted (h-10 w-10 text-muted), titulo strong bold (font-bold
  // text-strong, base 16 sin clase de tamano), subtitulo xs muted con -mt-2.
  if (!program) {
    return (
      <Card padding="lg" style={{ alignItems: 'center' }}>
        <Calendar size={40} color={theme.mutedForeground} />
        <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 16, textAlign: 'center' }}>Sin programa activo</Text>
        <Text className="text-muted" style={{ marginTop: -8, fontFamily: FONT.ui, fontSize: 13, textAlign: 'center' }}>Pídele a tu coach que te asigne uno</Text>
      </Card>
    )
  }

  const oldestPending = pending[0] ?? null

  // Programa sin dias visibles esta semana (variante A/B activa sin planes) — web
  // hace early return de una card guia (ActiveProgramSection.tsx:52-58) antes de
  // renderizar header/phasebar/pendientes.
  if (planDays.length === 0) {
    return (
      <Card padding="lg">
        <Text className="text-sm text-muted" style={{ textAlign: 'center' }}>
          No hay días visibles para esta semana del programa.
        </Text>
      </Card>
    )
  }

  return (
    <>
    <Card padding="md" style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
          {/* Web h-4 w-4 (16) text-sport-500 stroke default 2 (ActiveProgramSection.tsx:90). */}
          <Calendar size={16} className="text-sport-500" strokeWidth={2} />
          <Text className="text-strong" numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, fontFamily: FONT.displayBold, fontSize: 16 }}>{program.name}</Text>
        </View>
        <Badge tone="sport" variant="soft">Semana {currentWeek} de {totalWeeks}{weekVariant ? ` · Sem ${weekVariant}` : ''}</Badge>
      </View>

      <ProgramPhaseBar phases={program.phases} currentWeek={currentWeek} totalWeeks={totalWeeks} />

      {oldestPending ? (
        <TouchableOpacity
          testID="program-pending-cta"
          onPress={() => onRecover(oldestPending.planId, oldestPending.dateIso)}
          activeOpacity={0.82}
          accessibilityRole="button"
          className="rounded-control border border-ember-200 bg-ember-100"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}
        >
          <View className="bg-ember-500" style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={18} color={ON_EMBER} strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-ember-700" style={{ fontFamily: FONT.uiBold, fontSize: 13 }}>
              {pending.length === 1 ? 'Tenés 1 día pendiente' : `Tenés ${pending.length} días pendientes`} esta semana
            </Text>
            <Text className="text-ember-700/80" numberOfLines={1} style={{ fontFamily: FONT.uiSemibold, fontSize: 11.5, marginTop: 2 }}>
              Recuperar Día {oldestPending.dayOfWeek} · {oldestPending.dayLabel}
            </Text>
          </View>
          <ArrowRight size={16} color={EMBER_700_ICON[resolvedScheme]} />
        </TouchableOpacity>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 2 }}>
        {planDays.map((d) => (
          <DayCard key={d.plan.id} view={d} onPress={(origin) => handleDayPress(d, origin)} />
        ))}
      </ScrollView>

      {todayPlanId ? (
        <TouchableOpacity onPress={() => onStart(todayPlanId)} activeOpacity={0.7} accessibilityRole="button">
          <Text className="text-sport-600" style={{ textAlign: 'center', fontFamily: FONT.uiBold, fontSize: 11 }}>Ver entreno de hoy →</Text>
        </TouchableOpacity>
      ) : null}
    </Card>

    <DoubleIntentSheet
      view={sheetView}
      onClose={() => setSheetView(null)}
      onRepeat={(id) => { setSheetView(null); onStart(id) }}
    />
    </>
  )
}

/**
 * Bottom-sheet doble intencion (E1.7, mockup concepto-a-v33): tras tocar un day-card de un dia YA
 * HECHO de OTRO dia. "Revisar y editar" (destacada) → abre los registros de ese dia; "Repetir hoy" →
 * nueva sesion de hoy; Cancelar. Theme-aware (nivel dashboard, claro/oscuro + safe areas via Sheet).
 *
 * DECISION RN (justificada): "Revisar y editar" queda DESHABILITADA con sublabel "Disponible pronto".
 * El guardado del ejecutor RN escribe SIEMPRE el log de HOY (habla PostgREST directo); el solo-UPDATE
 * por `target_date` que edita la fecha pasada es un server action WEB (E1.5), aun no portado a RN. Si
 * habilitaramos "editar", el banner diria "editando el martes" pero cada serie crearia un log NUEVO de
 * hoy → duplicaria en vez de corregir, violando el invariante "editar jamas duplica" del mockup. Por eso
 * el unico camino accionable aqui es "Repetir hoy" (semantica honesta); el editar llega en ola posterior
 * (reactivara un `onReview` que navegue con el param `fecha`, ya soportado por [planId].tsx + RecoveryBanner).
 */
function DoubleIntentSheet({
  view,
  onClose,
  onRepeat,
}: {
  view: PlanDayView | null
  onClose: () => void
  onRepeat: (planId: string) => void
}) {
  const { theme } = useTheme()
  const dow = view?.plan.day_of_week ?? 1
  // Fecha real de la sesion a revisar: la del log (doneOnDate si fue recuperado) o la propia del dia.
  const reviewDate = view ? (view.doneOnDate ?? view.dateIso) : null

  return (
    <Sheet
      open={!!view}
      onClose={onClose}
      title="Ya hiciste este entrenamiento"
      snapPoints={['42%']}
      dynamicSizing
    >
      <View style={{ gap: 16 }}>
        {view ? (
          <View style={{ gap: 2 }}>
            <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 15 }}>
              {view.plan.title} · {DAY_FULL[dow]} — Día {dow}
            </Text>
            {reviewDate ? (
              <Text className="text-muted" style={{ fontFamily: FONT.ui, fontSize: 12.5, textTransform: 'capitalize' }}>
                {fmtSheetDate(reviewDate)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Revisar y editar — DESHABILITADA en RN (ver nota del componente). */}
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          className="rounded-control border border-subtle bg-surface-sunken/30"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, opacity: 0.55 }}
        >
          <View className="bg-surface-sunken" style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
            <Pencil size={17} color={theme.mutedForeground} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 14 }}>Revisar y editar</Text>
            <Text className="text-muted" numberOfLines={1} style={{ fontFamily: FONT.ui, fontSize: 11.5, marginTop: 1 }}>Disponible pronto</Text>
          </View>
        </View>

        {/* Repetir hoy — sesion nueva de hoy (funcional en RN). */}
        <TouchableOpacity
          testID="double-intent-repeat"
          onPress={() => view && onRepeat(view.plan.id)}
          activeOpacity={0.85}
          accessibilityRole="button"
          className="rounded-control border border-sport-500 bg-sport-100"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}
        >
          <View className="bg-sport-500" style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={17} color="#fff" strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-sport-600" style={{ fontFamily: FONT.uiBold, fontSize: 14 }}>Repetir hoy</Text>
            <Text className="text-muted" numberOfLines={2} style={{ fontFamily: FONT.ui, fontSize: 11.5, marginTop: 1 }}>Empieza de cero; tus marcas de esa vez quedan como referencia</Text>
          </View>
          <ChevronRight size={18} color={theme.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" style={{ paddingVertical: 6 }}>
          <Text className="text-muted" style={{ textAlign: 'center', fontFamily: FONT.uiSemibold, fontSize: 13.5 }}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  )
}

function DayCard({ view, onPress }: { view: PlanDayView; onPress: (origin: MorphOrigin | null) => void }) {
  const { theme, resolvedScheme } = useTheme()
  // Ref medible: al tocar la tarjeta se mide su rect real en ventana para que el Despegue nazca EXACTO
  // de la day-card clickeada (mismo patrón que el CTA del hero). Si la medición falla → origen sintético.
  const ref = useRef<View>(null)
  const { plan, status, isToday, doneOnLabel } = view
  const dow = plan.day_of_week ?? 1
  const done = status === 'done'
  const pending = status === 'pending'
  // "Hecho el jueves" solo cuando el dia se cerro por una sesion de OTRO dia (recuperacion):
  // label discreto que espeja el copy web (doneOnLabel). Done en su propia fecha → "Día N".
  const doneElsewhere = done && !!doneOnLabel

  // Superficie y neutros via clases DS (theme + white-label aware): hoy=sport,
  // pendiente=ember, resto=neutro. Espejo de web WorkoutPlanCard.tsx:48-84.
  const cardClass = isToday ? 'border-sport-500 bg-sport-100' : pending ? 'border-ember-200 bg-ember-100' : 'border-subtle bg-surface-card'
  const labelClass = isToday ? 'text-sport-600' : pending ? 'text-ember-700' : 'text-subtle'
  const pieClass = pending ? 'text-ember-700' : 'text-subtle'
  // Play (hoy) = sport-600 resuelto por esquema (dark aclara el foreground); web usa
  // text-sport-600, no sport-500. Solo se deriva en la card de hoy.
  const playColor = resolvedScheme === 'dark' ? deriveSportTokens(theme.primary).dark['600'] : deriveSportTokens(theme.primary).ramp['600']

  const a11yLabel = pending
    ? `${plan.title} · pendiente, recuperar`
    : isToday
      ? `${plan.title} · hoy`
      : doneElsewhere
        ? `${plan.title} · hecho el ${doneOnLabel!.toLowerCase()}`
        : plan.title

  return (
    // Wrapper medible (patrón del hero): `collapsable={false}` evita que Android colapse el View y
    // measureInWindow devuelva 0. El wrapper se ciñe al TouchableOpacity (width 96) → su rect == la card.
    <View ref={ref} collapsable={false}>
      <TouchableOpacity
        testID={`program-day-${plan.id}`}
        onPress={() => measureMorphOrigin(ref.current, theme.radius.control, (origin) => onPress(origin))}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        className={`rounded-control border ${cardClass}`}
        style={{ width: 96, padding: 12 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text className={labelClass} style={{ fontFamily: FONT.uiExtra, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {DAY_SHORT[dow]}
          </Text>
          {done ? (
            <CheckCircle2 size={14} color={theme.success} strokeWidth={2.4} />
          ) : isToday ? (
            <Play size={12} color={playColor} strokeWidth={2.6} />
          ) : pending ? (
            <View className="bg-ember-500" style={{ width: 8, height: 8, borderRadius: 4 }} />
          ) : (
            <ChevronRight size={13} color={INK_300[resolvedScheme]} />
          )}
        </View>
        <Text className="text-strong" numberOfLines={2} style={{ marginTop: 6, fontFamily: FONT.uiBold, fontSize: 13, lineHeight: 16 }}>{plan.title}</Text>
        <Text className={pieClass} numberOfLines={1} style={{ marginTop: 2, fontSize: 10.5, fontFamily: pending ? FONT.uiBold : FONT.ui }}>
          {pending ? 'Pendiente' : doneElsewhere ? `Hecho el ${doneOnLabel!.toLowerCase()}` : `Día ${dow}`}
        </Text>
      </TouchableOpacity>
    </View>
  )
}
