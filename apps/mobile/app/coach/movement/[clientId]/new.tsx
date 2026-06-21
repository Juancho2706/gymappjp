import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Info, Lock } from 'lucide-react-native'
import { useTheme } from '../../../../context/ThemeContext'
import { ScreenHeader, Button } from '../../../../components'
import { EvaLoaderScreen } from '../../../../components/EvaLoader'
import { AppBackground } from '../../../../components/AppBackground'
import { hasModule } from '../../../../lib/entitlements'
import {
  getDraftWithItems,
  getClientName,
  upsertDraftItem,
  finalizeAssessment,
  finalItemScore,
  summarizeAssessment,
  movementPatternDef,
  MOVEMENT_PATTERNS_V1,
  PATTERN_LABELS,
  BAND_LABELS,
  MOVEMENT_DISCLAIMER,
  type MovementPatternDef,
  type MovementPatternSlug,
  type MovementItemInput,
  type MovementSummary,
  type MovementAssessmentItemRow,
  type PriorityBand,
} from '../../../../lib/movement'

const BAND_COLOR: Record<PriorityBand, string> = {
  high: '#EF4444',
  moderate: '#F59E0B',
  low: '#10B981',
}

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

function initItems(saved: MovementAssessmentItemRow[]): ItemsState {
  const state = {} as ItemsState
  for (const def of MOVEMENT_PATTERNS_V1) {
    const row = saved.find((i) => i.pattern === def.slug)
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

function isComplete(def: MovementPatternDef, item: ItemState): boolean {
  return def.isPerSide ? item.score_left != null && item.score_right != null : item.score_single != null
}

function toCalcInput(def: MovementPatternDef, item: ItemState): MovementItemInput {
  return {
    pattern: def.slug,
    isPerSide: def.isPerSide,
    scoreLeft: item.score_left,
    scoreRight: item.score_right,
    scoreSingle: item.score_single,
    pain: item.pain,
    clearingPositive: item.clearing_positive,
  }
}

export default function MovementWizardScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const { clientId } = useLocalSearchParams<{ clientId: string }>()

  const [loading, setLoading] = useState(true)
  const [entitled, setEntitled] = useState(false)
  const [clientName, setClientName] = useState<string | null>(null)
  const [items, setItems] = useState<ItemsState>(() => initItems([]))
  const [step, setStep] = useState(0) // 0..6 patrones, 7 revision
  const [assessmentId, setAssessmentId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [consentAttested, setConsentAttested] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const ok = await hasModule('movement_assessment')
        setEntitled(ok)
        if (ok && clientId) {
          const [name, draft] = await Promise.all([getClientName(clientId), getDraftWithItems(clientId)])
          setClientName(name)
          if (draft) {
            setItems(initItems(draft.items))
            setAssessmentId(draft.id)
          }
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [clientId])

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
    setItems((prev) => ({ ...prev, [slug]: { ...prev[slug], ...partial } }))
  }

  const saveCurrent = useCallback(
    async (onDone?: () => void) => {
      if (!def || !clientId) return
      const item = items[def.slug]
      setSaving(true)
      setError(null)
      const res = await upsertDraftItem(clientId, {
        pattern: def.slug,
        score_left: def.isPerSide ? item.score_left : null,
        score_right: def.isPerSide ? item.score_right : null,
        score_single: def.isPerSide ? null : item.score_single,
        pain: item.pain,
        clearing_positive: def.hasClearing ? (item.clearing_positive ?? false) : null,
        comment: item.comment.trim() || null,
      })
      setSaving(false)
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.assessmentId) setAssessmentId(res.assessmentId)
      onDone?.()
    },
    [def, clientId, items]
  )

  async function handleFinalize() {
    if (!clientId || !assessmentId) return
    setFinalizing(true)
    setError(null)
    const { error: err } = await finalizeAssessment(clientId, assessmentId, notes.trim() || null, consentAttested)
    setFinalizing(false)
    if (err) {
      setError(err)
      return
    }
    Alert.alert('Listo', 'Evaluación finalizada.', [
      { text: 'OK', onPress: () => router.replace(`/coach/movement/${clientId}`) },
    ])
  }

  const canFinalize = allComplete && assessmentId != null && consentAttested && !finalizing

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando evaluación…" />
      </SafeAreaView>
    )
  }

  if (!entitled) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <View style={styles.backRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
            <ChevronLeft size={20} color={theme.mutedForeground} />
            <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 14 }}>Volver</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.offWrap}>
          <View style={[styles.offCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <Lock size={26} color={theme.mutedForeground} />
            <Text style={[styles.offTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Módulo no habilitado</Text>
            <Text style={[styles.offText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              El screening de movimiento es un módulo de pago.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.backRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.mutedForeground} />
          <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 14 }}>Volver</Text>
        </TouchableOpacity>
      </View>
      <ScreenHeader
        title={isReview ? 'Revisión' : `Paso ${step + 1} de ${totalSteps}`}
        subtitle={clientName ?? 'Screening de movimiento'}
      />

      {/* Barra de progreso */}
      <View style={styles.progressRow}>
        {MOVEMENT_PATTERNS_V1.map((d, i) => (
          <View
            key={d.slug}
            style={[
              styles.progressSeg,
              {
                backgroundColor: i < step || isReview ? theme.primary : i === step ? theme.primary + '80' : theme.border,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {def ? (
          <View style={{ gap: 16 }}>
            <Text style={[styles.patternTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
              {PATTERN_LABELS[def.slug]}
            </Text>

            {def.isPerSide ? (
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Segmented
                    theme={theme}
                    label="IZQUIERDO"
                    value={items[def.slug].score_left}
                    onChange={(v) => patch(def.slug, { score_left: v })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Segmented
                    theme={theme}
                    label="DERECHO"
                    value={items[def.slug].score_right}
                    onChange={(v) => patch(def.slug, { score_right: v })}
                  />
                </View>
              </View>
            ) : (
              <Segmented
                theme={theme}
                label="PUNTAJE"
                value={items[def.slug].score_single}
                onChange={(v) => patch(def.slug, { score_single: v })}
              />
            )}

            <Toggle theme={theme} label="Dolor durante la prueba" checked={items[def.slug].pain} onChange={(v) => patch(def.slug, { pain: v })} danger />
            {def.hasClearing ? (
              <Toggle
                theme={theme}
                label="Prueba de descarte positiva"
                checked={items[def.slug].clearing_positive === true}
                onChange={(v) => patch(def.slug, { clearing_positive: v })}
                danger
              />
            ) : null}

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>COMENTARIO (OPCIONAL)</Text>
              <TextInput
                value={items[def.slug].comment}
                onChangeText={(v) => patch(def.slug, { comment: v })}
                multiline
                maxLength={500}
                style={[styles.textArea, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans }]}
              />
            </View>
          </View>
        ) : null}

        {isReview ? (
          <View style={{ gap: 14 }}>
            {/* Resumen por patron (tap para editar) */}
            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
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
                    onPress={() => setStep(i)}
                    activeOpacity={0.7}
                    style={[styles.reviewRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
                  >
                    <Text style={[styles.reviewName, { color: theme.foreground, fontFamily: theme.fontSans }]}>{PATTERN_LABELS[d.slug]}</Text>
                    <View
                      style={[
                        styles.reviewScore,
                        {
                          backgroundColor: score == null ? theme.border : score === 0 ? '#EF44441A' : theme.background,
                        },
                      ]}
                    >
                      <Text style={[styles.reviewScoreText, { color: score === 0 ? '#EF4444' : theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
                        {score ?? '—'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>

            {!allComplete ? (
              <View style={[styles.warn, { backgroundColor: '#F59E0B1A', borderColor: '#F59E0B4D' }]}>
                <Text style={[styles.warnText, { color: '#B45309', fontFamily: theme.fontSans }]}>
                  Faltan patrones por completar. Tocá un patrón arriba para editarlo.
                </Text>
              </View>
            ) : null}

            {previewSummary ? (
              <View style={[styles.previewCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>PRIORIDAD ESTIMADA</Text>
                  <View style={[styles.bandChipLg, { backgroundColor: BAND_COLOR[previewSummary.band] + '1A', borderColor: BAND_COLOR[previewSummary.band] + '4D' }]}>
                    <View style={[styles.dotLg, { backgroundColor: BAND_COLOR[previewSummary.band] }]} />
                    <Text style={[styles.bandTextLg, { color: BAND_COLOR[previewSummary.band], fontFamily: 'Montserrat_700Bold' }]}>
                      {BAND_LABELS[previewSummary.band]}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.composite, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
                  {previewSummary.composite}
                  <Text style={[styles.compositeMax, { color: theme.mutedForeground }]}>/21</Text>
                </Text>
              </View>
            ) : null}

            <View style={{ gap: 6 }}>
              <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>NOTAS GENERALES (OPCIONAL)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                maxLength={2000}
                style={[styles.textArea, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans }]}
              />
            </View>

            {/* Consentimiento (atestacion standalone) */}
            <TouchableOpacity
              onPress={() => setConsentAttested((v) => !v)}
              activeOpacity={0.8}
              style={[styles.consentRow, { borderColor: consentAttested ? theme.primary : theme.border, backgroundColor: consentAttested ? theme.primary + '12' : theme.card }]}
            >
              <View style={[styles.checkbox, { borderColor: consentAttested ? theme.primary : theme.border, backgroundColor: consentAttested ? theme.primary : 'transparent' }]}>
                {consentAttested ? <Check size={13} color={theme.primaryForeground} /> : null}
              </View>
              <Text style={[styles.consentText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                Atesto que el alumno consintió el tratamiento de sus datos de salud para este screening.
              </Text>
            </TouchableOpacity>

            {error ? (
              <Text style={[styles.error, { color: theme.destructive, borderColor: theme.destructive + '55', backgroundColor: theme.destructive + '14' }]}>{error}</Text>
            ) : null}

            <Button label={finalizing ? 'Finalizando…' : 'Finalizar evaluación'} onPress={handleFinalize} loading={finalizing} disabled={!canFinalize} full size="lg" />

            <View style={[styles.disclaimer, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <Info size={14} color={theme.mutedForeground} style={{ marginTop: 1 }} />
              <Text style={[styles.disclaimerText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{MOVEMENT_DISCLAIMER}</Text>
            </View>
          </View>
        ) : null}

        {error && !isReview ? (
          <Text style={[styles.error, { color: theme.destructive, borderColor: theme.destructive + '55', backgroundColor: theme.destructive + '14', marginTop: 16 }]}>{error}</Text>
        ) : null}
      </ScrollView>

      {/* Barra fija: total parcial + navegacion */}
      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <View>
          <Text style={[styles.footLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>TOTAL PARCIAL</Text>
          <Text style={[styles.footTotal, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {partialTotal}
            <Text style={[styles.footMax, { color: theme.mutedForeground }]}>/21</Text>
          </Text>
        </View>
        <View style={styles.footBtns}>
          {step > 0 ? (
            <TouchableOpacity
              onPress={() => setStep((s) => Math.max(0, s - 1))}
              activeOpacity={0.8}
              style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
            >
              <ArrowLeft size={15} color={theme.foreground} />
              <Text style={[styles.navText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Atrás</Text>
            </TouchableOpacity>
          ) : null}
          {!isReview && def ? (
            <TouchableOpacity
              onPress={() => saveCurrent(() => setStep((s) => s + 1))}
              disabled={!isComplete(def, items[def.slug]) || saving}
              activeOpacity={0.85}
              style={[styles.navBtnPrimary, { backgroundColor: theme.primary, opacity: !isComplete(def, items[def.slug]) || saving ? 0.5 : 1 }]}
            >
              <Text style={[styles.navText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>
                {saving ? 'Guardando…' : step === totalSteps - 1 ? 'Revisar' : 'Siguiente'}
              </Text>
              {!saving ? <ArrowRight size={15} color={theme.primaryForeground} /> : null}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  )
}

function Segmented({ theme, label, value, onChange }: { theme: any; label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <View style={styles.segRow}>
        {[0, 1, 2, 3].map((score) => {
          const active = value === score
          return (
            <TouchableOpacity
              key={score}
              onPress={() => onChange(score)}
              activeOpacity={0.8}
              style={[
                styles.segBtn,
                {
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? theme.primary : theme.card,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <Text style={[styles.segText, { color: active ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{score}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function Toggle({ theme, label, checked, onChange, danger }: { theme: any; label: string; checked: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  const accent = danger ? theme.destructive : theme.primary
  return (
    <TouchableOpacity
      onPress={() => onChange(!checked)}
      activeOpacity={0.8}
      style={[
        styles.toggleRow,
        {
          borderColor: checked ? accent + '66' : theme.border,
          backgroundColor: checked ? accent + '14' : theme.card,
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <Text style={[styles.toggleLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>{label}</Text>
      <View style={[styles.switchTrack, { backgroundColor: checked ? accent : theme.mutedForeground + '4D' }]}>
        <View style={[styles.switchThumb, { transform: [{ translateX: checked ? 18 : 0 }] }]} />
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  progressRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  progressSeg: { flex: 1, height: 5, borderRadius: 999 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  patternTitle: { fontSize: 20, letterSpacing: -0.3 },
  row2: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  segRow: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, height: 52, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  toggleLabel: { flex: 1, fontSize: 14 },
  switchTrack: { width: 42, height: 26, borderRadius: 999, padding: 3, justifyContent: 'center' },
  switchThumb: { width: 20, height: 20, borderRadius: 999, backgroundColor: '#FFFFFF' },
  textArea: { minHeight: 80, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top' },
  section: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  reviewName: { flex: 1, fontSize: 14 },
  reviewScore: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  reviewScoreText: { fontSize: 15 },
  warn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  warnText: { fontSize: 12, lineHeight: 17 },
  previewCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, padding: 16 },
  bandChipLg: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginTop: 6 },
  dotLg: { width: 10, height: 10, borderRadius: 999 },
  bandTextLg: { fontSize: 14 },
  composite: { fontSize: 30 },
  compositeMax: { fontSize: 15, fontFamily: 'Montserrat_700Bold' },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  consentText: { flex: 1, fontSize: 13, lineHeight: 18 },
  error: { fontSize: 12, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, overflow: 'hidden' },
  disclaimer: { flexDirection: 'row', gap: 8, borderWidth: 1, padding: 12 },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth },
  footLabel: { fontSize: 9, letterSpacing: 0.8 },
  footTotal: { fontSize: 22 },
  footMax: { fontSize: 14, fontFamily: 'Montserrat_700Bold' },
  footBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  navBtnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  navText: { fontSize: 13.5 },
  offWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  offCard: { borderWidth: 1, padding: 24, alignItems: 'center', gap: 12 },
  offTitle: { fontSize: 18 },
  offText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
