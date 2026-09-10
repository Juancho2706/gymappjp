'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { Search, X } from 'lucide-react'
import {
  photoCreditNeeded,
  photoSourceLabel,
  qeGroupRefPerPortion,
  splitExchangeFoodsByOrigin,
  systemOf,
  type NutritionExchangeFoodRead,
  type NutritionMealSlotRead,
  type NutritionSlotExchangeTargetRead,
} from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { foodMediaThumbnailUrlFromPath } from '@/lib/food-image'
import { useCaptureNutritionEquivalencesOpened } from '@/lib/posthog/events'
import { NutritionMotionButton } from '@/components/nutrition-v2'
import type { PortionMarksApi } from './PortionMarks'
import { PortionGroupCircle } from './PortionCoverageRow'
import { exchangeFoodsForGroup, orderedExchangeTargets } from './portion-marks.logic'
import { useSheetBodyMarker } from './useSheetBodyMarker'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/**
 * Fila de UNA equivalencia (W5.7 / M5): miniatura de 36 px, medida casera en negrita y los
 * gramos en mono debajo.
 *
 * MINIATURA. `next/image` con `unoptimized` —mismo patrón que `NutritionFoodRow`— porque la URL
 * ya apunta al objeto público de `food-media`: pasarla por el optimizador de Next (o por
 * `render/image` de Supabase) sería pagar transformaciones para bajar de 36 px a 36 px. El `src`
 * lo arma `foodMediaThumbnailUrlFromPath` con el `?v=` del cache-busting (R-02).
 *
 * FALLBACK. Sin foto se pinta el MARCADOR DEL GRUPO (`PortionGroupCircle` 36 px), que es lo que
 * este sheet ya usaba en la cabecera: el read model del sheet **no** trae `category` (el RPC emite
 * exactamente cuatro llaves nuevas), así que el «ícono por categoría» de `NutritionFoodRow` acá no
 * existe y no se inventa una derivación por nombre. 52 de los 557 genéricos no tienen imagen y
 * ninguna de esas filas puede quedar vacía (R-10 / D-2).
 *
 * CREDITO POR FILA. La fila cuya foto viene de Open Food Facts nombra su fuente en el `alt` y en
 * el `title`; sobre una ilustración propia `photoSourceLabel` devuelve `null` y no se agrega nada
 * —declararle «CC BY-SA» sería una licencia falsa (S-08)—.
 */
