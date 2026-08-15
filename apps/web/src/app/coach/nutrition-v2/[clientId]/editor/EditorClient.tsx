'use client'

/**
 * Cliente del editor unico (W1): monta el MISMO stack del quick-edit (prefs del picker +
 * provider + vista overlay) con `editPlanMeta` — el arbol gana `state.meta` (nombre, estrategia,
 * permisos), la vista pinta la cabecera `EditorMetaCard` y el publish viaja por el mismo
 * pipeline CAS. Salir navega de vuelta a la ficha (aca no hay "debajo": la ruta ES el editor).
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from '@eva/nutrition-v2'
import { FoodPickerPrefsProvider } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPickerPrefsContext'
import type { FoodPickerRestriction } from '@/app/coach/nutrition-v2/_components/food-picker/food-picker-grouping'
import { QuickEditProvider, type EditorCreationInput } from '../_quick-edit/QuickEditProvider'
import { QuickEditPlanView } from '../_quick-edit/QuickEditPlanView'
import {
  RememberedQuantitiesContext,
  type RememberedQuantity,
} from '../builder/_components/RememberedQuantitiesContext'

export function EditorClient({
  clientId,
  clientName,
  planModel,
  itemSubstitutions,
  substitutionsLoadFailed,
  today,
  hasNutritionPro,
  viewerCoachId,
  foodRestrictions,
  favoriteFoodIds,
  creation,
  originUnavailable,
  rememberedQuantities,
}: {
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  itemSubstitutions: NutritionItemSubstitutionRead[]
  substitutionsLoadFailed: boolean
  today: string
  hasNutritionPro: boolean
  viewerCoachId: string
  foodRestrictions: readonly FoodPickerRestriction[]
  favoriteFoodIds: readonly string[]
  /** Modo creacion (W1.5); null = edicion del plan vigente. */
  creation: EditorCreationInput | null
  /** El `?from=` pedido no se pudo abrir: se degrado, y TIENE que decirse (jamas en silencio). */
  originUnavailable: boolean
  /** Porcion pegajosa (T2.6 F4): mapa foodId → ultima cantidad, resuelto server-side. */
  rememberedQuantities: Record<string, RememberedQuantity>
}) {
  const router = useRouter()

  // Degradacion de origen AVISADA (leccion JP 2026-08-11: plantilla soft-deleted que abria el
  // plan vigente sin una palabra y el coach publicaba encima creyendo que era su plantilla).
  useEffect(() => {
    if (!originUnavailable) return
    toast.error(
      'No se pudo abrir el origen pedido (plantilla o plan). Estás viendo ' +
        (creation ? 'un plan en blanco.' : 'el plan vigente del alumno.'),
      { duration: 10000 },
    )
  }, [originUnavailable, creation])

  // Mismo lock de scroll que QuickEditEntry: en <html> (con `html { overflow-x: clip }` el del
  // body es no-op) + clase para ocultar la capsula flotante del nav del coach.
  useEffect(() => {
    const previous = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.classList.add('eva-quickedit-open')
    return () => {
      document.documentElement.style.overflow = previous
      document.body.classList.remove('eva-quickedit-open')
    }
  }, [])

  return (
    <FoodPickerPrefsProvider
      viewerCoachId={viewerCoachId}
      clientName={clientName}
      restrictions={foodRestrictions}
      favoriteIds={favoriteFoodIds}
    >
      <QuickEditProvider
        clientId={clientId}
        clientName={clientName}
        planModel={planModel}
        itemSubstitutions={itemSubstitutions}
        substitutionsLoadFailed={substitutionsLoadFailed}
        today={today}
        hasNutritionPro={hasNutritionPro}
        editPlanMeta
        creation={creation}
        onExit={() => router.push(`/coach/nutrition-v2/${clientId}`)}
      >
        <RememberedQuantitiesContext.Provider value={rememberedQuantities}>
          <QuickEditPlanView />
        </RememberedQuantitiesContext.Provider>
      </QuickEditProvider>
    </FoodPickerPrefsProvider>
  )
}
