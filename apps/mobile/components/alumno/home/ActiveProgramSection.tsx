import { useRef, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { ArrowRight, Calendar, CheckCircle2, ChevronRight, CircleDashed, Pencil, Play, RotateCcw } from 'lucide-react-native'
import { cssInterop } from 'nativewind'
import { deriveSportTokens } from '@eva/brand-kit'
import { useTheme } from '../../../context/ThemeContext'
import { getTodayInSantiago } from '../../../lib/date-utils'
import { FONT } from '../../../lib/typography'
import { Badge } from '../../Badge'
import { Card } from '../../Card'
import { Sheet } from '../../Sheet'
import { ProgramPhaseBar } from './ProgramPhaseBar'
import { measureMorphOriginSafe, useTriggerMorphHide, type MorphOrigin } from '../workout/v3/session-morph'
import { DAY_FULL, DAY_SHORT } from './types'
import type { PendingDay, PlanDayView, Program } from './types'

/** "martes 15 de julio" — dia calendario es-CL desde un ymd (mediodia UTC evita cruce de huso). */
function fmtSheetDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

// Rampas DS FIJAS (nunca white-label) resueltas por esquema para props de color
// de iconos lucide (className no las expresa). Valores verbatim de `global.css`:
// warning-700 (light #8F5A05, dark #FFD489) y ink-300 (light #A8B1BD, dark #414C5A).
// El icono sobre warning-500 (#F5A524) usa ink-950 #0B0E13 (`text-on-warning`),
// constante en ambos modos.
// QA3: el bloque "día pendiente" pasó de la rampa `ember` a `warning` — el rojo-naranja
// se leía como error y no como el aviso ámbar informativo que es.
const WARNING_700_ICON = { light: '#8F5A05', dark: '#FFD489' } as const
const INK_300 = { light: '#A8B1BD', dark: '#414C5A' } as const
const ON_WARNING = '#0B0E13'

// className→color del glyph Calendar: el header web lo pinta `text-sport-500`
// (ActiveProgramSection.tsx:90, rampa de marca verbatim SIN contrast-clamp) — con
// cssInterop la clase brand-aware colorea el trazo (mismo patron que Flame en
// StreakRibbon). Sin registro, lucide-react-native ignora className.
cssInterop(Calendar, { className: { target: 'style', nativeStyleToProp: { color: true } } })

/**
 * §8 ActiveProgramSection (web `program/ActiveProgramSection.tsx`): nombre del
 * programa + badge "Semana X de Y" + ProgramPhaseBar (E1-05) + cola de pendientes
 * (E1-19, delta Fase L: dias pasados sin registrar → CTA "Recuperar Día X") +
 * day-cards (today/done/pending/upcoming). El link "Ver entreno de hoy →" se
 * RETIRO (decision CEO 2026-07-25): duplicaba el day-card de hoy y el hero.
 */
export function ActiveProgramSection({
  program,
  currentWeek,
  totalWeeks,
  planDays,
  pending,
  weekVariant = null,
  onStart,
  onRecover,
  onReview,
}: {
  program: Program | null
  currentWeek: number
  totalWeeks: number
  planDays: PlanDayView[]
  pending: PendingDay[]
  // Variante A/B EFECTIVA del ciclo (solo en programas ab_mode); null = sin A/B →
  // sin sufijo. El shell la computa (resolveEffectiveWeekVariant). Espejo del sufijo
  // web `{abMode ? ` · Sem ${activeVariant}` : ''}` (ActiveProgramSection.tsx:95).
  weekVariant?: 'A' | 'B' | null
  /** Entreno normal / repetir hoy. `origin` = rect del day-card para que el Despegue nazca de la tarjeta
   *  clickeada (null ⇒ el morph cae a su origen sintético). `label` = texto real del trigger para la
   *  píldora del clon (solo se pinta en rects anchos; las day-cards angostas lo ignoran). `repeatDate` =
   *  día ya hecho que se repite hoy → viaja como param `repetir` y precarga las series con lo registrado
   *  ese día (instancia NUEVA: el log del día original no se toca). */
  onStart: (planId: string, origin?: MorphOrigin | null, label?: string, repeatDate?: string) => void
  /** Recuperar un dia pendiente → ejecutor con param `recuperar` (banner ambar). `origin` = rect del
   *  trigger (banner o day-card) para que el Despegue nazca de él, igual que el CTA y las day-cards. */
  onRecover: (planId: string, dateIso: string, origin?: MorphOrigin | null, label?: string) => void
  /** "Revisar y editar" del sheet: abre los registros de esa sesión. `sessionDate` = fecha REAL del log
   *  (`doneOnDate ?? dateIso`) y `isTodayCell` = la celda tocada es la de hoy; el caller traduce eso a
   *  los params del ejecutor con `buildWorkoutDoneEditParams` (día pasado ⇒ `?fecha=` solo-UPDATE).
   *  Sin esta prop el sheet no ofrece la opción. */
  onReview?: (planId: string, sessionDate: string, isTodayCell: boolean) => void
}) {
  const { theme, resolvedScheme } = useTheme()
  // Sheet doble intencion (E1.7): lo abre el day-card de un dia YA HECHO (hoy incluido, paridad web) y
  // el de un dia a medias de OTRO dia; hoy-a-medias/pendiente/futuro navegan directo. Guarda la vista
  // tocada para pintar dia/fecha del subtitulo.
  const [sheetView, setSheetView] = useState<PlanDayView | null>(null)
  // Banner de pendientes: dispara el MISMO Despegue que el CTA/day-cards. Mide su rect y se oculta
  // durante el morph (el clon lo reemplaza).
  const bannerRef = useRef<View>(null)
  const { hidden: bannerHidden, hide: hideBanner } = useTriggerMorphHide()

  // Enrutado por estado del day-card:
  //  · done (HOY incluido)     → sheet "Ya hiciste este entrenamiento" (revisar/repetir). Paridad web
  //    QA7 (`WorkoutPlanCard.tsx:153`, `opensSheet = done || (inProgress && !isToday)`): antes el día
  //    hecho HOY entraba directo al ejecutor saltándose la ventanita, y el hero de esta misma pantalla
  //    sí la abría → dos comportamientos para el mismo hecho. En ese caso el sheet sale sin "Repetir
  //    hoy" (`showRepeat` false, la sesión ya es de hoy) y "Revisar y editar" navega con
  //    `{ desde: 'hecho' }` (flujo normal de hoy, jamás `?fecha=<hoy>` — guard del incidente 2026-07-26).
  //  · in_progress && !isToday → MISMO sheet con copy "Entrenamiento incompleto" (spec
  //    `workout-day-in-progress`): la sesión de ese día quedó a medias y el camino sigue siendo el de
  //    siempre (editar esa fecha / repetir hoy), solo cambia lo que se le dice al alumno.
  //  · in_progress && isToday  → Despegue directo (continuar la sesión de hoy, NUNCA el sheet: ése era
  //    el trap del incidente P0 — "Ya hiciste este entrenamiento" a mitad de entreno).
  //  · pending                 → recuperar (param `recuperar`, banner ambar, se entrena hoy) — vía Despegue.
  //  · resto (today/upcoming) → Despegue directo.
  function handleDayPress(view: PlanDayView, origin: MorphOrigin | null) {
    if (view.status === 'done' || (view.status === 'in_progress' && !view.isToday)) { setSheetView(view); return }
    // Las day-cards son angostas (96px) → el overlay NO pinta la etiqueta (solo rects anchos); se pasa el
    // título del plan por si la medición cae al origen sintético (ancho), donde sí se veria.
    if (view.status === 'pending') { onRecover(view.plan.id, view.dateIso, origin, view.plan.title); return }
    onStart(view.plan.id, origin, view.plan.title)
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
        // Wrapper medible + ocultable: el banner de pendientes dispara el MISMO Despegue que el CTA/cards
        // (mide su rect, se oculta durante el vuelo del clon).
        // `dark:bg-warning-100/[0.16]`: en dark `--color-warning-100` ES warning-500 sólido (pensado
        // para usarse con alpha, ver Badge.tsx) — sin el alpha el bloque quedaría naranja pleno.
        <View ref={bannerRef} collapsable={false} style={{ opacity: bannerHidden ? 0 : 1 }}>
          <TouchableOpacity
            testID="program-pending-cta"
            onPress={() => {
              hideBanner()
              // El banner es ancho → la píldora del Despegue SÍ muestra la etiqueta: texto de recuperación.
              // `…Safe` = la navegación NO cuelga de que la medición nativa conteste (QA5 · MIUI): si no
              // contesta en 120ms se recupera igual con origen sintético.
              measureMorphOriginSafe(bannerRef.current, theme.radius.control, (origin) =>
                onRecover(oldestPending.planId, oldestPending.dateIso, origin, 'Recuperar entrenamiento'),
              )
            }}
            activeOpacity={0.82}
            accessibilityRole="button"
            className="rounded-control border border-warning-500/25 bg-warning-100 dark:bg-warning-100/[0.16]"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}
          >
            <View className="bg-warning-500" style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
              <RotateCcw size={18} color={ON_WARNING} strokeWidth={2.25} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-warning-700" style={{ fontFamily: FONT.uiBold, fontSize: 13 }}>
                {pending.length === 1 ? 'Tenés 1 día pendiente' : `Tenés ${pending.length} días pendientes`} esta semana
              </Text>
              <Text className="text-warning-700/80" numberOfLines={1} style={{ fontFamily: FONT.uiSemibold, fontSize: 11.5, marginTop: 2 }}>
                {/* Verbo por estado (paridad web WorkoutRecoverBanner): a medias = «Continuar». */}
                {oldestPending.status === 'in_progress' ? 'Continuar' : 'Recuperar'} Día {oldestPending.dayOfWeek} · {oldestPending.dayLabel}
              </Text>
            </View>
            <ArrowRight size={16} color={WARNING_700_ICON[resolvedScheme]} />
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 2 }}>
        {planDays.map((d) => (
          <DayCard key={d.plan.id} view={d} onPress={(origin) => handleDayPress(d, origin)} />
        ))}
      </ScrollView>
    </Card>

    <DoubleIntentSheet
      view={sheetView}
      onClose={() => setSheetView(null)}
      // `repeatDate` = fecha REAL de la sesión de ese día (la del log si fue recuperado): viaja como
      // param `repetir` para precargar cada serie con lo que se registró esa vez.
      onRepeat={(id, repeatDate) => { setSheetView(null); onStart(id, null, 'Repetir hoy', repeatDate ?? undefined) }}
      // Revisar: los días que abren este sheet son SIEMPRE de otra fecha (hoy navega directo), así que
      // acá `isTodayCell` es false y el caller manda `?fecha=` → editor de día pasado (solo-UPDATE).
      onReview={onReview ? (id, sessionDate, isTodayCell) => { setSheetView(null); onReview(id, sessionDate, isTodayCell) } : undefined}
    />
    </>
  )
}

