import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ClipboardCheck,
  LineChart,
  Trash2,
} from 'lucide-react-native'
import {
  MOVEMENT_PATTERNS_V1,
  finalItemScore,
  summarizeAssessment,
  type MovementItemInput as CalcItemInput,
  type MovementPatternDef,
  type MovementPatternSlug,
  type MovementSummary,
} from '@eva/calc'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { useEntitlements } from '../../../lib/entitlements'
import {
  deleteMovementAssessment,
  finalizeMovementAssessment,
  getClientDraft,
  getClientFinals,
  getMovementClientName,
  saveMovementItem,
  type DraftAssessmentRow,
  type FinalAssessmentRow,
} from '../../../lib/movement-coach'
import { AppBackground } from '../../../components/AppBackground'
import { Card } from '../../../components/Card'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { ModuleOffNotice } from '../../../components/ModuleOffNotice'
import { toast } from '../../../components/Toast'
import {
  BAND_COLOR,
  BAND_LABEL,
  MovementDisclaimerNote,
  MovementEvolution,
  MovementHeader,
  MovementReportCard,
  PATTERN_LABEL,
  PriorityBadge,
  fmtShort,
} from '../../../components/movement/MovementShared'

/**
 * Detalle del alumno del modulo Evaluacion de movimiento (E6-04) — espejo mobile de
 * `apps/web/.../coach/movement/[clientId]` (ClientMovementReport) + `[clientId]/new` (MovementWizard).
 * En phone las dos superficies viven en UNA ruta con `mode`:
 *  - REPORTE: ultimo final + evolucion (>=2) + historial (con eliminar) + CTA Evaluar/Retomar.
 *  - WIZARD: 7 patrones (un paso por pantalla) + revision, con AUTOSAVE. Cada paso se persiste a
 *    AsyncStorage (resume instantaneo local) y al server via `/api/mobile/movement/item` (recalculo
 *    server-side + resume cross-device). Finalizar via `/api/mobile/movement/finalize`.
 *
 * MONEY-SAFETY: gate `hasModule('movement_assessment')` + ModuleOffNotice. Toda MUTACION va por los
 * endpoints (assertModule server-side); las LECTURAS del reporte por PostgREST (RLS del coach). El
 * scoring/banda del wizard es preview optimista — el server SIEMPRE recalcula (@eva/calc).
 */

type ScreenMode = 'report' | 'wizard'

