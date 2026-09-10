import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  convertPortionsToCl,
  formatPortionsEsCl,
  isDairy,
  systemOf,
  type ClConversionDayDelta,
  type ClConversionResult,
  type ClConversionRow,
  type ClConversionUnresolved,
  type ClDairyCode,
  type PortionSystem,
  type QePortionGroup,
  type QeVariant,
} from '@eva/nutrition-v2'
import { Sheet } from '../../Sheet'
import { NutritionMotionButton } from '../NutritionV2Kit'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import {
  captureNutritionPortionConversionApplied,
  captureNutritionPortionConversionPreviewed,
} from '../../../lib/analytics'

/**
 * Preview de la conversión SMAE → set chileno (W3.5, SPEC §7.2, mockup M2).
 *
 * LA PROMESA DURA (S4 / T-05): acá NO se escribe nada. El motor (`convertPortionsToCl`) es puro y
 * devuelve variantes NUEVAS; el botón primario solo despacha `REPLACE_PORTION_GROUPS` sobre el
 * BORRADOR en memoria, y publicar sigue siendo un paso aparte que el coach da a mano por el camino
 * de siempre. Jamás un `UPDATE` de `portions` sobre una versión publicada: sus snapshots están
 * congelados y un plan publicado no cambia de significado porque cambie el catálogo.
 *
 * Quién decide qué: el motor. Esta hoja NO reimplementa ni una regla — ni el colapso `ARL` + `G`
 * en `AG` (R2), ni el factor del eje lácteo (R3), ni el match de los grupos custom (S5), ni el
 * orden de la franja (R-08). Solo junta las TRES elecciones del coach (destino lácteo por franja,
 * reemplazos custom aceptados) y vuelve a preguntarle al motor. Si una regla se mueve, se mueve en
 * `exchange-conversion.ts` y esta pantalla la refleja sola.
 *
 * Alcance de lo que se PINTA: TODOS los días que la conversión toca, cada uno con su bloque, sus
 * franjas y su delta. Lo aplicado son TODAS las variantes (`result.variants`) —convertir medio
 * plan dejaría una franja del martes en SMAE y otra del lunes en chileno, y el alumno vería dos
 * sistemas en la misma pauta—, así que pintar un solo día era prometer una revisión que no
 * existía: los demás se convertían con el default 'LD' y sus filas «Revisar» no se veían nunca.
 * El día activo va PRIMERO (es el que el coach está mirando) y el resto sigue el orden del plan.
 *
 * Todos los textos salen de `PORTIONS_COPY` (§16.1 y las llaves que W3 sumó a la tabla
 * compartida): ni un literal de producto vive acá. Un texto suelto en una superficie es
 * exactamente el drift que esa tabla existe para impedir —la hoja RN y el diálogo web dirían
 * «se conserva» con dos redacciones distintas y nadie los leería juntos—.
 */

/** Orden del selector del eje lácteo: descremado primero, que es el default (R3, Q3). */
const DAIRY_ORDER: readonly ClDairyCode[] = ['LD', 'LS', 'LE'] as const

/** Default del eje lácteo (R3, Q3). Mismo valor que usa el motor cuando la franja no eligió. */
const DEFAULT_DAIRY: ClDairyCode = 'LD'

/**
 * Resultado VACÍO con el que se responde mientras la hoja está cerrada. No es una optimización
 * cosmética: `convertPortionsToCl` recorre todas las variantes y llama `dayTotalsByVariant` dos
 * veces sobre el plan entero, y `variants` cambia de identidad en CADA acción del reducer (tipear
 * un gramo, una nota, una meta). Sin este corte, todo coach del editor pagaría el motor de macros
 * por tecla —incluido el que nunca va a ver el banner—.
 */
const EMPTY_RESULT: ClConversionResult = {
  variants: [],
  diff: [],
  unresolved: [],
  dayDeltas: [],
}

/** Filas convertidas y grupos conservados de UNA franja. */
type SlotBlock = {
  slotKey: string
  slotName: string
  rows: ClConversionRow[]
  kept: ClConversionUnresolved[]
}

/** Un DÍA del plan que la conversión toca: sus franjas y su delta de kcal. */
type DayBlock = {
  variantKey: string
  label: string
  slots: SlotBlock[]
  delta: ClConversionDayDelta | null
}

/** kcal del preview: enteras. El motor ya redondea a un decimal; acá no se muestra el decimal. */
function kcalText(value: number): string {
  return String(Math.round(value))
}

