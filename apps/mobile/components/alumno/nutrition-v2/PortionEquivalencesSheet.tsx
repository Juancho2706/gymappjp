/**
 * PortionEquivalencesSheet — sheet de equivalencias V2 (SPEC UX-b): lista de
 * alimentos que equivalen a 1 porción del grupo, resuelta DESDE el read-model del
 * Today (`exchangeFoods` — hallazgo F3: el cliente jamás consulta `exchange_groups`
 * ni `foods`). Espejo del `ExchangeEquivalencesSheet` V1 (referencia visual) sobre
 * los snapshots congelados. Tabs si la franja tiene varios grupos; badge "Valores
 * referenciales" si `macrosConfirmed=false`; CTAs al pie: marcar (mismo camino que
 * el tap del chip, con confirmación de exceso) y registrar alimento (flujo
 * existente con la franja preseleccionada + aviso anti-duplicado).
 *
 * D4-A (tren «Porciones a la chilena», W5.8/W5.9): este sheet es lo que REEMPLAZA al PDF de la
 * nutricionista. Por eso la lista se parte en DOS secciones con encabezado sticky —«Genéricos ·
 * INTA · UDD» arriba, «Marcas y productos» abajo—, cada fila lleva miniatura de 36 px cuando el
 * catálogo tiene foto, la medida casera va en negrita con los gramos en mono debajo, y el pie de
 * atribución de Open Food Facts es CONDICIONAL. El ORDEN no se toca acá: el RPC ya ordena
 * `is_generic desc, portion_label_present desc, name, id` dentro del `row_number()` que corta a 60
 * y repetido en el `jsonb_agg` (DATA §8.2), así que `splitExchangeFoodsByOrigin` solo PARTE.
 *
 * Render por `nativeModal` (gotcha gorhom 5.2.14 + reanimated 4: el sheet gorhom
 * es frágil bajo Fabric — patrón Sheet nativeModal existente del repo).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Search } from 'lucide-react-native'
import {
  CL_CODES,
  photoCreditNeeded,
  photoSourceLabel,
  qeGroupRefPerPortion,
  splitExchangeFoodsByOrigin,
  type NutritionExchangeFoodRead,
  type NutritionSlotExchangeTargetRead,
} from '@eva/nutrition-v2'
import { Sheet } from '../../Sheet'
import { FoodThumbnail, NutritionMotionButton } from '../../nutrition-v2'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import { captureNutritionEquivalencesOpened } from '../../../lib/analytics'
import { foodMediaThumbnailUrlFromPath } from '../../../lib/nutrition-v2-food-media'
import {
  filterPortionExchangeFoods,
  formatPortionsCl,
  nextPortionStep,
  orderedPortionTargets,
  type PortionCoverageView,
} from '../../../lib/nutrition-v2-portions'
import { useTheme } from '../../../context/ThemeContext'
import { GroupDot } from './PortionChip'
import { portionTargetColor } from './PortionSlotSection'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/**
 * El `contentContainerStyle` del `Sheet` mete 20 px de padding lateral (Sheet.tsx:330). El
 * encabezado sticky tiene que TAPAR la lista que scrollea por debajo de punta a punta, así que se
 * los devuelve con margen negativo y los repone como padding propio. El fondo opaco lo pone la
 * clase `bg-surface-card` (mismo token que la superficie del sheet: nada hardcodeado, y el
 * white-label / dark lo resuelve el tema).
 */
const SHEET_SIDE_PADDING = 20

const styles = StyleSheet.create({
  sectionHeader: {
    marginHorizontal: -SHEET_SIDE_PADDING,
    paddingHorizontal: SHEET_SIDE_PADDING,
    paddingVertical: 6,
  },
})

