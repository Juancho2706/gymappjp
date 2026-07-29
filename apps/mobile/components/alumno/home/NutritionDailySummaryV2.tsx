import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Apple } from 'lucide-react-native'
import {
  NutritionTodayReadModelSchema,
  consumedPrescriptionItemIds,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { getTodayInSantiago } from '../../../lib/date-utils'
import { readNutritionV2Cache } from '../../../lib/nutrition-v2-cache'
import { Card } from '../../Card'
import { ProgressRing } from '../../ProgressRing'

type NutritionHomeSummary = {
  total: number
  done: number
  missingItems: number
  missingKcal: number
  current: { code: string; name: string; startTime: string | null } | null
}

/**
 * Card de nutrición del Home (SPEC nutrition-ui-poda #8, mockup sección 02 frame 1): anillo de
 * ITEMS (no kcal) + "te faltan N items y M kcal" + un único deep-link a la franja que le toca
 * ahora. Antes esta card hacía su propio fetch de `getNutritionTodayV2` en cada foco del Home
 * (duplicaba la lectura que el propio módulo de Nutrición ya hace); ahora lee EXCLUSIVAMENTE el
 * cache local que escribe `TodayTab` (`kind: 'today'`, mismo `scopeKey` = hoy) — cero red desde el
 * Home, cero polling. Sin cache (alumno no abrió Nutrición hoy en este dispositivo) o sin plan con
 * items prescritos, la card degrada a un CTA simple sin números: nunca inventa un 0/0 ni dispara
 * `get_nutrition_today_v2` fuera de la superficie de Nutrición.
 */
export function NutritionDailySummaryV2({
  clientId,
  onSeeAll,
  reloadSignal = 0,
}: {
  clientId: string
  /** `slotCode` = franja que le toca ahora (para resaltarla al llegar); `undefined` sin franja. */
  onSeeAll: (slotCode?: string) => void
  reloadSignal?: number
}) {
  const { theme } = useTheme()
  const [model, setModel] = useState<NutritionTodayReadModel | null>(null)
  // `false` hasta que se resuelve la lectura de AsyncStorage: evita un parpadeo del CTA "sin
  // cache" durante el primer frame, mientras el cache (rápido, pero async) todavía no respondió.
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setModel(null)
    setChecked(false)
  }, [clientId])

  useFocusEffect(
    useCallback(() => {
      let ignore = false
      void load(() => ignore)
      return () => {
        ignore = true
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId, reloadSignal]),
  )

  async function load(isIgnored: () => boolean) {
    const { iso: date } = getTodayInSantiago()
    const cached = await readNutritionV2Cache({
      userId: clientId,
      clientId,
      kind: 'today',
      scopeKey: date,
      schema: NutritionTodayReadModelSchema,
      allowStale: true,
    })
    if (isIgnored()) return
    setModel(cached?.payload ?? null)
    setChecked(true)
  }

  const summary = useMemo<NutritionHomeSummary | null>(() => {
    if (!model?.plan) return null
    const consumedIds = consumedPrescriptionItemIds(model)
    let total = 0
    let done = 0
    let current: NutritionHomeSummary['current'] = null
    const slots = [...model.mealSlots].sort((a, b) =>
      (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'),
    )
    for (const slot of slots) {
      if (slot.prescriptionItems.length === 0) continue
      const slotDone = slot.prescriptionItems.filter((item) => consumedIds.has(item.id)).length
      total += slot.prescriptionItems.length
      done += slotDone
      if (!current && slotDone < slot.prescriptionItems.length) {
        current = { code: slot.code, name: slot.name, startTime: slot.startTime }
      }
    }
    // Plan sin ningún item prescrito (solo porciones a elección): no hay "items" que contar —
    // degrada al CTA simple en vez de mostrar un 0/0 que no significa nada.
    if (total === 0) return null
    return {
      total,
      done,
      missingItems: total - done,
      missingKcal: Math.max(0, Math.round((model.targets.calories ?? 0) - model.consumed.calories)),
      current,
    }
  }, [model])

  if (!checked) return null

  if (!summary) {
    return (
      <Card padding="md" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          className="bg-primary/10"
          style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
        >
          <Apple size={20} color={theme.primary} strokeWidth={2.25} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-strong font-sans-bold" style={{ fontSize: 14 }}>
            Nutrición
          </Text>
          <Text className="text-muted" style={{ fontSize: 12 }}>
            Revisa tu plan de hoy
          </Text>
        </View>
        <TouchableOpacity
          testID="nutrition-v2-see-all"
          onPress={() => onSeeAll()}
          activeOpacity={0.82}
          className="rounded-control border border-primary/30 bg-primary/10"
          style={{ paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Text className="text-primary" style={{ fontFamily: FONT.uiBold, fontSize: 12 }}>
            Ver →
          </Text>
        </TouchableOpacity>
      </Card>
    )
  }

  const pct = (summary.done / summary.total) * 100
  const ctaLabel = summary.current ? `Marcar mi ${summary.current.name.toLowerCase()} →` : 'Ver nutrición →'
  const subtitle = summary.current
    ? [summary.current.startTime, summary.current.name].filter(Boolean).join(' · ')
    : 'Hoy'

  return (
    <Card padding="md" style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text className="text-strong font-sans-bold" style={{ fontSize: 14 }}>
          Nutrición
        </Text>
        <Text
          className="text-subtle"
          numberOfLines={1}
          style={{ fontFamily: FONT.uiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}
        >
          {subtitle}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <ProgressRing
          value={pct}
          size={56}
          stroke={6}
          label={
            <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 13 }}>
              {`${summary.done}/${summary.total}`}
            </Text>
          }
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          {summary.missingItems > 0 ? (
            <>
              <Text className="text-strong font-sans-bold" style={{ fontSize: 14 }}>
                {`Te faltan ${summary.missingItems} item${summary.missingItems === 1 ? '' : 's'}`}
              </Text>
              <Text className="text-muted" style={{ fontSize: 12 }}>
                {summary.missingKcal > 0 ? `y ${summary.missingKcal} kcal para cerrar el día` : 'para cerrar el día'}
              </Text>
            </>
          ) : (
            <Text className="text-strong font-sans-bold" style={{ fontSize: 14 }}>
              Completaste tu plan de hoy
            </Text>
          )}
        </View>
      </View>

      <TouchableOpacity
        testID="nutrition-v2-see-all"
        onPress={() => onSeeAll(summary.current?.code)}
        activeOpacity={0.82}
        className="rounded-control border border-primary/30 bg-primary/10"
        style={{ paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' }}
      >
        <Text className="text-primary" style={{ fontFamily: FONT.uiBold, fontSize: 12 }}>
          {ctaLabel}
        </Text>
      </TouchableOpacity>
    </Card>
  )
}