/**
 * Chip «Revisar» (§7.2): destino lácteo, o drift de kcal > 10 %. Mismo tinte warning del kit y
 * el MISMO borde `/30` que el chip «Legado (SMAE)» de §7.1: son dos avisos ámbar de la misma
 * familia y en la misma pantalla, y dos bordes distintos se leen como dos estados distintos.
 */
function ReviewChip() {
  return (
    <View className="rounded-pill border border-warning-500/30 bg-warning-500/10 px-1.5 py-0.5">
      <Text className="text-[10px] font-bold uppercase tracking-wide text-warning-700">
        {PORTIONS_COPY.convert.review}
      </Text>
    </View>
  )
}

/** Encabezado de franja: mismo «eyebrow» mono del picker (M1/M2 comparten lenguaje). */
function SlotHeader({ label }: { label: string }) {
  return (
    <Text className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</Text>
  )
}

/**
 * Encabezado del DÍA. Es lo que vuelve honesta la revisión: la conversión aplica a todo el plan,
 * así que cada día que se mueve se pinta con su nombre y no «se estima» desde el que está abierto.
 */
function DayHeader({ label }: { label: string }) {
  return <Text className="text-sm font-bold text-strong">{label}</Text>
}

/**
 * Delta de kcal del día (§7.2). Es lo ÚNICO que le dice a la nutricionista si el redondeo la
 * movió del objetivo. Sale del motor real (`dayTotalsByVariant`), el mismo cálculo que ve el
 * alumno; sin delta no se inventa una cifra.
 */
function DayDeltaRow({ delta }: { delta: ClConversionDayDelta }) {
  return (
    <View className="flex-row items-center gap-2 border-t border-subtle pt-1.5">
      <Text className="min-w-0 flex-1 text-sm font-semibold text-strong" numberOfLines={1}>
        {delta.label}
      </Text>
      <Text className="text-sm font-semibold text-strong">
        {`${kcalText(delta.before.calories)} → ${kcalText(delta.after.calories)} kcal`}
      </Text>
    </View>
  )
}

/**
 * Fila origen → destino. La COLAPSADA (R2) se pinta con sus dos orígenes en UNA línea
 * («Alimento rico en lípidos 1 + Grasa de cocina 1 → Aceites y grasas 2»): dos filas al mismo
 * destino serían mentira, porque el payload emite un solo target por grupo.
 */
function ConversionRow({ row }: { row: ClConversionRow }) {
  const fromLabel = row.from
    .map((origin) => `${origin.name} ${formatPortionsEsCl(origin.portions)}`)
    .join(' + ')
  return (
    <View className="gap-1 rounded-control border border-subtle bg-surface-card px-3 py-2">
      <Text className="text-sm leading-5 text-body">
        {fromLabel}
        <Text className="text-sm font-semibold text-strong">
          {`  →  ${row.toName} ${formatPortionsEsCl(row.toPortions)}`}
        </Text>
      </Text>
      <View className="flex-row items-center gap-2">
        {row.review ? <ReviewChip /> : null}
        <Text className="text-xs text-muted">
          {`${kcalText(row.kcalBefore)} → ${kcalText(row.kcalAfter)} kcal`}
        </Text>
      </View>
    </View>
  )
}

/**
 * Selector de tres del eje lácteo, POR FRANJA (R3). Cambiar la opción re-corre el motor entero:
 * el factor es por kcal y el resultado (porciones y delta del día) cambia con la elección. La fila
 * queda marcada «Revisar» pase lo que pase — es el eje donde el redondeo más se mueve.
 */