/**
 * Bottom-sheet doble intención (E1.7, mockup concepto-a-v33): tras tocar un day-card de un día YA
 * HECHO de OTRO día. "Revisar y editar" (destacada) → abre los registros de ese día; "Repetir hoy" →
 * nueva sesión de hoy PRECARGADA con lo registrado esa vez; Cancelar. Theme-aware (nivel dashboard,
 * claro/oscuro + safe areas vía Sheet).
 *
 * "Revisar y editar" ya es accionable TAMBIÉN para días pasados (editor de día pasado RN): el motor
 * (`useWorkoutSession(..., editDate)`) conmuta a SOLO-UPDATE sobre la ventana de esa fecha y corrige la
 * fila existente sin insertar jamás una nueva — el invariante "editar jamás duplica" lo garantiza el
 * motor, no la ausencia del botón. Antes quedaba deshabilitada con "Disponible pronto" porque el
 * guardado RN escribía SIEMPRE el log de HOY (el solo-UPDATE existía sólo como server action web, E1.5)
 * y habilitarla habría duplicado series en vez de corregirlas. `onReview` recibe la FECHA REAL de la
 * sesión + si la celda es la de hoy, y el caller decide el param (`?fecha=` pasado vs `?desde=hecho`
 * hoy) con `buildWorkoutDoneEditParams` — espejo del `buildWorkoutDoneEditHref` de la web. Sin `onReview`
 * la opción no se pinta (nada que ofrecer si el caller no sabe navegar).
 *
 * "Repetir hoy" NO se ofrece cuando la sesión hecha es de HOY (decisión CEO): el índice único de la DB
 * es por día, así que repetir hoy sobre hoy pisaría la misma fila. Cuenta la FECHA REAL del log
 * (`doneOnDate ?? dateIso`), no el día del day-card — un día pasado recuperado hoy también queda fuera.
 * Espejo del `showRepeat` de la web (WorkoutDoneSheet / WorkoutPlanCard.tsx:183).
 *
 * Exportado: lo reusa también el hero de la home cuando el entreno de HOY ya está completado (MOBILE-2 /
 * paridad web WorkoutHeroCard: el overlay "Entrenamiento completado" abre esta misma ventanita en vez de
 * dejar un CTA muerto).
 *
 * DÍA PASADO A MEDIAS (spec `workout-day-in-progress`): el mismo sheet, con el título "Entrenamiento
 * incompleto" y un subtítulo honesto. Las acciones NO cambian (misma semántica: editar esa fecha o
 * repetir hoy); lo que se corrige es la mentira de decirle "ya hiciste este entrenamiento" a alguien que
 * dejó series sin registrar. El día de HOY a medias jamás llega acá: su day-card navega directo al
 * ejecutor a continuar. OJO: en un día a medias las series que NO se registraron no existen como fila,
 * así que el modo solo-UPDATE las rechaza (copy honesto en la fila de la serie) — corregir lo registrado
 * sí funciona; completarlo se hace con "Repetir hoy".
 */