export default function MovementClientScreen() {
  const { clientId, start } = useLocalSearchParams<{ clientId: string; start?: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const { hasModule, ready } = useEntitlements()
  const enabled = hasModule('movement_assessment')

  const [loading, setLoading] = useState(true)
  const [clientName, setClientName] = useState<string | null>(null)
  const [finals, setFinals] = useState<FinalAssessmentRow[]>([])
  const [draft, setDraft] = useState<DraftAssessmentRow | null>(null)
  const [mode, setMode] = useState<ScreenMode>('report')

  const reload = useCallback(async () => {
    if (!clientId) return
    const [f, d] = await Promise.all([getClientFinals(clientId), getClientDraft(clientId)])
    setFinals(f)
    setDraft(d)
  }, [clientId])

  useEffect(() => {
    if (!enabled || !clientId) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const [name, f, d] = await Promise.all([
        getMovementClientName(clientId),
        getClientFinals(clientId),
        getClientDraft(clientId),
      ])
      if (cancelled) return
      setClientName(name)
      setFinals(f)
      setDraft(d)
      setMode(start === '1' ? 'wizard' : 'report')
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [clientId, enabled, start])

  if (mode === 'wizard' && enabled && clientId) {
    return (
      <WizardView
        clientId={clientId}
        clientName={clientName}
        initialDraft={draft}
        onExit={() => setMode('report')}
        onFinalized={async () => {
          await reload()
          setMode('report')
        }}
      />
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <MovementHeader
        title={clientName ?? 'Alumno'}
        subtitle="Screening de movimiento"
        onBack={() => router.back()}
        showBadge
      />
      {!ready || (enabled && loading) ? (
        <EvaLoaderScreen subtitle="Cargando reporte…" />
      ) : !enabled ? (
        <ModuleOffNotice moduleKey="movement_assessment" />
      ) : (
        <ReportView
          clientId={clientId as string}
          finals={finals}
          hasDraft={draft != null}
          onStartWizard={() => setMode('wizard')}
          onReload={reload}
        />
      )}
    </SafeAreaView>
  )
}

/* ── Reporte + historial + evolucion ─────────────────────────────────────────── */
function ReportView({
  clientId,
  finals,
  hasDraft,
  onStartWizard,
  onReload,
}: {
  clientId: string
  finals: FinalAssessmentRow[]
  hasDraft: boolean
  onStartWizard: () => void
  onReload: () => Promise<void>
}) {
  const { theme } = useTheme()
  const latest = finals.length > 0 ? finals[finals.length - 1] : null
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function confirmDelete(id: string) {
    Alert.alert(
      'Eliminar evaluación',
      'El registro final es inmutable: para corregir hay que eliminarlo y volver a evaluar. ¿Eliminar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(id)
            try {
              await deleteMovementAssessment(id)
              await onReload()
              toast.success('Evaluación eliminada')
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
            } finally {
              setDeletingId(null)
            }
          },
        },
      ],
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      {latest ? (
        <>
          <MovementReportCard assessment={latest} />

          {finals.length >= 2 ? (
            <MovementEvolution finals={finals} />
          ) : (
            <Card variant="sunken" padding="md" style={styles.needTwoRow}>
              <LineChart size={17} color={theme.textSecondary} strokeWidth={2} />
              <Text style={[styles.needTwo, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
                Con dos o más evaluaciones finales verás aquí la evolución.
              </Text>
            </Card>
          )}

          {/* Historial — filas con semaforo + eliminar. */}
          <View>
            <Text style={[styles.histTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>
              Historial de evaluaciones
            </Text>
            <Card padding="none" style={{ overflow: 'hidden' }}>
              {[...finals].reverse().map((a, i) => (
                <View
                  key={a.id}
                  style={[
                    styles.histRow,
                    i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border } : null,
                  ]}
                >
                  <View
                    style={[
                      styles.histDot,
                      { backgroundColor: a.risk_band ? BAND_COLOR[a.risk_band] : theme.textSecondary },
                    ]}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.histBand, { color: theme.foreground, fontFamily: FONT.uiSemibold }]}>
                      {a.risk_band ? BAND_LABEL[a.risk_band] : '—'}
                    </Text>
                    <Text style={[styles.histMeta, { color: theme.mutedForeground, fontFamily: FONT.mono }]}>
                      {a.composite_score}/21 · {fmtShort(a.assessed_at)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID={`movement-delete-${a.id}`}
                    hitSlop={8}
                    disabled={deletingId === a.id}
                    onPress={() => confirmDelete(a.id)}
                    style={styles.histDel}
                  >
                    {deletingId === a.id ? (
                      <ActivityIndicator size="small" color={theme.destructive} />
                    ) : (
                      <Trash2 size={17} color={theme.destructive} strokeWidth={2} />
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          </View>

          <TouchableOpacity
            testID="movement-new-assessment"
            activeOpacity={0.85}
            onPress={onStartWizard}
            style={[styles.primaryCta, { backgroundColor: theme.primary }]}
          >
            <ClipboardCheck size={18} color="#fff" />
            <Text style={[styles.primaryCtaTxt, { fontFamily: FONT.uiBold }]}>
              {hasDraft ? 'Retomar borrador' : 'Nueva evaluación'}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <Card variant="sunken" padding="lg" style={styles.emptyCard} testID="movement-report-empty">
          <View style={[styles.emptyIcon, { backgroundColor: theme.muted }]}>
            <ClipboardCheck size={26} color={theme.mutedForeground} strokeWidth={1.75} />
          </View>
          <Text style={[styles.emptyText, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
            Este alumno aún no tiene screening de movimiento.
          </Text>
          <TouchableOpacity
            testID="movement-empty-cta"
            activeOpacity={0.85}
            onPress={onStartWizard}
            style={[styles.primaryCta, { backgroundColor: theme.primary, marginTop: 6 }]}
          >
            <ClipboardCheck size={18} color="#fff" />
            <Text style={[styles.primaryCtaTxt, { fontFamily: FONT.uiBold }]}>
              {hasDraft ? 'Retomar borrador' : 'Evaluar ahora'}
            </Text>
          </TouchableOpacity>
        </Card>
      )}

      <MovementDisclaimerNote style={{ marginTop: 20 }} />
    </ScrollView>
  )
}

/* ── Wizard de captura (7 patrones + revision, con autosave) ──────────────────── */
type ItemState = {
  score_left: number | null
  score_right: number | null
  score_single: number | null
  pain: boolean
  clearing_positive: boolean | null
  comment: string
}
type ItemsState = Record<MovementPatternSlug, ItemState>

function emptyItem(def: MovementPatternDef): ItemState {
  return {
    score_left: null,
    score_right: null,
    score_single: null,
    pain: false,
    clearing_positive: def.hasClearing ? false : null,
    comment: '',
  }
}

function initItems(saved: DraftAssessmentRow | null): ItemsState {
  const state = {} as ItemsState
  for (const def of MOVEMENT_PATTERNS_V1) {
    const row = saved?.items.find((i) => i.pattern === def.slug)
    state[def.slug] = row
      ? {
          score_left: row.score_left,
          score_right: row.score_right,
          score_single: row.score_single,
          pain: row.pain,
          clearing_positive: def.hasClearing ? (row.clearing_positive ?? false) : null,
          comment: row.comment ?? '',
        }
      : emptyItem(def)
  }
  return state
}

/** Dolor o descarte positivo fuerzan puntaje 0: se oculta el score y el item cuenta completo. */
function isForcedZero(def: MovementPatternDef, item: ItemState): boolean {
  return item.pain || (def.hasClearing && item.clearing_positive === true)
}
function isComplete(def: MovementPatternDef, item: ItemState): boolean {
  if (isForcedZero(def, item)) return true
  return def.isPerSide ? item.score_left != null && item.score_right != null : item.score_single != null
}
function toCalcInput(def: MovementPatternDef, item: ItemState): CalcItemInput {
  const forced = isForcedZero(def, item)
  return {
    pattern: def.slug,
    isPerSide: def.isPerSide,
    scoreLeft: item.score_left ?? (forced && def.isPerSide ? 0 : null),
    scoreRight: item.score_right ?? (forced && def.isPerSide ? 0 : null),
    scoreSingle: item.score_single ?? (forced && !def.isPerSide ? 0 : null),
    pain: item.pain,
    clearingPositive: item.clearing_positive,
  }
}

const cacheKey = (clientId: string) => `eva_movement_wizard_${clientId}`

function WizardView({
  clientId,
  clientName,
  initialDraft,
  onExit,
  onFinalized,
}: {
  clientId: string
  clientName: string | null
  initialDraft: DraftAssessmentRow | null
  onExit: () => void
  onFinalized: () => Promise<void>
}) {
  const { theme } = useTheme()
  const [items, setItems] = useState<ItemsState>(() => initItems(initialDraft))
  const [step, setStep] = useState(0) // 0..6 patrones, 7 revision
  const [assessmentId, setAssessmentId] = useState<string | null>(initialDraft?.id ?? null)
  const [notes, setNotes] = useState('')
  const [consent, setConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const resumed = (initialDraft?.items.length ?? 0) > 0

  // Rehidratar el paso en curso desde AsyncStorage (resume instantaneo, incluso sin red).
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey(clientId))
        if (!raw || !alive) return
        const parsed = JSON.parse(raw) as { items?: ItemsState; step?: number }
        if (parsed.items) setItems((prev) => ({ ...prev, ...parsed.items }))
        if (typeof parsed.step === 'number') setStep(Math.min(Math.max(0, parsed.step), MOVEMENT_PATTERNS_V1.length))
      } catch {
        /* cache ilegible: se ignora (el borrador server manda) */
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  const persistCache = useCallback(
    (nextItems: ItemsState, nextStep: number) => {
      void AsyncStorage.setItem(cacheKey(clientId), JSON.stringify({ items: nextItems, step: nextStep })).catch(
        () => {},
      )
    },
    [clientId],
  )

  const totalSteps = MOVEMENT_PATTERNS_V1.length
  const isReview = step >= totalSteps
  const def = isReview ? null : MOVEMENT_PATTERNS_V1[step]

  const partialTotal = useMemo(() => {
    let sum = 0
    for (const d of MOVEMENT_PATTERNS_V1) {
      const item = items[d.slug]
      if (!isComplete(d, item)) continue
      try {
        sum += finalItemScore(toCalcInput(d, item))
      } catch {
        /* item invalido => no suma */
      }
    }
    return sum
  }, [items])

  const allComplete = MOVEMENT_PATTERNS_V1.every((d) => isComplete(d, items[d.slug]))

  const previewSummary: MovementSummary | null = useMemo(() => {
    if (!allComplete) return null
    try {
      return summarizeAssessment(MOVEMENT_PATTERNS_V1.map((d) => toCalcInput(d, items[d.slug])))
    } catch {
      return null
    }
  }, [allComplete, items])

  function patch(slug: MovementPatternSlug, partial: Partial<ItemState>) {
    setItems((prev) => {
      const next = { ...prev, [slug]: { ...prev[slug], ...partial } }
      persistCache(next, step)
      return next
    })
  }

  function saveCurrent(onDone?: () => void) {
    if (!def) return
    const item = items[def.slug]
    const forced = isForcedZero(def, item)
    setSaveError(null)
    setSaving(true)
    void (async () => {
      try {
        const id = await saveMovementItem(clientId, {
          pattern: def.slug,
          score_left: def.isPerSide ? (item.score_left ?? (forced ? 0 : null)) : null,
          score_right: def.isPerSide ? (item.score_right ?? (forced ? 0 : null)) : null,
          score_single: def.isPerSide ? null : (item.score_single ?? (forced ? 0 : null)),
          pain: item.pain,
          clearing_positive: def.hasClearing ? (item.clearing_positive ?? false) : null,
          comment: item.comment.trim() || null,
        })
        setAssessmentId(id)
        onDone?.()
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'No se pudo guardar el paso.')
      } finally {
        setSaving(false)
      }
    })()
  }

  function goNext() {
    saveCurrent(() => {
      const next = step + 1
      setStep(next)
      persistCache(items, next)
    })
  }
  function goBack() {
    const prev = Math.max(0, step - 1)
    setStep(prev)
    persistCache(items, prev)
  }

  const canFinalize = allComplete && assessmentId != null && consent && !finalizing

  async function finalize() {
    if (!assessmentId) return
    setFinalizing(true)
    try {
      await finalizeMovementAssessment({
        clientId,
        assessmentId,
        notes: notes.trim() || null,
        consentAttested: consent,
      })
      await AsyncStorage.removeItem(cacheKey(clientId)).catch(() => {})
      toast.success('Evaluación finalizada')
      await onFinalized()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo finalizar.')
    } finally {
      setFinalizing(false)
    }
  }

  const SCORE_COLOR = ['#F4365A', '#F5A524', theme.primary, '#1FB877']

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      {/* Top bar: back al reporte + "Paso N de 7" + barra de progreso segmentada. */}
      <View style={styles.wizTop}>
        <TouchableOpacity testID="movement-wizard-exit" onPress={onExit} hitSlop={8} style={styles.wizBack}>
          <ChevronLeft size={18} color={theme.mutedForeground} />
          <Text style={[styles.wizBackTxt, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]} numberOfLines={1}>
            {clientName ?? 'Screening'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.wizStep, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
          {isReview ? 'Revisión' : `Paso ${step + 1} de ${totalSteps}`}
        </Text>
      </View>
      <View style={styles.progressRow}>
        {MOVEMENT_PATTERNS_V1.map((d, i) => (
          <View
            key={d.slug}
            style={[
              styles.progressSeg,
              {
                backgroundColor:
                  i < step || isReview ? theme.primary : i === step ? theme.primary + '66' : theme.border,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.wizBody}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {resumed && !isReview ? (
          <View style={[styles.resumeNote, { backgroundColor: '#F5A52418' }]}>
            <Text style={[styles.resumeTxt, { color: '#B4700A', fontFamily: FONT.uiSemibold }]}>
              Borrador retomado: los patrones ya puntuados se restauraron.
            </Text>
          </View>
        ) : null}

        {def ? (
          <View style={{ gap: 16 }}>
            <View>
              <Text style={[styles.eyebrow, { color: theme.primary, fontFamily: FONT.uiBold }]}>
                PASO {step + 1}
              </Text>
              <Text style={[styles.patternTitle, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>
                {PATTERN_LABEL[def.slug]}
              </Text>
            </View>

            {isForcedZero(def, items[def.slug]) ? (
              <View style={[styles.forcedZero, { backgroundColor: '#F4365A18' }]}>
                <AlertCircle size={16} color={BAND_COLOR.high} />
                <Text style={[styles.forcedZeroTxt, { color: '#C21F3F', fontFamily: FONT.uiSemibold }]}>
                  El patrón se registra con puntaje 0.
                </Text>
              </View>
            ) : def.isPerSide ? (
              <View style={{ gap: 14 }}>
                <ScoreSegmented
                  label="Izquierda"
                  value={items[def.slug].score_left}
                  onChange={(v) => patch(def.slug, { score_left: v })}
                  colors={SCORE_COLOR}
                />
                <ScoreSegmented
                  label="Derecha"
                  value={items[def.slug].score_right}
                  onChange={(v) => patch(def.slug, { score_right: v })}
                  colors={SCORE_COLOR}
                />
              </View>
            ) : (
              <ScoreSegmented
                label="Puntaje"
                value={items[def.slug].score_single}
                onChange={(v) => patch(def.slug, { score_single: v })}
                colors={SCORE_COLOR}
              />
            )}

            <View style={{ gap: 8 }}>
              <ToggleRow
                label="Hubo dolor durante el patrón"
                checked={items[def.slug].pain}
                onChange={(v) => patch(def.slug, { pain: v })}
              />
              {def.hasClearing ? (
                <ToggleRow
                  label="Prueba de descarte positiva (dolor)"
                  checked={items[def.slug].clearing_positive === true}
                  onChange={(v) => patch(def.slug, { clearing_positive: v })}
                />
              ) : null}
            </View>

            <View>
              <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
                OBSERVACIONES (COMPENSACIONES, NOTAS)
              </Text>
              <TextInput
                testID="movement-comment"
                value={items[def.slug].comment}
                onChangeText={(t) => patch(def.slug, { comment: t })}
                multiline
                maxLength={500}
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.textArea,
                  { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: FONT.ui },
                ]}
              />
            </View>
          </View>
        ) : null}

        {isReview ? (
          <View style={{ gap: 16 }}>
            <Text style={[styles.patternTitle, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>
              Revisión
            </Text>

            <Card padding="none" style={{ overflow: 'hidden' }}>
              {MOVEMENT_PATTERNS_V1.map((d, i) => {
                const item = items[d.slug]
                const complete = isComplete(d, item)
                let score: number | null = null
                if (complete) {
                  try {
                    score = finalItemScore(toCalcInput(d, item))
                  } catch {
                    score = null
                  }
                }
                return (
                  <TouchableOpacity
                    key={d.slug}
                    activeOpacity={0.7}
                    onPress={() => setStep(i)}
                    style={[
                      styles.reviewRow,
                      i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border } : null,
                    ]}
                  >
                    <Text style={[styles.reviewName, { color: theme.foreground, fontFamily: FONT.uiSemibold }]}>
                      {PATTERN_LABEL[d.slug]}
                    </Text>
                    <View
                      style={[
                        styles.reviewScore,
                        {
                          backgroundColor:
                            score == null ? theme.secondary : score === 0 ? '#F4365A22' : theme.secondary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.reviewScoreTxt,
                          { color: score === 0 ? '#C21F3F' : theme.foreground, fontFamily: FONT.displayBlack },
                        ]}
                      >
                        {score ?? '—'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </Card>

            {!allComplete ? (
              <View style={[styles.warnBox, { backgroundColor: '#F5A52418' }]}>
                <Text style={[styles.warnTxt, { color: '#B4700A', fontFamily: FONT.uiSemibold }]}>
                  Faltan patrones por puntuar para finalizar.
                </Text>
              </View>
            ) : null}

            {previewSummary ? (
              <View className="bg-surface-inverse border border-inverse rounded-card" style={styles.previewCard}>
                <View>
                  <Text className="text-on-dark-muted" style={[styles.previewEyebrow, { fontFamily: FONT.ui }]}>
                    Vista previa del semáforo
                  </Text>
                  <View style={{ marginTop: 8 }}>
                    <PriorityBadge band={previewSummary.band} />
                  </View>
                </View>
                <View style={styles.previewCompRow}>
                  <Text className="text-on-dark" style={[styles.previewComp, { fontFamily: FONT.displayBlack }]}>
                    {previewSummary.composite}
                  </Text>
                  <Text className="text-on-dark-muted" style={[styles.previewCompMax, { fontFamily: FONT.uiSemibold }]}>
                    /21
                  </Text>
                </View>
              </View>
            ) : null}

            <View>
              <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
                NOTAS DE LA EVALUACIÓN (OPCIONAL)
              </Text>
              <TextInput
                testID="movement-notes"
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={2000}
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.textArea,
                  { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: FONT.ui },
                ]}
              />
            </View>

            {/* Consentimiento (standalone v1): atestacion explicita del coach. */}
            <TouchableOpacity
              testID="movement-consent"
              activeOpacity={0.8}
              onPress={() => setConsent((c) => !c)}
              style={[styles.consentRow, { borderColor: consent ? theme.primary : theme.border, backgroundColor: theme.card }]}
            >
              <View
                style={[
                  styles.checkbox,
                  { borderColor: consent ? theme.primary : theme.border, backgroundColor: consent ? theme.primary : 'transparent' },
                ]}
              >
                {consent ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
              </View>
              <Text style={[styles.consentTxt, { color: theme.foreground, fontFamily: FONT.ui }]}>
                Atesto que el alumno consintió el tratamiento de sus datos de salud para esta evaluación.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="movement-finalize"
              activeOpacity={0.85}
              disabled={!canFinalize}
              onPress={finalize}
              style={[styles.finalizeBtn, { backgroundColor: theme.primary, opacity: canFinalize ? 1 : 0.5 }]}
            >
              {finalizing ? <ActivityIndicator color="#fff" /> : <Check size={18} color="#fff" />}
              <Text style={[styles.finalizeTxt, { fontFamily: FONT.uiBold }]}>
                {finalizing ? 'Finalizando…' : 'Finalizar evaluación'}
              </Text>
            </TouchableOpacity>

            <MovementDisclaimerNote />
          </View>
        ) : null}

        {saveError ? (
          <View style={[styles.warnBox, { backgroundColor: '#F4365A18', marginTop: 16 }]}>
            <Text style={[styles.warnTxt, { color: '#C21F3F', fontFamily: FONT.uiSemibold }]}>{saveError}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Footer fijo: total parcial + navegacion. */}
      <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <View>
          <Text style={[styles.footLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
            TOTAL PARCIAL
          </Text>
          <Text style={[styles.footTotal, { color: theme.foreground, fontFamily: FONT.displayBlack }]}>
            {partialTotal}
            <Text style={[styles.footTotalMax, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}> /21</Text>
          </Text>
        </View>
        <View style={styles.footBtns}>
          {step > 0 ? (
            <TouchableOpacity
              testID="movement-back-step"
              activeOpacity={0.8}
              onPress={goBack}
              style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
            >
              <ArrowLeft size={16} color={theme.foreground} />
              <Text style={[styles.navBtnTxt, { color: theme.foreground, fontFamily: FONT.uiBold }]}>Anterior</Text>
            </TouchableOpacity>
          ) : null}
          {!isReview && def ? (
            <TouchableOpacity
              testID="movement-next-step"
              activeOpacity={0.85}
              disabled={!isComplete(def, items[def.slug]) || saving}
              onPress={goNext}
              style={[
                styles.navBtnPrimary,
                { backgroundColor: theme.primary, opacity: !isComplete(def, items[def.slug]) || saving ? 0.5 : 1 },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={[styles.navBtnPrimaryTxt, { fontFamily: FONT.uiBold }]}>
                    {step === totalSteps - 1 ? 'Revisión' : 'Siguiente'}
                  </Text>
                  <ArrowRight size={16} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  )
}

/* ── Sub-controles del wizard ─────────────────────────────────────────────────── */
function ScoreSegmented({
  label,
  value,
  onChange,
  colors,
}: {
  label: string
  value: number | null
  onChange: (v: number) => void
  colors: string[]
}) {
  const { theme } = useTheme()
  return (
    <View>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.scoreRow}>
        {[0, 1, 2, 3].map((score) => {
          const active = value === score
          return (
            <TouchableOpacity
              key={score}
              testID={`movement-score-${label.toLowerCase()}-${score}`}
              activeOpacity={0.85}
              onPress={() => onChange(score)}
              style={[
                styles.scoreBtn,
                active
                  ? { backgroundColor: colors[score], borderColor: 'transparent' }
                  : { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Text
                style={[
                  styles.scoreBtnTxt,
                  { color: active ? '#fff' : theme.mutedForeground, fontFamily: FONT.displayBlack },
                ]}
              >
                {score}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onChange(!checked)}
      style={[
        styles.toggleRow,
        { backgroundColor: checked ? '#F4365A18' : theme.secondary },
      ]}
    >
      <Text
        style={[styles.toggleLabel, { color: checked ? '#C21F3F' : theme.foreground, fontFamily: FONT.uiSemibold }]}
      >
        {label}
      </Text>
      <View style={[styles.switch, { backgroundColor: checked ? BAND_COLOR.high : theme.border }]}>
        <View style={[styles.knob, { transform: [{ translateX: checked ? 16 : 0 }] }]} />
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 16 },
  // Report — needTwo / history / CTA / empty
  needTwoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  needTwo: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  histTitle: { fontSize: 17, letterSpacing: -0.3, marginBottom: 10 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  histDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  histBand: { fontSize: 14 },
  histMeta: { fontSize: 11.5, marginTop: 2 },
  histDel: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  primaryCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, height: 52 },
  primaryCtaTxt: { color: '#fff', fontSize: 15 },
  emptyCard: { alignItems: 'center', gap: 4 },
  emptyIcon: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  // Wizard — top bar + progress
  wizTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  wizBack: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
  wizBackTxt: { fontSize: 14 },
  wizStep: { fontSize: 12, flexShrink: 0 },
  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, marginBottom: 4 },
  progressSeg: { flex: 1, height: 5, borderRadius: 999 },
  wizBody: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 16 },
  resumeNote: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  resumeTxt: { fontSize: 12, lineHeight: 17 },
  eyebrow: { fontSize: 11, letterSpacing: 1 },
  patternTitle: { fontSize: 24, letterSpacing: -0.5, marginTop: 4 },
  forcedZero: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  forcedZeroTxt: { flex: 1, fontSize: 13 },
  fieldLabel: { fontSize: 11, letterSpacing: 0.4, marginBottom: 8 },
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  scoreBtnTxt: { fontSize: 20 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48 },
  toggleLabel: { flex: 1, fontSize: 14 },
  switch: { width: 40, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center', flexShrink: 0 },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  textArea: { minHeight: 80, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top' },
  // Review
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  reviewName: { flex: 1, fontSize: 14 },
  reviewScore: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reviewScoreTxt: { fontSize: 14 },
  warnBox: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  warnTxt: { fontSize: 12.5, lineHeight: 17 },
  previewCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 20 },
  previewEyebrow: { fontSize: 11, letterSpacing: 0.4 },
  previewCompRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  previewComp: { fontSize: 38, letterSpacing: -1 },
  previewCompMax: { fontSize: 15 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  consentTxt: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  finalizeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, height: 52 },
  finalizeTxt: { color: '#fff', fontSize: 15 },
  // Footer
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth },
  footLabel: { fontSize: 10, letterSpacing: 0.4 },
  footTotal: { fontSize: 22, letterSpacing: -0.8, marginTop: 1 },
  footTotalMax: { fontSize: 13 },
  footBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 44 },
  navBtnTxt: { fontSize: 14 },
  navBtnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 18, height: 44 },
  navBtnPrimaryTxt: { color: '#fff', fontSize: 14 },
})
