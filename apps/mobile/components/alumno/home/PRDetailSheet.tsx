import { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import { ArrowUpRight, Share2, TrendingUp } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { getSantiagoIsoYmdForUtcInstant } from '../../../lib/date-utils'
import { getExercisePRHistory, type ExercisePRDetail } from '../../../lib/history.queries'
import { Sheet } from '../../Sheet'
import { Skeleton } from '../../Skeleton'
import { Sparkline } from '../../Sparkline'
import {
  ShareCardDate,
  ShareCardEyebrow,
  ShareCardHero,
  ShareCardPill,
  ShareCardPreview,
  ShareCardTitle,
} from '../../ShareCard'

/** "12 de junio de 2026" — fecha larga es-CL, dia calendario Santiago. */
function fmtLong(iso: string): string {
  const ymd = getSantiagoIsoYmdForUtcInstant(iso)
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function fmtShort(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Coma decimal es-CL como el canvas web (fmtWeight/fmtPct): "102,5 kg", "+12,5%". */
function fmtDecimalCL(n: number): string {
  return String(n).replace('.', ',')
}

/** Slug del PNG del record — espejo del `slugify` web (PRDetailSheet.tsx:16-26): minusculas +
 *  NFD sin diacriticos + no-alfanum→'-' + trim guiones + slice(0,48), fallback 'record'. */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'record'
  )
}

/**
 * E1-04 PRDetailSheet (web `records/PRDetailSheet.tsx`): progresion del lift
 * on-demand en un Sheet DS. PR actual (numero grande sport + 1RM) + sparkline de
 * progresion + hitos ("cada vez que subiste la marca") + boton "Compartir mi
 * record" (share-card branded) + CTA "Ver técnica".
 */
export function PRDetailSheet({
  open,
  onClose,
  clientId,
  exerciseId,
  exerciseName,
  fallbackWeight,
  onTecnica,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  exerciseId: string | null
  exerciseName: string
  fallbackWeight: number | null
  onTecnica: (name: string) => void
}) {
  const { theme } = useTheme()
  const { width } = useWindowDimensions()
  const [detail, setDetail] = useState<ExercisePRDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  // El Sheet esta SIEMPRE montado (PersonalRecordsCard.tsx:76) y conserva `detail`
  // entre aperturas; el reset del useEffect corre DESPUES del paint, asi que al tocar
  // otro tile el primer render pintaria el PR viejo. Reseteamos DURANTE el render cuando
  // cambia exerciseId (patron "adjusting state during render" de React docs): detail→null
  // + loading→true garantiza que ese primer render muestre el skeleton, nunca datos viejos.
  const [prevExerciseId, setPrevExerciseId] = useState<string | null>(exerciseId)
  if (exerciseId !== prevExerciseId) {
    setPrevExerciseId(exerciseId)
    setDetail(null)
    setLoading(exerciseId != null)
  }

  useEffect(() => {
    if (!open || !exerciseId) return
    let cancelled = false
    setDetail(null)
    setLoading(true)
    getExercisePRHistory(clientId, exerciseId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, exerciseId, clientId])

  const name = detail?.exerciseName ?? exerciseName
  const currentWeight = detail?.currentPr.weightKg ?? fallbackWeight
  const currentAt = detail?.currentPr.achievedAt ?? null
  const latest1RM = detail?.history.length ? detail.history[detail.history.length - 1].estimated1RM : null
  const spark = (detail?.history ?? []).map((p) => p.topWeightKg)
  const milestones = [...(detail?.milestones ?? [])].reverse()

  // ── Share-card del record (P0, espejo web PRDetailSheet.tsx:74-92) ──
  // Salto previo → actual desde el hito que alcanzo el maximo actual (si lo hay).
  const topMilestone = detail?.milestones.length ? detail.milestones[detail.milestones.length - 1] : null
  const prevWeightKg = topMilestone && currentWeight != null && topMilestone.weightKg === currentWeight ? topMilestone.prevKg : 0
  const pct =
    prevWeightKg > 0 && currentWeight != null ? Math.round(((currentWeight - prevWeightKg) / prevWeightKg) * 1000) / 10 : 0
  const best1RM = (detail?.history ?? []).reduce((mx, p) => Math.max(mx, p.estimated1RM), 0)
  const shareEstimated1RM = best1RM > 0 ? best1RM : latest1RM ?? currentWeight ?? 0
  const canShare = currentWeight != null && exerciseId != null

  return (
    <>
    <Sheet open={open} onClose={onClose} title={exerciseName} snapPoints={['55%', '88%']}>
      {/* Un solo hijo con gap 20 espeja el `gap-5` del body web (Sheet.tsx aplica gap 14 entre
          hijos del scroll — no configurable — asi que agrupamos y controlamos el gap aqui). */}
      <View style={{ gap: 20 }}>
        {/* PR actual */}
        <View className="rounded-card bg-surface-sunken/25 border border-subtle" style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text className="text-muted" style={{ fontFamily: FONT.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Record actual</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <Text className="text-sport-500" style={{ fontFamily: FONT.displayBlack, fontSize: 34, lineHeight: 34, fontVariant: ['tabular-nums'] }}>{currentWeight ?? '—'}</Text>
            <Text className="text-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 14 }}>kg</Text>
          </View>
          {currentAt ? <Text className="text-muted font-sans" style={{ fontSize: 12, marginTop: 6 }}>Logrado el {fmtLong(currentAt)}</Text> : null}
          {latest1RM != null && latest1RM > 0 ? (
            <Text className="text-muted font-sans" style={{ fontSize: 11, marginTop: 2 }}>
              1RM estimado: <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontVariant: ['tabular-nums'] }}>{latest1RM} kg</Text>
            </Text>
          ) : null}
        </View>

        {/* Progresion */}
        {spark.length >= 2 ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <TrendingUp size={12} color={theme.mutedForeground} strokeWidth={2.5} />
              <Text className="text-muted" style={{ fontFamily: FONT.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Progresión</Text>
            </View>
            {/* mt-3 + h-[72px] del contenedor web (WeightSparkline.tsx:48). */}
            <View style={{ marginTop: 12 }}>
              <Sparkline values={spark} width={Math.max(0, width - 80)} height={72} color={theme.primary} />
            </View>
          </View>
        ) : null}

        {/* Hitos */}
        {loading && milestones.length === 0 ? (
          <View style={{ gap: 8 }}>
            <Skeleton height={44} radius={theme.radius.control} />
            <Skeleton height={44} radius={theme.radius.control} />
          </View>
        ) : milestones.length > 0 ? (
          <View>
            <Text className="text-muted" style={{ fontFamily: FONT.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Cada vez que subiste la marca</Text>
            <View style={{ gap: 6 }}>
              {milestones.map((m) => (
                <View key={`${m.date}-${m.weightKg}`} className="rounded-control bg-surface-sunken/20 border border-subtle" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                    {m.prevKg > 0 ? (
                      <>
                        {m.prevKg} <Text className="text-muted">→</Text> {m.weightKg} kg
                        <Text className="text-sport-500" style={{ fontFamily: FONT.uiBold, fontSize: 12 }}>{`  +${m.deltaKg}`}</Text>
                      </>
                    ) : (
                      <>
                        {m.weightKg} kg <Text className="text-muted" style={{ fontFamily: FONT.uiMedium, fontSize: 12 }}>primer registro</Text>
                      </>
                    )}
                  </Text>
                  <Text className="text-muted" style={{ fontSize: 12 }}>{fmtShort(m.date)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Compartir mi record — abre la share-card branded (share-card via ShareCardPreview).
            DIVERGENCIA IDIOMATICA (vs web PRDetailSheet.tsx:208-219): el web genera el PNG en el
            mismo tap con `sharing`/Loader2 en el boton; en movil el boton solo ABRE el preview modal
            (patron ya establecido en WorkoutSummaryOverlay.tsx:608), y el spinner/estado de carga
            vive DENTRO de ShareCardPreview. Mismo destino, misma tarjeta branded, mismos toasts. */}
        {canShare ? (
          <TouchableOpacity
            testID="pr-detail-share"
            onPress={() => setShareOpen(true)}
            activeOpacity={0.85}
            className="rounded-control bg-sport-500"
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 }}
          >
            <Share2 size={16} color="#fff" />
            <Text className="text-white" style={{ fontFamily: FONT.uiBold, fontSize: 14 }}>Compartir mi récord</Text>
          </TouchableOpacity>
        ) : null}

        {/* CTA tecnica */}
        <TouchableOpacity
          testID="pr-detail-tecnica"
          onPress={() => onTecnica(exerciseName)}
          activeOpacity={0.8}
          className="rounded-control bg-surface-sunken/40 border border-subtle"
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 }}
        >
          <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontSize: 14 }}>Ver técnica</Text>
          <ArrowUpRight size={16} color={theme.foreground} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    </Sheet>

      {/* share-card branded del record (motor ShareCard, mirror WorkoutSummaryOverlay PR block).
          MONTAJE (QA-6): se pinta como HERMANO del <Sheet>, NO dentro de su cuerpo. El <Sheet> es un
          @gorhom BottomSheetModal que se teletransporta vía <Portal> (BottomSheetModal.tsx:537,
          containerComponent=React.Fragment :54) hacia un <PortalHost> que es JSX plano DENTRO de la misma
          ventana de la Activity — NO es un <Modal> RN nativo. Por eso este ShareCardPreview (un <Modal> RN)
          es un ÚNICO Dialog sobre la Activity: el caso documentado SEGURO ("Top-level consumers keep the
          default Modal", ShareCard.tsx:502-503), NO el brick de dos Dialogs anidados de QA-5 (que exige
          Modal-dentro-de-Modal RN, ShareCard.tsx:498-501). Sacarlo del BottomSheetScrollView del cuerpo
          desacopla su ciclo de vida del teardown animado del sheet y elimina toda fragilidad de "Modal RN
          dentro del portal @gorhom" cuando la Activity nativa de compartir manda la app a background y vuelve.
          NO se usa `embedded`: ese overlay absolute-fill necesita un ancestro full-screen que aquí no existe
          (el único host de portal es el root dinámico de @gorhom `bottom-sheet-portal-<id>`, inalcanzable por
          nombre; un <Portal> plano apunta al host 'root' que nadie renderiza — PortalProvider lo renombra).
          El <Modal> RN nativo es el único mecanismo full-screen en scope, y aquí es el patrón seguro. */}
      <ShareCardPreview
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        variant="record"
        shareMessage={`Nuevo récord personal en ${name}`}
        fileName={`record-${slugify(name)}`}
      >
        <ShareCardEyebrow color={theme.primary}>RÉCORD PERSONAL</ShareCardEyebrow>
        <ShareCardTitle>{name}</ShareCardTitle>
        <ShareCardHero value={fmtDecimalCL(currentWeight ?? 0)} unit="KG" color={theme.primary} />
        {prevWeightKg > 0 ? (
          <ShareCardPill tone="success">{fmtDecimalCL(prevWeightKg)} → {fmtDecimalCL(currentWeight ?? 0)} kg · +{fmtDecimalCL(pct)}%</ShareCardPill>
        ) : (
          <ShareCardPill>Primer récord personal</ShareCardPill>
        )}
        <ShareCardDate />
        <ShareCardPill>1RM estimado · {fmtDecimalCL(shareEstimated1RM)} kg</ShareCardPill>
      </ShareCardPreview>
    </>
  )
}
