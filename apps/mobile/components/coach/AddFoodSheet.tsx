import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import {
  CUSTOM_FOOD_MACRO_MAX,
  NUTRITION_MACROS,
  macroPreviewPct,
  parseCustomFoodMacro,
  validateCustomFoodMacros,
  type CustomFoodMacroField,
  type NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { Sheet } from '../Sheet'
import { useTheme } from '../../context/ThemeContext'
import { createCoachFoodRN } from '../../lib/nutrition-v2.api'
import { CoachFoodInputSchema } from '../../lib/nutrition-v2-builder'

/**
 * Alta de alimento custom desde el tab Alimentos del coach (T2.3 F6.3) — port del sheet web
 * `apps/web/src/app/coach/nutrition-v2/_components/AddFoodSheet.tsx` al contrato MÓVIL.
 *
 * El port NO es literal porque el camino de escritura es otro: la web postea un `FormData` a la
 * server action V1 `saveCustomFood`, mientras que el móvil arma un payload tipado con
 * `CoachFoodInputSchema` y lo manda por la acción `createFood` de `/api/mobile/nutrition-v2/
 * coach/mutate` (el MISMO endpoint que ya usa "Guardar en mi catálogo" del builder RN). De ahí
 * las tres ausencias respecto de la web, que son del contrato y no recortes de UI:
 *
 *  - sin CATEGORÍA ni PORCIÓN de referencia ni MEDIDA CASERA: el contrato móvil no los lleva; el
 *    servidor fija `serving_size = 100` y `category = 'otro'`. Pedirlos acá sería inventar campos
 *    que el endpoint tira a la basura;
 *  - sin bloque de EQUIVALENCIA de porciones: el trío `exchangeGroupId`/`exchangePortionGrams`/
 *    `exchangePortionLabel` viaja opcional en el schema, pero en móvil la clasificación se hace
 *    desde la ficha del alimento (F6.4), no en el alta;
 *  - la unidad se reduce a `g` | `ml` (el `un` de la web depende de "gramos que pesa 1 unidad",
 *    que es justamente el `serving_size` que acá no existe).
 *
 * Lo que SÍ es 1:1 con la web: los macros son POR 100 (g o ml, según la unidad elegida), el
 * cuarteto kcal/P/C/G es obligatorio y lo dictamina el mismo módulo puro
 * (`validateCustomFoodMacros`, invariante 6 de la SPEC de T2.3), y el preview de "% calorías"
 * usa `macroPreviewPct` — el mismo helper compartido, para que web y móvil no muestren dos
 * porcentajes distintos con los mismos números.
 *
 * Montado sobre el `Sheet` DS con `nativeModal`: se abre desde una pantalla recién montada (el
 * tab), que es exactamente el cold-start donde el path @gorhom es frágil bajo reanimated 4 /
 * Fabric (ver docs de la prop `nativeModal` en components/Sheet.tsx). Mismo criterio que
 * `FoodDetailSheet`, el otro sheet de este tab.
 */

type Props = {
  open: boolean
  onClose: () => void
  scope: NutritionV2CoachScope
  /** Recibe el NOMBRE guardado: el listado se reapunta a él (no hay refetch del tab). */
  onCreated: (name: string) => void
}

type Unit = 'g' | 'ml'

/** Los cuatro campos, en el orden en que se ven — el mismo que recorre el guard puro. */
const MACRO_FIELDS: Array<{ key: CustomFoodMacroField; label: string }> = [
  { key: 'calories', label: 'Kcal (100g)' },
  { key: 'protein', label: 'Proteína (g)' },
  { key: 'carbs', label: 'Carbos (g)' },
  { key: 'fats', label: 'Grasas (g)' },
]

/**
 * Techo del contrato móvil. El guard puro espeja el techo de V1 (`CUSTOM_FOOD_MACRO_MAX.calories`
 * = 9000 kcal, el de `CustomFoodSchema`), pero ESTE camino escribe por `CoachFoodInputSchema`,
 * que corta en 2000. Sin este cinturón el coach pasaría el guard y se comería un
 * "El alimento tiene datos invalidos." genérico sin saber qué campo mirar.
 */
const MOBILE_CALORIES_MAX = 2000

/** Texto crudo → número para el preview: vacío o basura cuenta como 0 (nunca NaN en pantalla). */
function previewNumber(raw: string): number {
  const parsed = parseCustomFoodMacro(raw)
  return parsed.state === 'value' ? parsed.value : 0
}

export function AddFoodSheet({ open, onClose, scope, onCreated }: Props) {
  const { theme } = useTheme()

  const [name, setName] = useState('')
  const [unit, setUnit] = useState<Unit>('g')
  // Los cuatro macros viven como TEXTO CRUDO: el guard puro es el que decide si un "12,5" o un
  // campo vacío son válidos, y parsear en cada tecla borraría lo que el coach está escribiendo.
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fats, setFats] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameRef = useRef<TextInput | null>(null)
  const caloriesRef = useRef<TextInput | null>(null)
  const proteinRef = useRef<TextInput | null>(null)
  const carbsRef = useRef<TextInput | null>(null)
  const fatsRef = useRef<TextInput | null>(null)
  // El issue del guard viene con el NOMBRE del campo, no con un ref: este mapa es el puente para
  // poder mandar el foco donde está el problema (paridad con el `querySelector` del sheet web).
  const macroRefs: Record<CustomFoodMacroField, RefObject<TextInput | null>> = {
    calories: caloriesRef,
    protein: proteinRef,
    carbs: carbsRef,
    fats: fatsRef,
  }
  // Valor + setter por campo, para que la grilla se renderice en un solo `map` sin cascada de
  // ternarios (los cuatro inputs son idénticos salvo el label).
  const macroInputs: Record<
    CustomFoodMacroField,
    { value: string; setValue: (next: string) => void }
  > = {
    calories: { value: calories, setValue: setCalories },
    protein: { value: protein, setValue: setProtein },
    carbs: { value: carbs, setValue: setCarbs },
    fats: { value: fats, setValue: setFats },
  }

  // El submit es async y el sheet puede desmontarse (o cerrarse) mientras el POST viaja: sin este
  // guard, el `setState` de la respuesta cae sobre un componente muerto. Mismo patrón que el
  // builder RN.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    setName('')
    setUnit('g')
    setCalories('')
    setProtein('')
    setCarbs('')
    setFats('')
    setError(null)
  }, [])

  /**
   * La web desmonta el `SheetContent` al cerrar, así que cada apertura arranca con el formulario
   * en blanco. Acá el componente vive siempre (el sheet solo cambia `visible`), así que el reset
   * se hace a mano en el flanco de subida de `open`; al cerrar basta con limpiar el error, que es
   * lo único que no debería sobrevivir a la despedida.
   */
  useEffect(() => {
    if (open) reset()
    else setError(null)
  }, [open, reset])

  const values = {
    calories: previewNumber(calories),
    protein: previewNumber(protein),
    carbs: previewNumber(carbs),
    fats: previewNumber(fats),
  }
  const showPreview =
    values.calories > 0 || values.protein > 0 || values.carbs > 0 || values.fats > 0
  const pct = macroPreviewPct(values.calories, values.protein, values.carbs, values.fats)

  const basisLabel = unit === 'ml' ? '100 ml' : '100 g'

  async function handleSave() {
    if (saving) return

    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setError('Ingresa el nombre del alimento.')
      nameRef.current?.focus()
      return
    }

    // Mismo guard puro que el sheet web (invariante 6): kcal/P/C/G obligatorios, sin negativos,
    // dentro de rango y nunca los cuatro en cero. El veredicto sale sin round-trip y apunta al
    // campo concreto que hay que arreglar.
    const issue = validateCustomFoodMacros({ calories, protein, carbs, fats })
    if (issue) {
      setError(issue.message)
      macroRefs[issue.field].current?.focus()
      return
    }

    // Cinturón del contrato móvil (ver `MOBILE_CALORIES_MAX`): el guard puro deja pasar hasta
    // 9000 kcal porque espeja V1, pero este camino escribe por `CoachFoodInputSchema`.
    const parsedCalories = parseCustomFoodMacro(calories)
    if (parsedCalories.state === 'value' && parsedCalories.value > MOBILE_CALORIES_MAX) {
      setError(`Máximo ${MOBILE_CALORIES_MAX} kcal por ${basisLabel}.`)
      caloriesRef.current?.focus()
      return
    }

    // Sin `clientId`: es opcional en el schema y solo lo usa la server action web para autorizar
    // por la relación coach-alumno. El alta desde el tab Alimentos no tiene alumno.
    const parsed = CoachFoodInputSchema.safeParse({
      name: trimmedName,
      brand: null,
      unit,
      calories: previewNumber(calories),
      proteinG: previewNumber(protein),
      carbsG: previewNumber(carbs),
      fatsG: previewNumber(fats),
    })
    if (!parsed.success) {
      setError('El alimento tiene datos invalidos.')
      return
    }

    setError(null)
    setSaving(true)
    const res = await createCoachFoodRN({ scope, input: parsed.data })
    if (!mountedRef.current) return
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    reset()
    onCreated(parsed.data.name)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['90%']}
      scrollable
      title="Nuevo alimento custom"
      // Misma promesa que el empty-state de "Solo míos" en el tab: el coach necesita saber que
      // esto no se publica a nadie antes de escribir macros de su propia cosecha.
      description="Solo lo ves tú, y queda disponible para todos tus planes."
      accessibilityLabel="Crear un alimento custom"
    >
      <View className="gap-2">
        <Text className="text-[10px] font-black uppercase tracking-widest text-muted">Nombre</Text>
        <TextInput
          ref={nameRef}
          accessibilityLabel="Nombre del alimento"
          value={name}
          onChangeText={(value) => {
            setError(null)
            setName(value)
          }}
          placeholder="Ej: Huevo cocido"
          placeholderTextColor={theme.mutedForeground}
          maxLength={180}
          autoCorrect={false}
          returnKeyType="next"
          className="min-h-11 rounded-control border border-default bg-surface-card px-3 text-base text-strong"
        />
      </View>

      <Text className="rounded-control border border-subtle bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-muted">
        Las calorías y macros de abajo son{' '}
        <Text className="font-semibold text-body">por cada {basisLabel}</Text> (como en una tabla
        nutricional). Si tu envase trae los valores por porción, conviértelos primero.
      </Text>

      {/* Los cuatro son OBLIGATORIOS (regla owner 2026-08-05). Acá no hay `required` del
          navegador que ayude: el único juez es `validateCustomFoodMacros` en el submit. */}
      <View className="flex-row flex-wrap gap-3">
        {MACRO_FIELDS.map((field) => {
          const { value, setValue } = macroInputs[field.key]
          return (
            // `basis-[47%]` no existe en el preset: dos columnas se arman con flex-1 + min-w.
            <View key={field.key} className="min-w-[130px] flex-1 gap-2">
              <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
                {field.label}
              </Text>
              <TextInput
                ref={macroRefs[field.key]}
                accessibilityLabel={`${field.label} por ${basisLabel}`}
                value={value}
                onChangeText={(next) => {
                  // El error describe el INTENTO anterior: al corregir el campo deja de aplicar y
                  // dejarlo en rojo hace parecer que el sheet sigue bloqueado.
                  setError(null)
                  setValue(next)
                }}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.mutedForeground}
                className="min-h-11 rounded-control border border-default bg-surface-card px-3 text-base font-semibold text-strong"
              />
            </View>
          )
        })}
      </View>

      {showPreview ? (
        <View className="gap-2 rounded-control border border-subtle px-3 py-3">
          <Text className="text-[10px] font-black uppercase tracking-widest text-muted">
            % calorías aprox.
          </Text>
          {/* Preview, NO validación: con las kcal declaradas de denominador los tres pueden no
              sumar 100 y está bien (es la etiqueta que el coach está copiando). */}
          <View className="h-2 flex-row overflow-hidden rounded-pill bg-surface-sunken">
            <View
              className={`h-full ${NUTRITION_MACROS.protein.nativeClass}`}
              style={{ width: `${pct.p}%` }}
            />
            <View
              className={`h-full ${NUTRITION_MACROS.carbs.nativeClass}`}
              style={{ width: `${pct.c}%` }}
            />
            <View
              className={`h-full ${NUTRITION_MACROS.fats.nativeClass}`}
              style={{ width: `${pct.f}%` }}
            />
          </View>
          <Text className="text-xs text-muted" style={{ fontVariant: ['tabular-nums'] }}>
            P {pct.p}% · C {pct.c}% · G {pct.f}%
          </Text>
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="text-[10px] font-black uppercase tracking-widest text-muted">Unidad</Text>
        {/*
          El servidor deriva `is_liquid = unit === 'ml'`, y ESO decide qué unidades se le ofrecen
          al alumno cuando registra el alimento. Elegir mal acá es exactamente el bug del catálogo
          de los ~300 sólidos importados de Open Food Facts como «bebida» (corregido en LIVE el
          2026-08-19, backup en `_bak_foods_ml_fix_20260819`): el alumno terminaba midiendo
          fettuccine en ml. Por eso son dos pills excluyentes con la consecuencia escrita, no un
          select mudo.
        */}
        <View className="flex-row flex-wrap gap-2">
          {(
            [
              { key: 'g', label: 'g — sólido (se pesa)' },
              { key: 'ml', label: 'ml — líquido (se mide)' },
            ] as const
          ).map((option) => {
            const active = unit === option.key
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setError(null)
                  setUnit(option.key)
                }}
                className={`min-h-9 shrink-0 flex-row items-center rounded-pill border px-3 ${
                  active ? 'border-primary bg-primary/10' : 'border-default bg-surface-card'
                }`}
              >
                <Text
                  numberOfLines={1}
                  className={`text-xs font-semibold ${active ? 'text-primary' : 'text-muted'}`}
                >
                  {option.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View className="mt-1 gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Guardar alimento"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={() => void handleSave()}
          className={`min-h-12 flex-row items-center justify-center gap-2 rounded-control bg-primary px-4 ${
            saving ? 'opacity-60' : ''
          }`}
        >
          {saving ? <ActivityIndicator color={theme.primaryForeground} size="small" /> : null}
          <Text className="text-sm font-semibold text-primary-foreground">
            {saving ? 'Guardando…' : 'Guardar'}
          </Text>
        </Pressable>

        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-center text-xs font-semibold text-danger-700"
          >
            {error}
          </Text>
        ) : null}

        {/* Recordatorio del techo real del cuarteto: los mismos números que corta el guard puro. */}
        <Text className="text-center text-[10.5px] text-subtle">
          Máximos: {CUSTOM_FOOD_MACRO_MAX.protein} g por macro y {MOBILE_CALORIES_MAX} kcal por{' '}
          {basisLabel}.
        </Text>
      </View>
    </Sheet>
  )
}
