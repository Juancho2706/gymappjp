import { Text, View } from 'react-native'
import { NUTRITION_MACROS } from '@eva/nutrition-v2'
import { DAY_MACRO_ROWS, type PublishBarDayTotals } from './PublishBar'

/**
 * Mini-cinta RN del editor único (T3.v Cabina, V3.3) — espejo comprimido de la cinta desktop
 * web (`EditorRibbon.tsx`, mockup «Cabina v2» §A·2): UNA franja sticky bajo el header con el
 * diagnóstico del día activo en un vistazo — kcal actual/meta + una barra de progreso + los
 * tres % de cumplimiento P/C/G con el dot de su color (sin la letra: el dot es decorativo, el
 * nombre completo va en el `accessibilityLabel` del bloque).
 *
 * Presentacional puro: `dayTotals` es EXACTAMENTE el mismo objeto que `QuickEditMode` ya arma
 * para la `PublishBar` — cero cálculo nuevo, cero fetch. El fill de la barra usa `bg-primary`
 * (blanco-etiqueta consciente, mismo token que `--sport` en el mockup); los % de macro NO
 * llevan semántica ok/warn (esa vive solo en el anillo de la cinta desktop web, fuera de esta
 * tanda para RN) — son información neutra, mono, `text-muted`.
 */
export function EditorDayRibbon({ dayTotals }: { dayTotals: PublishBarDayTotals }) {
  const target = dayTotals.targetCalories
  const kcalPct = target != null && target > 0 ? (Math.max(0, dayTotals.calories) / target) * 100 : null
  const barWidth = Math.min(Math.max(kcalPct ?? 0, 0), 100)
  const calories = Math.round(dayTotals.calories)

  const macroPcts = DAY_MACRO_ROWS.map(({ key, actual, target: targetField }) => {
    const targetValue = dayTotals[targetField]
    const pct = targetValue != null && targetValue > 0 ? Math.round((dayTotals[actual] / targetValue) * 100) : null
    return { key, pct }
  })

  // Un solo nodo accesible: el dot es puro color (no anunciable), así que el nombre completo de
  // cada macro va acá — mismo criterio que el `role="img"` del anillo web.
  const readoutLabel = [
    dayTotals.label,
    target != null ? `${calories} de ${Math.round(target)} kcal` : `${calories} kcal`,
    ...macroPcts
      .filter((row) => row.pct != null)
      .map((row) => `${NUTRITION_MACROS[row.key].label} ${row.pct}% de la meta`),
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <View
      accessible
      accessibilityLabel={readoutLabel}
      className="border-b border-subtle bg-surface-app px-4 py-2"
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="shrink-0 font-mono text-[12.5px]" style={{ fontVariant: ['tabular-nums'] }}>
          <Text className="font-bold text-strong">{calories}</Text>
          <Text className="text-muted">{target != null ? ` / ${Math.round(target)} kcal` : ' kcal'}</Text>
        </Text>
        <View className="flex-row items-center gap-2.5">
          {macroPcts.map(({ key, pct }) => (
            <View key={key} className="flex-row items-center gap-1">
              <View className={'h-1.5 w-1.5 rounded-full ' + NUTRITION_MACROS[key].nativeClass} />
              <Text
                className="font-mono text-[9px] font-semibold text-muted"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {pct != null ? `${pct}%` : '—'}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {target != null ? (
        <View className="mt-1.5 h-[5px] overflow-hidden rounded-pill bg-surface-sunken">
          <View className="h-full rounded-pill bg-primary" style={{ width: `${barWidth}%` }} />
        </View>
      ) : null}
    </View>
  )
}