function EquivalenceRow({
  food,
  target,
}: {
  food: NutritionExchangeFoodRead
  target: NutritionSlotExchangeTargetRead
}) {
  const thumbnailUrl = foodMediaThumbnailUrlFromPath({
    objectPath: food.imagePath,
    version: food.imageVersion,
  })
  const photoSource = photoSourceLabel(food.imageLicense)

  return (
    <li className="flex min-h-11 items-center gap-3 py-2.5">
      {thumbnailUrl ? (
        <Image
          alt={photoSource ? `${food.name} · ${photoSource}` : food.name}
          className="h-9 w-9 shrink-0 rounded-control border border-border-subtle object-cover"
          height={36}
          loading="lazy"
          src={thumbnailUrl}
          title={photoSource ?? undefined}
          unoptimized
          width={36}
        />
      ) : (
        <PortionGroupCircle
          code={target.groupCode}
          color={target.color}
          size="md"
          sortOrder={target.orderIndex}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-strong">{food.name}</span>
        {food.brand ? <span className="block truncate text-xs text-muted">{food.brand}</span> : null}
      </span>
      <span className="shrink-0 text-right">
        {/* Medida casera en NEGRITA: es lo que reemplaza al PDF. Sin ella (el estado normal de las
            marcas tras D4-A) mandan los gramos y el guion desaparece. */}
        <span
          className={cx('block text-xs font-bold', food.portionLabel ? 'text-strong' : 'text-muted')}
        >
          {food.portionLabel ?? (food.portionGrams != null ? `${food.portionGrams} g` : '—')}
        </span>
        {food.portionLabel && food.portionGrams != null ? (
          <span className="block font-mono text-[10px] tabular-nums text-muted">
            {food.portionGrams} g
          </span>
        ) : null}
      </span>
    </li>
  )
}

/**
 * Una de las DOS secciones del sheet. Devuelve `null` cuando queda vacía —con el buscador activo
 * es lo normal— para no dibujar el encabezado de una sección sin filas (criterio de W5.7).
 * El encabezado es sticky: en una lista de hasta 60 filas el alumno tiene que saber si lo que está
 * mirando es un genérico del manual o una marca.
 */
function EquivalenceSection({
  foods,
  target,
  title,
}: {
  foods: NutritionExchangeFoodRead[]
  target: NutritionSlotExchangeTargetRead
  title: string
}) {
  if (foods.length === 0) return null
  return (
    <section>
      <h4 className="sticky top-0 z-10 -mx-4 bg-surface-card px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </h4>
      <ul className="divide-y divide-border-subtle">
        {foods.map((food) => (
          <EquivalenceRow food={food} key={food.foodId} target={target} />
        ))}
      </ul>
    </section>
  )
}

/**
 * Sheet de equivalencias V2 (SPEC UX-b): puerto del patrón `ExchangeEquivalencesSheet`
 * V1 al read-model V2 — TODO sale del snapshot congelado del target y de
 * `Today.exchangeFoods` (el sheet nunca consulta `exchange_groups` ni `foods` —
 * hallazgo F3). Tabs si la franja tiene varios grupos; badge referencial si
 * `macrosConfirmed=false`; CTAs "Marcar 1 porción" (mismo camino que el tap, con
 * confirmación de exceso inline) y "Registrar alimento" (flujo existente
 * preseleccionando la franja).
 */
export function PortionEquivalencesSheet({
  slot,
  initialGroupCode,
  exchangeFoods,
  api,
  onClose,
  onRegister,
}: {
  /** Franja abierta (null ⇒ sheet cerrado). */
  slot: NutritionMealSlotRead | null
  initialGroupCode: string | null
  exchangeFoods: NutritionExchangeFoodRead[] | undefined
  api: PortionMarksApi
  onClose: () => void
  /** Abre el flujo de registro existente preseleccionando la franja. */
  /**
   * Atajo a "Registrar alimento" desde el sheet. `null` cuando el plan está en solo alimentos
   * prescritos (`canRegisterFreely = false`, NUT-009): el botón desaparece en vez de abrir un
   * diálogo cuya escritura el servidor va a rechazar.
   */
  onRegister: ((slotCode: string) => void) | null
}) {
  const reduceMotion = useReducedMotion()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [activeCode, setActiveCode] = useState<string | null>(initialGroupCode)
  const [search, setSearch] = useState('')
  const [confirmExtra, setConfirmExtra] = useState(false)

  // Reset al abrir/cambiar de franja o grupo inicial (mismo patrón que el sheet V1).
  useEffect(() => {
    setActiveCode(initialGroupCode)
    setSearch('')
    setConfirmExtra(false)
  }, [slot?.id, initialGroupCode])

  const targets = useMemo(() => (slot ? orderedExchangeTargets(slot) : []), [slot])
  const target = targets.find((t) => t.groupCode === activeCode) ?? targets[0] ?? null

  /** Lista COMPLETA del grupo abierto (sin buscador): es la que describe el evento de apertura. */
  const groupFoods = useMemo(
    () => (target ? exchangeFoodsForGroup(exchangeFoods, target.groupCode) : []),
    [target, exchangeFoods],
  )

  /** Lo que el alumno tiene delante: la lista del grupo con el buscador ya aplicado. */
  const foods = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return groupFoods
    return groupFoods.filter((food) => food.name.toLowerCase().includes(term))
  }, [groupFoods, search])

  /**
   * Las dos secciones (D4-A): genéricos INTA/UDD arriba, marcas abajo. El split corre DESPUÉS del
   * buscador —así el filtro actúa dentro de cada sección— y NO reordena: el orden ya lo fijó el
   * RPC (`is_generic desc, portion_label_present desc, name, id`, dentro del `row_number()`).
   */
  const sections = useMemo(() => splitExchangeFoodsByOrigin(foods), [foods])

  /**
   * ¿El grupo abierto OFRECE genéricos? Es la única pregunta que el evento de apertura le hace a la
   * lista completa, y se memoiza acá —no dentro del efecto— para no volver a recorrer las hasta 60
   * filas del grupo en cada render del sheet.
   */
  const groupHasGeneric = useMemo(
    () => splitExchangeFoodsByOrigin(groupFoods).generic.length > 0,
    [groupFoods],
  )

  /**
   * Pie de atribución CONDICIONAL (S-08), calculado sobre lo VISIBLE: si el buscador deja solo
   * ilustraciones propias, el pie de Open Food Facts desaparece.
   */
  const showPhotoCredit = useMemo(() => photoCreditNeeded(foods), [foods])

  /**
   * Macros de UNA porción con los grupos COMPUESTOS expandidos (W2.9 / R11). El ref crudo de
   * Legumbres es `0` en la DB —su valor vive en `composed_of` = 1P + 1C— y la cabecera imprimía
   * «≈ 0 kcal · P 0 g · C 0 g». `qeGroupRefPerPortion` le pide la expansión al MISMO motor que
   * ve el alumno (`macrosForTargets`), sobre los targets CONGELADOS de la franja: los
   * `composedOf` del read model traen el `ref` de cada base, así que el diccionario se reconstruye
   * sin consultar el catálogo vivo. Fallback honesto al ref crudo si el motor no puede responder.
   */
  const headerRef = useMemo(() => (target ? qeGroupRefPerPortion(target, targets) : null), [target, targets])

  const open = slot !== null && target !== null

  // Mismo mecanismo que `TodayModal`: mientras el sheet vive, la cápsula flotante del nav del
  // alumno se oculta por CSS. Sin esto el nav (hermano del `<main relative z-0>`, z-index 59)
  // queda ENCIMA de los CTAs "Marcar 1 porción" / "Registrar alimento" del pie del sheet.
  useSheetBodyMarker(open)

  // Escape cierra el sheet (misma tecla que el `TodayModal`).
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /**
   * PostHog `nutrition_equivalences_opened` (DATA §11, evento 5). Metadatos de la apertura y nada
   * más: **sin `group_code`** —este evento es del ALUMNO y su pauta nutricional no se ata a su
   * distinct_id— y sin nombres ni cifras. El payload lo arma el constructor del paquete, el mismo
   * que llama RN.
   *
   * UNA VEZ POR APERTURA, NO POR CAMBIO DE TAB (DATA §11, evento 5, literal; el mismo contrato que
   * documenta `portions-analytics.ts`: «se emite UNA vez por APERTURA… el guard es de la
   * superficie»). Por eso el `ref` recuerda SOLO el `slot.id`: ni los re-renders, ni el doble
   * efecto de StrictMode, ni el `setActiveCode` de las tabs duplican la captura —una franja con 5
   * grupos emitiría 5 aperturas y el embudo de D4-A leería el doble o el triple de lo real—. Se
   * limpia al cerrar, así que reabrir la MISMA franja sí vuelve a contar.
   *
   * `set` sale del CÓDIGO del grupo con `systemOf(..., 'smae')` (decisión de W5.7; el SDD no dice
   * de dónde sacarlo en la superficie del alumno): el read model del alumno no trae
   * `coaches.portion_system` ni el `portionSystem` del grupo, y el sheet no puede pedirlos sin una
   * consulta que F3 prohíbe. Con este fallback los 13 códigos chilenos se reconocen exactos y los
   * SMAE también; solo un grupo PROPIO del coach (código arbitrario) queda contado como 'smae'.
   * El fallback contrario ('cl', el default de la columna) marcaría 'cl' a TODO el set SMAE, que
   * es justo la mitad que este evento tiene que distinguir.
   *
   * Los conteos van sobre la lista COMPLETA del grupo, no sobre la filtrada: el evento describe lo
   * que el grupo ofrece al abrirse, no lo que el alumno tecleó después.
   */
  const captureEquivalencesOpened = useCaptureNutritionEquivalencesOpened()
  const capturedOpenRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !slot || !target) {
      capturedOpenRef.current = null
      return
    }
    if (capturedOpenRef.current === slot.id) return
    capturedOpenRef.current = slot.id
    captureEquivalencesOpened({
      set: systemOf({ groupCode: target.groupCode }, 'smae'),
      hasGeneric: groupHasGeneric,
      rows: groupFoods.length,
    })
  }, [open, slot, target, groupFoods, groupHasGeneric, captureEquivalencesOpened])

  // Foco inicial en el panel al abrir. Efecto aparte de Escape a propósito: `onClose` llega como
  // arrow inline desde `TodayExperience`, así que cambia de identidad en cada render y un efecto
  // único robaría el foco del buscador mientras el alumno escribe.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
  }, [open])

  const handleMark = () => {
    if (!slot || !target) return
    const next = api.nextMarkFor(slot.code, target)
    if (next.extra && !confirmExtra) {
      setConfirmExtra(true)
      return
    }
    setConfirmExtra(false)
    api.mark({ slot, target, portions: next.extra ? 1 : next.portions })
  }

  return (
    <AnimatePresence>
      {open && slot && target ? (
        <>
          <motion.button
            animate={{ opacity: 1 }}
            aria-label={PORTIONS_COPY.student.close}
            className="fixed inset-0 z-50 bg-black/50"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            type="button"
          />
          <motion.div
            animate={{ y: 0 }}
            aria-label={PORTIONS_COPY.student.sheetTitle(target.groupName)}
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-t border-border-subtle bg-surface-card pb-safe shadow-xl outline-none md:bottom-4 md:rounded-3xl md:border"
            exit={{ y: reduceMotion ? 0 : '100%' }}
            initial={{ y: reduceMotion ? 0 : '100%' }}
            ref={panelRef}
            role="dialog"
            style={{ maxHeight: '85dvh' }}
            tabIndex={-1}
            transition={{ type: 'tween', duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
          >
            <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-default" />

            {/* Header: circulito + título + "1 porción ≈ ref" + badge referencial. */}
            <div className="flex items-start gap-3 px-4 pb-2 pt-3">
              <PortionGroupCircle
                code={target.groupCode}
                color={target.color}
                size="md"
                sortOrder={target.orderIndex}
              />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-base font-semibold text-strong">
                  {PORTIONS_COPY.student.sheetTitle(target.groupName)}
                </h3>
                <p className="text-[11px] text-muted">
                  ≈ {Math.round((headerRef ?? target.ref).calories)} kcal · P{' '}
                  {Math.round((headerRef ?? target.ref).proteinG)} g · C{' '}
                  {Math.round((headerRef ?? target.ref).carbsG)} g · G{' '}
                  {Math.round((headerRef ?? target.ref).fatsG)} g
                </p>
                {!target.macrosConfirmed ? (
                  <span className="mt-1 inline-flex rounded-pill border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                    {PORTIONS_COPY.builder.referentialBadge}
                  </span>
                ) : null}
              </div>
              <button
                aria-label={PORTIONS_COPY.student.close}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onClose}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs si la franja prescribe varios grupos. */}
            {targets.length > 1 ? (
              <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
                {targets.map((t) => {
                  const active = t.groupCode === target.groupCode
                  return (
                    <button
                      aria-pressed={active}
                      className={cx(
                        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'border-primary bg-primary/100 text-white'
                          : 'border-border-subtle bg-surface-card text-strong hover:bg-surface-sunken',
                      )}
                      key={t.id}
                      onClick={() => {
                        setActiveCode(t.groupCode)
                        setConfirmExtra(false)
                      }}
                      type="button"
                    >
                      {t.groupCode} · {t.groupName}
                    </button>
                  )
                })}
              </div>
            ) : null}

            <p className="px-4 pb-1 text-xs font-medium text-muted">
              {PORTIONS_COPY.student.sheetSubtitle}
            </p>

            <div className="px-4 pb-2">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                />
                <input
                  aria-label={PORTIONS_COPY.student.sheetSearchAria}
                  className="min-h-11 w-full rounded-control border border-border-default bg-surface-app pl-9 pr-3 text-sm text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={PORTIONS_COPY.student.sheetSearchPlaceholder}
                  type="search"
                  value={search}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
              {foods.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">
                  {search.trim().length > 0
                    ? PORTIONS_COPY.student.sheetNoResults
                    : PORTIONS_COPY.student.sheetEmpty}
                </p>
              ) : (
                <>
                  <EquivalenceSection
                    foods={sections.generic}
                    target={target}
                    title={PORTIONS_COPY.student.sheetGenericsTitle}
                  />
                  <EquivalenceSection
                    foods={sections.brands}
                    target={target}
                    title={PORTIONS_COPY.student.sheetBrandsTitle}
                  />
                </>
              )}
            </div>

            {/* CTAs al pie: marcar (mismo camino del tap) y registrar (flujo existente). */}
            <div className="border-t border-border-subtle px-4 py-3">
              {/* Atribución de las fotos: UNA sola vez y solo si alguna fila visible la exige. Va
                  acá, fuera del scroll, para que el crédito se vea sin llegar al final de 60
                  filas. */}
              {showPhotoCredit ? (
                <p className="mb-2 text-[10px] text-subtle">{PORTIONS_COPY.student.photoCredit}</p>
              ) : null}
              {confirmExtra ? (
                <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                  {PORTIONS_COPY.student.extraConfirm(target.groupName)}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <NutritionMotionButton
                  className="min-h-11 flex-1"
                  onClick={handleMark}
                  tone={confirmExtra ? 'warning' : 'nutrition'}
                >
                  {PORTIONS_COPY.student.sheetMark}
                </NutritionMotionButton>
                {onRegister ? (
                  <NutritionMotionButton
                    className="min-h-11 flex-1"
                    onClick={() => onRegister(slot.code)}
                    tone="neutral"
                  >
                    {PORTIONS_COPY.student.sheetRegister}
                  </NutritionMotionButton>
                ) : null}
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