function DairyChoiceRow({
  value,
  disabled,
  onChange,
}: {
  value: ClDairyCode
  disabled: boolean
  onChange: (choice: ClDairyCode) => void
}) {
  return (
    // `radiogroup` con tres `radio`: son tres opciones EXCLUYENTES, no tres botones sueltos. El
    // grupo necesita nombre propio (`dairyLabel`) porque no tiene texto visible —repetir un
    // eyebrow «Tipo de lácteo» en cada fila láctea sería ruido—, y sin él un lector de pantalla
    // anuncia «Descremado, Semi, Entero» sin decir jamás de qué se está eligiendo el tipo.
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={PORTIONS_COPY.convert.dairyLabel}
      className="flex-row items-center gap-1.5 rounded-control border border-subtle bg-surface-sunken p-1"
    >
      {DAIRY_ORDER.map((code) => {
        const selected = code === value
        const label = PORTIONS_COPY.convert.dairyChoice[code]
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(code)}
            className={
              selected
                ? 'min-h-11 flex-1 items-center justify-center rounded-control bg-primary px-2'
                : 'min-h-11 flex-1 items-center justify-center rounded-control px-2 active:bg-surface-card'
            }
          >
            <Text
              className={
                selected
                  ? 'text-xs font-bold text-white'
                  : 'text-xs font-semibold text-muted'
              }
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/**
 * Por qué un grupo se conserva, con la redacción de la tabla compartida. Las TRES razones de
 * `ClConversionUnresolvedReason` tienen su propia línea: decirle «es tuyo» a un grupo del sistema
 * que solo espera a que los 13 chilenos se publiquen (W6.8) sería mentirle al coach sobre su
 * propio catálogo.
 */
function keptReasonText(entry: ClConversionUnresolved): string {
  if (entry.reason === 'sin_regla') return PORTIONS_COPY.convert.keptUnknown(entry.groupName)
  if (entry.reason === 'destino_ausente_en_catalogo') {
    return PORTIONS_COPY.convert.keptMissingTarget(entry.groupName)
  }
  return PORTIONS_COPY.convert.keptCustom(entry.groupName)
}

/**
 * Grupo PROPIO que el motor no supo convertir. Dos formas y ninguna más:
 *  - con `suggestedCode` (match único, ±5 kcal / ±1 g) ⇒ propuesta con confirmación EXPLÍCITA;
 *  - sin sugerencia ⇒ se dice POR QUÉ se conserva, y punto.
 * El grupo custom NUNCA se borra: soft-borrarlo rompería borradores ajenos.
 */
function UnresolvedRow({
  entry,
  suggestionName,
  accepted,
  disabled,
  onToggle,
}: {
  entry: ClConversionUnresolved
  suggestionName: string | null
  accepted: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const canPropose = entry.suggestedCode != null && suggestionName != null
  // El rótulo NO cambia al aceptar: es un checkbox, y su estado lo dice `accessibilityState`
  // (y el fondo). Un texto que se reescribe bajo el dedo obliga a leer de nuevo lo mismo.
  const proposeLabel = canPropose
    ? PORTIONS_COPY.convert.replace(entry.groupName, suggestionName)
    : ''
  return (
    <View className="gap-1.5 rounded-control border border-dashed border-default px-3 py-2">
      <Text className="text-sm leading-5 text-body" numberOfLines={2}>
        {entry.groupName}
      </Text>
      {canPropose ? (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={proposeLabel}
            accessibilityState={{ checked: accepted, disabled }}
            disabled={disabled}
            onPress={onToggle}
            className={
              accepted
                ? 'min-h-11 items-start justify-center rounded-control bg-primary/10 px-2'
                : 'min-h-11 items-start justify-center rounded-control px-2 active:bg-surface-sunken'
            }
          >
            <Text
              className={
                accepted ? 'text-xs font-bold text-primary' : 'text-xs font-semibold text-primary'
              }
            >
              {proposeLabel}
            </Text>
          </Pressable>
          <Text className="text-[11px] leading-4 text-muted">
            {PORTIONS_COPY.convert.replaceHint}
          </Text>
        </>
      ) : (
        <Text className="text-xs leading-4 text-muted">{keptReasonText(entry)}</Text>
      )}
    </View>
  )
}

export function PortionConversionSheet({
  open,
  onClose,
  variants,
  catalog,
  coachSystem,
  activeVariantKey,
  disabled = false,
  onApply,
}: {
  open: boolean
  onClose: () => void
  /** Borrador COMPLETO del editor: la conversión se aplica a todas las variantes, no a una. */
  variants: readonly QeVariant[]
  /**
   * Catálogo VIVO del coach ya proyectado (`catalogToPortionGroups`). Es de donde salen los 13
   * grupos chilenos: sin él el motor no tiene destinos y todo cae a «se conserva».
   */
  catalog: readonly QePortionGroup[]
  /** `coaches.portion_system`; sin dato, el default de la columna ('cl'), igual que el motor. */
  coachSystem: PortionSystem
  /** Variante que el editor está mostrando: su bloque va PRIMERO. Los demás días igual se pintan. */
  activeVariantKey: string | null
  disabled?: boolean
  /**
   * Aplicar al BORRADOR. El `dispatch` vive en el orquestador (mismo reparto que el resto de esta
   * carpeta: las hojas avisan, `QuickEditMode` despacha), así que acá solo viajan las variantes
   * nuevas que devolvió el motor.
   */
  onApply: (nextVariants: QeVariant[]) => void
}) {
  /** Elección del eje lácteo por franja. Vacío = todas en 'LD' (el default lo pone el motor). */
  const [dairyChoiceBySlot, setDairyChoiceBySlot] = useState<Record<string, ClDairyCode>>({})
  /** Reemplazos de grupos propios ACEPTADOS por el coach: `exchangeGroupId` → código chileno. */
  const [customReplacements, setCustomReplacements] = useState<Record<string, string>>({})

  /**
   * El motor SOLO corre con la hoja abierta (ver `EMPTY_RESULT`). Montada y cerrada —que es lo
   * que pasa en todo el editor RN, se abra el banner o no— este `useMemo` se recalculaba en cada
   * acción del reducer, porque `variants` es `state.variants` y cambia de identidad por tecla.
   */
  const result: ClConversionResult = useMemo(
    () =>
      open
        ? convertPortionsToCl({
            variants,
            catalog,
            coachSystem,
            dairyChoiceBySlot,
            customReplacements,
          })
        : EMPTY_RESULT,
    [open, variants, catalog, coachSystem, dairyChoiceBySlot, customReplacements],
  )

  /**
   * Los conteos del evento (DATA §11, evento 2 — la ÚNICA fuente de la forma). Se cuentan sobre
   * TODO el plan, no sobre el día visible: es lo que la conversión va a tocar. Ni kcal, ni
   * porciones, ni nombres de grupo — el evento mide fricción, no la pauta.
   */
  const counts = useMemo(() => {
    const slotKeys = new Set<string>()
    let rowsReview = 0
    let hasDairy = false
    let hasCollapse = false
    for (const row of result.diff) {
      slotKeys.add(`${row.variantKey}:${row.slotKey}`)
      if (row.review) rowsReview += 1
      if (isDairy(row.toCode)) hasDairy = true
      // Colapso ARL + G ⇒ una fila con DOS orígenes (R2).
      if (row.from.length > 1) hasCollapse = true
    }
    return {
      slots: slotKeys.size,
      rows: result.diff.length,
      rowsReview,
      hasDairy,
      hasCollapse,
      hasCustomMatch: result.unresolved.some((entry) => entry.suggestedCode != null),
    }
  }, [result.diff, result.unresolved])

  /**
   * `nutrition_portion_conversion_previewed` UNA vez por apertura, con el resultado de los
   * defaults. Los conteos viajan en un ref para que cambiar el selector de lácteo —que re-corre el
   * motor y puede mover `rows_review`— no dispare un segundo evento por la misma mirada. El ref se
   * actualiza en un EFECTO y no durante el render: escribirle a un ref mientras se renderiza es
   * render impuro, y con StrictMode / renders descartados es una cifra que nadie pidió.
   */
  const previewedRef = useRef(false)
  const countsRef = useRef(counts)
  useEffect(() => {
    countsRef.current = counts
  }, [counts])
  useEffect(() => {
    if (!open) {
      previewedRef.current = false
      return
    }
    if (previewedRef.current) return
    // Sin una sola fila que convertir no hubo preview que medir: emitirlo mete un embudo lleno de
    // ceros (el banner puede abrirse sobre un plan que no tiene nada que mover).
    if (countsRef.current.rows === 0) return
    previewedRef.current = true
    captureNutritionPortionConversionPreviewed({
      slots: countsRef.current.slots,
      rows: countsRef.current.rows,
      rowsReview: countsRef.current.rowsReview,
      hasDairy: countsRef.current.hasDairy,
      hasCollapse: countsRef.current.hasCollapse,
      hasCustomMatch: countsRef.current.hasCustomMatch,
    })
  }, [open, counts])

  /** Cada apertura empieza limpia: las elecciones de la vez anterior no son un default honesto. */
  useEffect(() => {
    if (open) return
    setDairyChoiceBySlot({})
    setCustomReplacements({})
  }, [open])

  const activeKey = activeVariantKey ?? variants[0]?.variantKey ?? null

  /** Nombre del grupo chileno propuesto, por código: la propuesta se lee, no se descifra. */
  const clNameByCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of catalog) map.set(group.groupCode, group.groupName)
    return map
  }, [catalog])

  /**
   * Bloques por DÍA y, dentro de cada día, por franja. Se arman recorriendo el BORRADOR (igual
   * que el diálogo web), no el `diff` del motor: así el orden es el del plan sin tener que
   * reconstruirlo (R-08), el nombre de la franja sale de su dueño y —lo importante— una franja
   * entra si convierte algo O si conserva algo.
   *
   * Ese «o» no es cosmético. Los `unresolved` de un día que no convirtió ni una fila se estaban
   * descartando, y con ellos se iba la propuesta S5: un grupo propio con match único que vive en
   * un día tranquilo nunca mostraba su checkbox «Reemplazar «X» por «Y»», así que el coach no
   * podía aceptar el reemplazo que habría destrabado la conversión. Y de paso ese descarte era
   * el que dejaba el preview sin secciones sobre un borrador que sí es legado.
   *
   * El día ACTIVO va primero porque es el que el coach tiene en pantalla; los demás quedan en el
   * orden del plan (`sort` es estable, así que devolver 0 los deja donde estaban). Un día que no
   * mueve ni conserva nada no se pinta: la revisión es de lo que la conversión toca.
   */
  const dayBlocks = useMemo<DayBlock[]>(() => {
    const deltaByVariant = new Map(result.dayDeltas.map((delta) => [delta.variantKey, delta]))
    const days: DayBlock[] = []
    for (const variant of variants) {
      const slots: SlotBlock[] = []
      for (const slot of variant.slots) {
        const rows = result.diff.filter(
          (row) => row.variantKey === variant.variantKey && row.slotKey === slot.key,
        )
        const kept = result.unresolved.filter(
          (entry) => entry.variantKey === variant.variantKey && entry.slotKey === slot.key,
        )
        if (rows.length === 0 && kept.length === 0) continue
        slots.push({ slotKey: slot.key, slotName: slot.name, rows, kept })
      }
      if (slots.length === 0) continue
      const delta = deltaByVariant.get(variant.variantKey) ?? null
      // El nombre del día sale del motor y, si no vino, del borrador. Nunca se inventa.
      days.push({
        variantKey: variant.variantKey,
        label: delta?.label ?? variant.label,
        slots,
        delta,
      })
    }
    return days.sort((a, b) => {
      if (a.variantKey === activeKey) return -1
      if (b.variantKey === activeKey) return 1
      return 0
    })
  }, [result.diff, result.unresolved, result.dayDeltas, activeKey, variants])

  /**
   * ¿El BORRADOR todavía prescribe con el set viejo? Espejo exacto de `draftUsesSmae` (web): se
   * pregunta grupo por grupo con `systemOf`, la misma función que parte el picker, sobre el
   * catálogo ya enriquecido; un target cuyo grupo ya no está se resuelve por su `groupCode`
   * congelado, que es lo único que quedó de él.
   *
   * Existe por UNA razón: el preview vacío tiene dos causas y solo una es «ya migraste». Un
   * target SMAE con `portions` vacío o ilegible («» mientras el coach tipea, «abc») sale INTACTO
   * del motor y no entra ni a `diff` ni a `unresolved`, así que un borrador 100 % SMAE puede
   * llegar acá sin una sola sección. Felicitarlo ahí por una migración que no hizo —justo abajo
   * del banner que le dijo lo contrario— es el peor texto posible.
   */
  const draftUsesSmae = useMemo(() => {
    const byId = new Map(catalog.map((group) => [group.exchangeGroupId, group]))
    return variants.some((variant) =>
      variant.slots.some((slot) =>
        slot.portionTargets.some((target) => {
          const group = byId.get(target.exchangeGroupId)
          return systemOf(group ?? { groupCode: target.groupCode }, coachSystem) === 'smae'
        }),
      ),
    )
  }, [variants, catalog, coachSystem])

  /**
   * Qué eligió el coach en el eje lácteo, para el evento del aplicado (DATA §11, evento 3): un
   * solo destino ⇒ ese código; dos o más ⇒ 'mixed'. Sin eje lácteo en el plan viaja el default
   * vigente, que es lo que el motor usó.
   */
  const appliedDairyChoice = useMemo<ClDairyCode | 'mixed'>(() => {
    const codes = new Set<ClDairyCode>()
    for (const row of result.diff) if (isDairy(row.toCode)) codes.add(row.toCode)
    if (codes.size === 0) return DEFAULT_DAIRY
    if (codes.size > 1) return 'mixed'
    return [...codes][0] ?? DEFAULT_DAIRY
  }, [result.diff])

  const canApply = result.diff.length > 0 && !disabled

  const body: ReactNode[] = []
  for (const day of dayBlocks) {
    const slotViews: ReactNode[] = []
    for (const block of day.slots) {
      slotViews.push(
        <View key={`slot:${day.variantKey}:${block.slotKey}`} className="gap-1.5">
          {block.slotName.trim() === '' ? null : <SlotHeader label={block.slotName} />}
          {block.rows.map((row) => (
            <View key={`${block.slotKey}:${row.toCode}`} className="gap-1.5">
              <ConversionRow row={row} />
              {/* El selector va DEBAJO DE SU FILA (M2) y no al pie de la franja: con dos filas y
                  una láctea, un control al final queda huérfano y nadie sabe a cuál manda. Se
                  pregunta por el DESTINO —el eje lácteo es el único que el coach elige— y la
                  elección es POR FRANJA, que es la llave que entiende el motor. */}
              {isDairy(row.toCode) ? (
                <DairyChoiceRow
                  value={dairyChoiceBySlot[block.slotKey] ?? DEFAULT_DAIRY}
                  disabled={disabled}
                  onChange={(choice) =>
                    setDairyChoiceBySlot((prev) => ({ ...prev, [block.slotKey]: choice }))
                  }
                />
              ) : null}
            </View>
          ))}
          {/* Cabecera del bloque conservado (§16.1, `keptTitle`). Sin ella el borde punteado era
              la única pista de que esos grupos NO se convierten, y un borde no es un rótulo. */}
          {block.kept.length === 0 ? null : (
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
              {PORTIONS_COPY.convert.keptTitle}
            </Text>
          )}
          {block.kept.map((entry) => {
            const suggestionName =
              entry.suggestedCode == null ? null : clNameByCode.get(entry.suggestedCode) ?? null
            return (
              <UnresolvedRow
                key={`kept:${block.slotKey}:${entry.exchangeGroupId}`}
                entry={entry}
                suggestionName={suggestionName}
                accepted={
                  entry.suggestedCode != null &&
                  customReplacements[entry.exchangeGroupId] === entry.suggestedCode
                }
                disabled={disabled}
                onToggle={() => {
                  const code = entry.suggestedCode
                  if (code == null) return
                  setCustomReplacements((prev) => {
                    const next = { ...prev }
                    if (next[entry.exchangeGroupId] === code) delete next[entry.exchangeGroupId]
                    else next[entry.exchangeGroupId] = code
                    return next
                  })
                }}
              />
            )
          })}
        </View>,
      )
    }
    body.push(
      <View key={`day:${day.variantKey}`} className="gap-2">
        {day.label.trim() === '' ? null : <DayHeader label={day.label} />}
        {slotViews}
        {day.delta ? <DayDeltaRow delta={day.delta} /> : null}
      </View>,
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['85%']}
      title={PORTIONS_COPY.convert.title}
      accessibilityLabel={PORTIONS_COPY.convert.title}
      footer={
        <View className="gap-2">
          {/* El delta ya no vive acá: cada DÍA cierra con el suyo (`DayDeltaRow`), porque la
              conversión toca todos y un solo número al pie hablaría por un plan entero. */}
          <Text className="text-xs leading-4 text-muted">{PORTIONS_COPY.convert.footer}</Text>
          {/* Gotcha del proyecto: dos botones en fila SIEMPRE cada uno en su `flex-1`. */}
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <NutritionMotionButton
                accessibilityLabel={PORTIONS_COPY.groupEditor.cancel}
                tone="neutral"
                disabled={disabled}
                onPress={onClose}
              >
                {PORTIONS_COPY.groupEditor.cancel}
              </NutritionMotionButton>
            </View>
            <View className="flex-1">
              <NutritionMotionButton
                accessibilityLabel={PORTIONS_COPY.convert.cta}
                disabled={!canApply}
                onPress={() => {
                  if (!canApply) return
                  onApply(result.variants)
                  captureNutritionPortionConversionApplied({
                    slots: counts.slots,
                    rows: counts.rows,
                    dairyChoice: appliedDairyChoice,
                    customReplaced: Object.keys(customReplacements).length,
                  })
                  onClose()
                }}
              >
                {PORTIONS_COPY.convert.cta}
              </NutritionMotionButton>
            </View>
          </View>
        </View>
      }
    >
      <Text className="text-sm leading-5 text-body">{PORTIONS_COPY.convert.intro}</Text>
      {body.length === 0 ? (
        <Text className="text-sm leading-5 text-muted">
          {draftUsesSmae ? PORTIONS_COPY.convert.emptyNoAmount : PORTIONS_COPY.convert.empty}
        </Text>
      ) : (
        body
      )}
    </Sheet>
  )
}