/** Una fila de la lista de equivalencias: miniatura + nombre/marca + medida casera y gramos. */
function EquivalenceRow({
  food,
  groupCode,
  groupColor,
  divider,
}: {
  food: NutritionExchangeFoodRead
  groupCode: string
  groupColor: string
  /** Separador superior: lo lleva toda fila menos la primera de SU sección. */
  divider: boolean
}) {
  // El RPC emite el PATH y la VERSION sueltos (`imagePath`/`imageVersion`), nunca el objeto
  // `media`: mandarlo entero subía el payload +136 % y el cache offline descarta > 750 kB
  // (SPEC §9.1). La URL pública la arma el helper, que fija el bucket `food-media` y el `?v=`.
  const src = foodMediaThumbnailUrlFromPath({
    objectPath: food.imagePath,
    version: food.imageVersion,
  })
  // Crédito POR FILA (solo `cc_by_sa`/`cc_by`): la foto propia no se acredita a Open Food Facts.
  const source = src ? photoSourceLabel(food.imageLicense) : null
  const grams = food.portionGrams != null ? `${food.portionGrams} g` : ''
  // La fila se anuncia como UN solo nodo: nombre, marca, medida casera, gramos y —si corresponde—
  // la fuente de la foto. Sin esto el lector de pantalla lee cuatro textos sueltos por alimento.
  const accessibilityLabel = [food.name, food.brand, food.portionLabel, grams, source]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('. ')

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      className={cx('min-h-11 flex-row items-center gap-3 py-2', divider && 'border-t border-subtle')}
    >
      {src ? (
        <FoodThumbnail alt={food.name} size="sm" src={src} />
      ) : (
        // Fallback SIN foto = el marcador del grupo, que es lo que este sheet ya pintaba (R-10 /
        // D-2). No hay ícono de categoría posible: el read model de equivalencias no trae
        // `category` y el RPC emite exactamente cuatro llaves nuevas, ninguna de ellas esa.
        <GroupDot code={groupCode} color={groupColor} size={36} />
      )}
      <View className="min-w-0 flex-1 flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-strong" numberOfLines={1}>
            {food.name}
          </Text>
          {food.brand ? (
            <Text className="text-xs text-muted" numberOfLines={1}>
              {food.brand}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          {/* Medida casera en NEGRITA: es lo que el alumno busca («½ unidad»), no los gramos. Si
              el alimento no la tiene —el estado normal de las marcas tras D4-A, no un error— se
              deja el guion y los gramos quedan como única cifra, igual que antes de W5. */}
          <Text
            className={cx('text-xs font-bold', food.portionLabel ? 'text-strong' : 'text-muted')}
          >
            {food.portionLabel ?? '—'}
          </Text>
          <Text
            className="font-mono text-[10px] text-muted"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {grams}
          </Text>
        </View>
      </View>
    </View>
  )
}

export interface PortionEquivalencesSheetProps {
  /** null = cerrado. `groupCode` es el grupo inicialmente activo. */
  open: { slotCode: string; groupCode: string } | null
  /** Targets de la franja abierta (tabs si hay más de uno). */
  targets: ReadonlyArray<NutritionSlotExchangeTargetRead>
  /** Catálogo de equivalencias del read-model (todas; se filtra por grupo). */
  exchangeFoods: ReadonlyArray<NutritionExchangeFoodRead>
  /** Vista de cobertura por groupCode de la franja abierta (para exceso/dup). */
  views: Readonly<Record<string, PortionCoverageView>>
  onClose: () => void
  onMark: (target: NutritionSlotExchangeTargetRead, portions: 1 | 0.5) => void
  /**
   * Atajo a "Registrar alimento" desde el sheet. `null` cuando el plan está en solo alimentos
   * prescritos (`canRegisterFreely = false`, NUT-009): el botón desaparece en vez de abrir un
   * formulario cuya escritura el servidor va a rechazar.
   */
  onRegister: (() => void) | null
}

export function PortionEquivalencesSheet({
  open,
  targets,
  exchangeFoods,
  views,
  onClose,
  onMark,
  onRegister,
}: PortionEquivalencesSheetProps) {
  const { theme } = useTheme()
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [confirmExtra, setConfirmExtra] = useState(false)

  useEffect(() => {
    setActiveGroup(open?.groupCode ?? null)
    setSearch('')
    setConfirmExtra(false)
  }, [open])

  /**
   * PostHog `nutrition_equivalences_opened` (DATA §11 evento 5): UNA vez por APERTURA. El guard es
   * de la superficie —lo dice el paquete— porque el evento no lleva `group_code`: cambiar de tab
   * dentro del sheet no aportaría nada y solo duplicaría el volumen. La llave del guard es la
   * apertura (franja + grupo inicial), no la identidad del objeto `open` ni la del catálogo: sin
   * ella, cualquier revalidación de `exchangeFoods` con el sheet abierto volvería a emitir.
   */
  const openedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      openedKeyRef.current = null
      return
    }
    const key = `${open.slotCode}|${open.groupCode}`
    if (openedKeyRef.current === key) return
    openedKeyRef.current = key
    // Sin el buscador: el evento mide lo que el sheet ofrece al abrirse, no lo que el alumno filtra.
    const rows = filterPortionExchangeFoods(exchangeFoods, open.groupCode, '')
    captureNutritionEquivalencesOpened({
      set: CL_CODES.has(open.groupCode) ? 'cl' : 'smae',
      hasGeneric: splitExchangeFoodsByOrigin(rows).generic.length > 0,
      rows: rows.length,
    })
  }, [exchangeFoods, open])

  const orderedTargets = useMemo(() => orderedPortionTargets(targets), [targets])

  const target = useMemo(
    () =>
      orderedTargets.find((t) => t.groupCode === (activeGroup ?? open?.groupCode)) ??
      orderedTargets[0] ??
      null,
    [activeGroup, open, orderedTargets],
  )

  const foods = useMemo(
    () => (target ? filterPortionExchangeFoods(exchangeFoods, target.groupCode, search) : []),
    [exchangeFoods, search, target],
  )

  /**
   * Las dos secciones del sheet. `splitExchangeFoodsByOrigin` PARTE y no reordena: el orden ya lo
   * fijó el RPC (genéricos primero y, entre genéricos, el que tiene medida casera antes).
   */
  const sections = useMemo(() => splitExchangeFoodsByOrigin(foods), [foods])

  /**
   * Pie de atribución CONDICIONAL (S-08): se recalcula sobre las filas VISIBLES —o sea, con el
   * buscador ya aplicado—, porque describe lo que el alumno tiene delante. Si el filtro deja solo
   * ilustraciones propias, el pie desaparece; ponerlo fijo sería declarar una licencia falsa.
   */
  const showPhotoCredit = useMemo(() => photoCreditNeeded(foods), [foods])

  /**
   * Macros de 1 porción del grupo activo, con los COMPUESTOS ya expandidos (R11). Legumbres
   * (`LEG`) vive en la DB con `ref_* = 0` y `composed_of = [{P,1},{C,1}]`: la cabecera imprimía
   * «≈ 0 kcal · P 0 g · C 0 g · G 0 g» porque leía el ref crudo. El diccionario se reconstruye
   * desde los targets de la franja —que traen el `ref` CONGELADO de cada base dentro de
   * `composedOf`—, así que no hace falta ninguna lectura nueva y el número es el mismo que el
   * motor le suma al día.
   */
  const refPerPortion = useMemo(
    () => (target ? qeGroupRefPerPortion(target, orderedTargets) : null),
    [target, orderedTargets],
  )

  const view = target ? views[target.groupCode] : undefined
  const step = view ? nextPortionStep(view) : { portions: 1 as const, requiresConfirm: false }

  const handleMark = () => {
    if (!target) return
    if (step.requiresConfirm && !confirmExtra) {
      setConfirmExtra(true)
      return
    }
    setConfirmExtra(false)
    onMark(target, step.portions)
    // `nativeModal` lives above the screen tree; close after marking so the global
    // snackbar + Undo are immediately visible instead of expiring behind the modal.
    onClose()
  }

  /**
   * El cuerpo se arma como lista PLANA de hijos del `ScrollView` del `Sheet` porque
   * `stickyHeaderIndices` solo entiende índices de hijos DIRECTOS: los encabezados de sección
   * tienen que estar al mismo nivel que el bloque de cabecera y que las listas. Los índices se
   * calculan mientras se empuja —la posición cambia según haya tabs, resultados o una sección
   * vacía— en vez de fijarlos a mano.
   */
  const body: ReactNode[] = []
  const stickyIndices: number[] = []

  if (target) {
    const groupColor = portionTargetColor(target)
    const ref = refPerPortion ?? target.ref
    // Set chileno SIN chip referencial (SPEC §9.3): sus valores vienen del INTA y son la fuente
    // que este sheet publica. El chip queda para el set legado, que sí puede traer macros sin
    // confirmar. `CL_CODES` es la única señal disponible acá (el target no viaja con set).
    const isClSet = CL_CODES.has(target.groupCode)

    body.push(
      <View key="head" className="gap-4">
        <View className="flex-row items-start gap-3 pr-10">
          <GroupDot code={target.groupCode} color={groupColor} size={36} />
          <View className="min-w-0 flex-1">
            <Text className="font-display text-base font-semibold text-strong" numberOfLines={2}>
              {PORTIONS_COPY.student.sheetTitle(target.groupName)}
            </Text>
            <Text className="text-[11px] leading-4 text-muted">
              {`≈ ${Math.round(ref.calories)} kcal · P ${formatPortionsCl(ref.proteinG)} g · C ${formatPortionsCl(ref.carbsG)} g · G ${formatPortionsCl(ref.fatsG)} g`}
            </Text>
            {!target.macrosConfirmed && !isClSet ? (
              <View className="mt-1 self-start rounded-pill border border-warning-500/30 bg-warning-500/10 px-2 py-0.5">
                <Text className="text-[10px] font-semibold text-warning-700">
                  {PORTIONS_COPY.builder.referentialBadge}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {orderedTargets.length > 1 ? (
          <View className="flex-row flex-wrap gap-2">
            {orderedTargets.map((t) => {
              const active = t.groupCode === target.groupCode
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t.groupName}
                  onPress={() => {
                    setActiveGroup(t.groupCode)
                    setConfirmExtra(false)
                  }}
                  className={cx(
                    'min-h-9 flex-row items-center rounded-pill border px-3 py-1',
                    active ? 'border-primary bg-primary' : 'border-subtle bg-surface-card',
                  )}
                >
                  <Text
                    className={cx('text-xs font-semibold', !active && 'text-strong')}
                    style={active ? { color: theme.primaryForeground } : undefined}
                  >
                    {t.groupCode} · {t.groupName}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}

        <Text className="text-xs font-medium text-muted">
          {PORTIONS_COPY.student.sheetSubtitle}
        </Text>

        <View className="min-h-11 flex-row items-center gap-2 rounded-control border border-default bg-surface-app px-3">
          <Search color={theme.textSecondary} size={16} />
          <TextInput
            accessibilityLabel={PORTIONS_COPY.student.sheetSearchAria}
            autoCapitalize="none"
            autoCorrect={false}
            className="min-w-0 flex-1 py-2 text-sm text-strong"
            onChangeText={setSearch}
            placeholder={PORTIONS_COPY.student.sheetSearchPlaceholder}
            placeholderTextColor={theme.textSecondary}
            returnKeyType="search"
            value={search}
          />
        </View>
      </View>,
    )

    if (foods.length === 0) {
      body.push(
        <Text key="empty" className="py-8 text-center text-xs text-muted">
          {search.trim().length > 0
            ? PORTIONS_COPY.student.sheetNoResults
            : PORTIONS_COPY.student.sheetEmpty}
        </Text>,
      )
    } else {
      // Con el buscador activo, la sección que queda vacía NO dibuja su encabezado (SPEC §9.3):
      // por eso el push del header y el de sus filas van juntos dentro del mismo `if`.
      const pushSection = (key: string, title: string, rows: NutritionExchangeFoodRead[]) => {
        if (rows.length === 0) return
        stickyIndices.push(body.length)
        body.push(
          <View key={`${key}-header`} className="bg-surface-card" style={styles.sectionHeader}>
            <Text
              accessibilityRole="header"
              className="text-[11px] font-semibold leading-4 text-muted"
            >
              {title}
            </Text>
          </View>,
        )
        body.push(
          <View key={`${key}-rows`}>
            {rows.map((food, index) => (
              <EquivalenceRow
                key={food.foodId}
                divider={index > 0}
                food={food}
                groupCode={target.groupCode}
                groupColor={groupColor}
              />
            ))}
          </View>,
        )
      }

      pushSection('generics', PORTIONS_COPY.student.sheetGenericsTitle, sections.generic)
      pushSection('brands', PORTIONS_COPY.student.sheetBrandsTitle, sections.brands)

      if (showPhotoCredit) {
        body.push(
          <Text key="photo-credit" className="text-[10px] leading-4 text-muted">
            {PORTIONS_COPY.student.photoCredit}
          </Text>,
        )
      }
    }
  }

  return (
    <Sheet
      open={open != null}
      onClose={onClose}
      nativeModal
      snapPoints={['85%']}
      stickyHeaderIndices={stickyIndices.length > 0 ? stickyIndices : undefined}
      accessibilityLabel={
        target ? PORTIONS_COPY.student.sheetTitle(target.groupName) : PORTIONS_COPY.student.equivalences
      }
      footer={
        target ? (
          <View className="gap-2">
            {confirmExtra ? (
              <Text
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
                className="text-xs leading-4 text-warning-700"
              >
                {PORTIONS_COPY.student.extraConfirm(target.groupName)}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap items-center gap-2">
              <View className="min-w-36 flex-1">
                <NutritionMotionButton
                  accessibilityLabel={`${PORTIONS_COPY.student.sheetMark} de ${target.groupName}`}
                  tone={confirmExtra ? 'warning' : 'nutrition'}
                  onPress={handleMark}
                >
                  {PORTIONS_COPY.student.sheetMark}
                </NutritionMotionButton>
              </View>
              {onRegister ? (
                <View className="min-w-36 flex-1">
                  <NutritionMotionButton
                    accessibilityLabel={`${PORTIONS_COPY.student.sheetRegister} en esta comida`}
                    tone="neutral"
                    onPress={onRegister}
                  >
                    {PORTIONS_COPY.student.sheetRegister}
                  </NutritionMotionButton>
                </View>
              ) : null}
            </View>
          </View>
        ) : undefined
      }
    >
      {body.length > 0 ? body : <View />}
    </Sheet>
  )
}
