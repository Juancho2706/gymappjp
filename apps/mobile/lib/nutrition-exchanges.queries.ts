import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from './api'
import { useEntitlements } from './entitlements'

/**
 * Cliente de datos del modo intercambios ("Nutricion Pro" por-alumno, modulo
 * `nutrition_exchanges`). Consume el endpoint read-only
 * `/api/mobile/nutrition/exchanges/student-bundle`, que resuelve server-side el
 * catalogo de grupos (el alumno no tiene RLS `xg_select`), gatea fail-CLOSED por
 * modulo/contexto y devuelve un view-model YA calculado (chips, macros derivados,
 * variantes) con el motor puro compartido de la web — el cliente RN no duplica
 * ni una linea de logica de negocio.
 *
 * El payload espeja 1:1 el JSON del route (mismo contrato de campos).
 */

export interface ExchangeChip {
    groupId: string
    /** Codigo del chip ('C','P','F','LAC',...). Termino de dominio, NO se traduce. */
    code: string
    /** Hex ya resuelto (color del grupo o fallback por sortOrder). */
    color: string
    portions: number
    /** Porciones ya formateadas ('2', '1.5'). */
    portionsLabel: string
}

export interface ExchangeMealView {
    mealId: string
    /** Nombre de la variante de dia asignada a la comida ('Entreno AM'), o null. */
    variantName: string | null
    /** Macros derivados de los targets (Σ porciones × ref del grupo). */
    derived: { calories: number; proteinG: number; carbsG: number; fatsG: number } | null
    /** Algun grupo usado tiene macros sin confirmar ⇒ badge "referencial". */
    hasUnconfirmed: boolean
    chips: ExchangeChip[]
}

export interface ExchangeGroupView {
    id: string
    code: string
    name: string
    color: string
    refCalories: number
    refProteinG: number
    refCarbsG: number
    refFatsG: number
    macrosConfirmed: boolean
}

export interface ExchangeEquivalenceView {
    foodId: string
    name: string
    exchangeGroupId: string
    portionGrams: number | null
    portionLabel: string | null
}

export interface StudentExchangeBundleResponse {
    hasPlan: boolean
    /** Modulo ON + plan en modo intercambios + gate de contexto OK (fail-CLOSED). */
    enabled: boolean
    planMode: 'grams' | 'exchanges'
    meals: ExchangeMealView[]
    groups: ExchangeGroupView[]
    equivalences: ExchangeEquivalenceView[]
}

const EXCHANGES_MODULE = 'nutrition_exchanges' as const

export function fetchStudentExchangeBundle() {
    return apiFetch<StudentExchangeBundleResponse>(
        '/api/mobile/nutrition/exchanges/student-bundle',
        { authenticated: true },
    )
}

export interface UseStudentExchangesResult {
    /** true SOLO con modulo + plan exchanges + bundle.enabled del server. Sin esto: CERO render. */
    enabled: boolean
    loading: boolean
    /** Grupos (para la cabecera del sheet de equivalencias). */
    groups: ExchangeGroupView[]
    /** Todas las equivalencias (el sheet filtra por groupId). */
    equivalences: ExchangeEquivalenceView[]
    /** View-model de intercambios de UNA comida (o null si la comida no tiene targets). */
    mealById: (mealId: string) => ExchangeMealView | null
}

const EMPTY: UseStudentExchangesResult = {
    enabled: false,
    loading: false,
    groups: [],
    equivalences: [],
    mealById: () => null,
}

/**
 * Hook del modo intercambios del alumno. GATE DE ORO (money-safety + CERO fetch):
 * SOLO pega al endpoint cuando hay `planId` y el scope tiene el modulo
 * `nutrition_exchanges` (hasModule — para el alumno standalone refleja los modulos de SU
 * coach; org ⇒ [] por diseno). SIN el modulo: CERO fetch y CERO render. El gate de dinero
 * AUTORITATIVO igual vive server-side (fail-CLOSED en el endpoint); esto solo evita fetch y
 * render de superficie sin derecho.
 *
 * `planMode` es OPCIONAL y solo optimiza: si se pasa `'grams'` explicito, se salta el fetch
 * (el plan no usa intercambios). Si se pasa `'exchanges'` o `undefined`, se consulta y el
 * server decide (`enabled`). Asi el hook NO obliga al shell a exponer `plan_mode` en el
 * fetch del plan: si no lo tiene, pasa `undefined` y el endpoint (fail-closed) manda.
 *
 * `mode='client-plan'` (Nutricion Pro es POR-ALUMNO) se cumple por construccion: el alumno
 * siempre ve SU plan asignado, nunca una plantilla.
 */
export function useStudentExchanges(
    planId: string | null | undefined,
    planMode?: string | null | undefined,
): UseStudentExchangesResult {
    const { hasModule } = useEntitlements()
    const gateOpen = !!planId && planMode !== 'grams' && hasModule(EXCHANGES_MODULE)

    const [bundle, setBundle] = useState<StudentExchangeBundleResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const reqRef = useRef(0)

    useEffect(() => {
        if (!gateOpen) {
            // CERO fetch: gate cerrado. Limpiar cualquier bundle previo.
            reqRef.current++
            setBundle(null)
            setLoading(false)
            return
        }
        const my = ++reqRef.current
        setLoading(true)
        fetchStudentExchangeBundle()
            .then((b) => {
                if (my === reqRef.current) setBundle(b)
            })
            .catch(() => {
                // Degrada limpio (sin red / error): sin chips, la vista sigue en gramos.
                if (my === reqRef.current) setBundle(null)
            })
            .finally(() => {
                if (my === reqRef.current) setLoading(false)
            })
    }, [gateOpen, planId, planMode])

    const enabled = gateOpen && bundle?.enabled === true

    const mealMap = useMemo(() => {
        const m = new Map<string, ExchangeMealView>()
        if (enabled && bundle) for (const meal of bundle.meals) m.set(meal.mealId, meal)
        return m
    }, [enabled, bundle])

    return useMemo<UseStudentExchangesResult>(() => {
        if (!enabled || !bundle) return { ...EMPTY, loading }
        return {
            enabled: true,
            loading,
            groups: bundle.groups,
            equivalences: bundle.equivalences,
            mealById: (mealId: string) => mealMap.get(mealId) ?? null,
        }
    }, [enabled, bundle, loading, mealMap])
}