export function DoubleIntentSheet({
  view,
  onClose,
  onRepeat,
  onReview,
}: {
  view: PlanDayView | null
  onClose: () => void
  /** `repeatDate` = fecha real de la sesión que se repite (param `repetir` del ejecutor). */
  onRepeat: (planId: string, repeatDate: string | null) => void
  /**
   * Abre los registros de la sesión para corregirlos. `sessionDate` = fecha REAL de la sesión
   * (`doneOnDate ?? dateIso`); `isTodayCell` = la celda tocada es la de hoy. El caller traduce eso a los
   * params del ejecutor (`buildWorkoutDoneEditParams`): día pasado ⇒ `?fecha=` (solo-UPDATE), hoy ⇒
   * flujo normal. Sin esta prop la opción no se ofrece.
   */
  onReview?: (planId: string, sessionDate: string, isTodayCell: boolean) => void
}) {
  const { theme } = useTheme()
  const dow = view?.plan.day_of_week ?? 1
  // Fecha real de la sesión a revisar: la del log (doneOnDate si fue recuperado) o la propia del día.
  const reviewDate = view ? (view.doneOnDate ?? view.dateIso) : null
  // Repetir hoy sobre hoy pisaria la misma fila (indice unico por dia) → la opcion no se ofrece. El
  // criterio es la FECHA REAL de la sesion hecha, no si el day-card es el de hoy: un dia pasado que se
  // RECUPERO hoy tiene `isToday === false` pero su log ya es de HOY. Con `!view.isToday` se ofrecia
  // Repetir, el validador de la ruta descartaba la fecha (== hoy) y el ejecutor abria sin semilla ni
  // banner, pisando la fila de hoy serie por serie. Espejo exacto del `showRepeat` de la web
  // (WorkoutPlanCard.tsx:183: `(doneOnDate ?? dateIso) !== getTodayInSantiago().iso`).
  const showRepeat = !!reviewDate && reviewDate !== getTodayInSantiago().iso
  // Revisar es accionable para HOY y para días PASADOS (el motor RN ya tiene el modo solo-UPDATE); lo
  // único que la apaga es que el caller no sepa navegar o que no haya fecha de sesión que abrir.
  const canReview = !!reviewDate && !!onReview
  // Copy del sublabel: para hoy son "tus registros de hoy"; para un día pasado, los de ESE día (misma
  // copia que el sheet web, WorkoutDoneSheet.tsx:96).
  const reviewIsToday = !!view?.isToday || reviewDate === getTodayInSantiago().iso
  // Día a medias → otro título/subtítulo, mismas acciones (ver nota del componente).
  const incomplete = view?.status === 'in_progress'

  // `nativeModal`: gorhom 5.2.14 bajo reanimated 4 puede montar el sheet fuera de pantalla si el
  // hosting container todavía no midió (ver SheetProps.nativeModal). `dynamicSizing` se retira
  // porque en esta ruta el content-hug es nativo y `snapPoints` pasa a ser el tope de max-height
  // — mismo alto resultante, una prop menos que engañe al próximo que lea esto.
  return (
    <Sheet
      open={!!view}
      onClose={onClose}
      nativeModal
      title={incomplete ? 'Entrenamiento incompleto' : 'Ya hiciste este entrenamiento'}
      snapPoints={['42%']}
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
            {incomplete ? (
              <Text className="text-muted" style={{ fontFamily: FONT.ui, fontSize: 12.5, marginTop: 2 }}>
                Esa sesión quedó con series sin registrar.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Revisar y editar — abre los registros de esa sesión para corregirlos: día pasado ⇒ modo
            solo-UPDATE (`?fecha=`), hoy ⇒ flujo normal. Sólo se omite si el caller no pasó `onReview`. */}
        {canReview ? (
          <TouchableOpacity
            testID="double-intent-review"
            onPress={() => view && reviewDate && onReview?.(view.plan.id, reviewDate, !!view.isToday)}
            activeOpacity={0.85}
            accessibilityRole="button"
            className="rounded-control border border-sport-500/25 bg-sport-100 dark:bg-sport-100/[0.16]"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}
          >
            <View className="bg-sport-500" style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
              <Pencil size={17} color="#fff" strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 14 }}>Revisar y editar</Text>
              <Text className="text-muted" numberOfLines={2} style={{ fontFamily: FONT.ui, fontSize: 11.5, marginTop: 1 }}>
                {reviewIsToday ? 'Abre tus registros de hoy y corrige lo que quieras' : 'Abre tus registros de ese día y corrige lo que quieras'}
              </Text>
            </View>
            <ChevronRight size={18} color={theme.mutedForeground} />
          </TouchableOpacity>
        ) : null}

        {/* Repetir hoy — instancia NUEVA de hoy, con cada serie precargada con lo que se registró esa
            vez (editable). No se ofrece cuando la sesión hecha ya es de HOY (decisión CEO, ver nota). */}
        {showRepeat ? (
          <TouchableOpacity
            testID="double-intent-repeat"
            onPress={() => view && onRepeat(view.plan.id, reviewDate)}
            activeOpacity={0.85}
            accessibilityRole="button"
            className="rounded-control border border-sport-500/25 bg-sport-100 dark:bg-sport-100/[0.16]"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }}
          >
            <View className="bg-sport-500" style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
              <RotateCcw size={17} color="#fff" strokeWidth={2.25} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 14 }}>Repetir hoy</Text>
              <Text className="text-muted" numberOfLines={2} style={{ fontFamily: FONT.ui, fontSize: 11.5, marginTop: 1 }}>Sesión nueva con tus valores de esa vez ya cargados</Text>
            </View>
            <ChevronRight size={18} color={theme.mutedForeground} />
          </TouchableOpacity>
        ) : null}

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
  // Ocultar la card real durante el Despegue (el clon la reemplaza) — SÓLO cuando de verdad morfea:
  // los estados que abren el sheet (done, hoy incluido) o recuperan (pending) NO lanzan el morph.
  const { hidden: cardHidden, hide: hideCard } = useTriggerMorphHide()
  const { plan, status, isToday, doneOnLabel } = view
  const dow = plan.day_of_week ?? 1
  const done = status === 'done'
  const pending = status === 'pending'
  // Tercera visual (spec `workout-day-in-progress`): sesión empezada sin cerrar. Sobria y en tokens —
  // círculo punteado en color de marca + pie "En progreso"; el día de HOY conserva su superficie sport
  // (hoy manda en el color) y un día pasado a medias se distingue del neutro con un borde sport tenue,
  // sin robarle el ámbar al pendiente (ése sí no tiene nada registrado).
  const inProgress = status === 'in_progress'
  // handleDayPress morfea en TODO salvo los estados que abren el sheet — done (hoy incluido) e
  // in_progress de otro día. Espejo exacto del `opensSheet` web (WorkoutPlanCard.tsx:153). Si esto se
  // desalinea de handleDayPress, la card queda invisible detrás del sheet (hideCard sin morph que la
  // reemplace). hoy/futuro/in_progress-hoy → Despegue (onStart); pending → Despegue de recuperación.
  const willMorph = !(done || (inProgress && !isToday))
  // "Hecho el jueves" solo cuando el dia se cerro por una sesion de OTRO dia (recuperacion):
  // label discreto que espeja el copy web (doneOnLabel). Done en su propia fecha → "Día N".
  const doneElsewhere = done && !!doneOnLabel

  // Superficie y neutros via clases DS (theme + white-label aware): hoy=sport,
  // pendiente=warning (ámbar informativo), resto=neutro. Espejo de web WorkoutPlanCard.tsx:48-84.
  // El alpha de `dark:bg-warning-100/[0.16]` es obligatorio (en dark el token es warning-500 sólido).
  const cardClass = isToday
    ? 'border-sport-500 bg-sport-100'
    : pending
      ? 'border-warning-500/25 bg-warning-100 dark:bg-warning-100/[0.16]'
      : inProgress
        ? 'border-sport-500/40 bg-surface-card'
        : 'border-subtle bg-surface-card'
  const labelClass = isToday ? 'text-sport-600' : pending ? 'text-warning-700' : inProgress ? 'text-sport-600' : 'text-subtle'
  const pieClass = pending ? 'text-warning-700' : inProgress ? 'text-sport-600' : 'text-subtle'
  // Play (hoy) = sport-600 resuelto por esquema (dark aclara el foreground); web usa
  // text-sport-600, no sport-500. Solo se deriva en la card de hoy.
  const playColor = resolvedScheme === 'dark' ? deriveSportTokens(theme.primary).dark['600'] : deriveSportTokens(theme.primary).ramp['600']

  const a11yLabel = pending
    ? `${plan.title} · pendiente, recuperar`
    : inProgress
      ? `${plan.title} · en progreso, ${isToday ? 'continuar' : 'revisar'}`
      : isToday
        ? `${plan.title} · hoy`
        : doneElsewhere
          ? `${plan.title} · hecho el ${doneOnLabel!.toLowerCase()}`
          : plan.title

  return (
    // Wrapper medible (patrón del hero): `collapsable={false}` evita que Android colapse el View y
    // measureInWindow devuelva 0. El wrapper se ciñe al TouchableOpacity (width 96) → su rect == la card.
    <View ref={ref} collapsable={false} style={{ opacity: cardHidden ? 0 : 1 }}>
      <TouchableOpacity
        testID={`program-day-${plan.id}`}
        onPress={() => {
          if (willMorph) hideCard()
          // QA5 (MIUI/HyperOS): la navegación NO puede colgar del callback de `measureInWindow` — en esos
          // ROMs a veces no dispara nunca y el tap quedaba MUERTO (la tarjeta ni siquiera abría el sheet).
          // `measureMorphOriginSafe` garantiza el disparo: rect si midió a tiempo, `null` si no (el Despegue
          // nace del origen sintético; los estados que abren el sheet ignoran el origin de todos modos).
          measureMorphOriginSafe(ref.current, theme.radius.control, (origin) => onPress(origin))
        }}
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
          ) : inProgress ? (
            // Círculo punteado = empezado sin cerrar (ni check verde ni punto ámbar de pendiente).
            <CircleDashed size={14} color={playColor} strokeWidth={2.4} />
          ) : isToday ? (
            <Play size={12} color={playColor} strokeWidth={2.6} />
          ) : pending ? (
            <View className="bg-warning-500" style={{ width: 8, height: 8, borderRadius: 4 }} />
          ) : (
            <ChevronRight size={13} color={INK_300[resolvedScheme]} />
          )}
        </View>
        <Text className="text-strong" numberOfLines={2} style={{ marginTop: 6, fontFamily: FONT.uiBold, fontSize: 13, lineHeight: 16 }}>{plan.title}</Text>
        <Text className={pieClass} numberOfLines={1} style={{ marginTop: 2, fontSize: 10.5, fontFamily: pending || inProgress ? FONT.uiBold : FONT.ui }}>
          {pending ? 'Pendiente' : inProgress ? 'En progreso' : doneElsewhere ? `Hecho el ${doneOnLabel!.toLowerCase()}` : `Día ${dow}`}
        </Text>
      </TouchableOpacity>
    </View>
  )
}
