'use client'

/**
 * Cliente del editor unico (W1): monta el MISMO stack del quick-edit (prefs del picker +
 * provider + vista overlay) con `editPlanMeta` — el arbol gana `state.meta` (nombre, estrategia,
 * permisos), la vista pinta la cabecera `EditorMetaCard` y el publish viaja por el mismo
 * pipeline CAS. Salir navega de vuelta a la ficha (aca no hay "debajo": la ruta ES el editor).
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from '@eva/nutrition-v2'
import { FoodPickerPrefsProvider } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPickerPrefsContext'
import type { FoodPickerRestriction } from '@/app/coach/nutrition-v2/_components/food-picker/food-picker-grouping'
import { QuickEditProvider } from '../_quick-edit/QuickEditProvider'
import { QuickEditPlanView } from '../_quick-edit/QuickEditPlanView'

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
}) {
  const router = useRouter()

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
        onExit={() => router.push(`/coach/nutrition-v2/${clientId}`)}
      >
        <QuickEditPlanView />
      </QuickEditProvider>
    </FoodPickerPrefsProvider>
  )
}
