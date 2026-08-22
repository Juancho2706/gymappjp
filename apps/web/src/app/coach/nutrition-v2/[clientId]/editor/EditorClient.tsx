'use client'

/**
 * Cliente del editor unico (W1): monta el MISMO stack del quick-edit (prefs del picker +
 * provider + vista overlay) con `editPlanMeta` — el arbol gana `state.meta` (nombre, estrategia,
 * permisos), la vista pinta la cabecera `EditorMetaCard` y el publish viaja por el mismo
 * pipeline CAS. Salir navega de vuelta a la ficha (aca no hay "debajo": la ruta ES el editor).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type {
  BuilderFood,
  NutritionItemSubstitutionRead,
  NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import { FoodPickerPrefsProvider } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPickerPrefsContext'
import type { FoodPickerRestriction } from '@/app/coach/nutrition-v2/_components/food-picker/food-picker-grouping'
import { QuickEditProvider, type EditorCreationInput } from '../_quick-edit/QuickEditProvider'
import { QuickEditPlanView } from '../_quick-edit/QuickEditPlanView'
import {
  RememberedQuantitiesContext,
  type RememberedQuantity,
} from '../../_components/RememberedQuantitiesContext'
import { postFirstArtifactCreated } from '@/app/coach/_components/guided/first-artifact-event'
import { PrimeraPautaProvider, type PrimeraPautaConfig } from './PrimeraPauta'
import { PrimeraPautaPublicada } from './PrimeraPautaPublicada'

export function EditorClient({
  clientId,
  clientName,
  planModel,
  itemSubstitutions,
  substitutionFoodsById,
  substitutionsLoadFailed,
  today,
  hasNutritionPro,
  viewerCoachId,
  foodRestrictions,
  favoriteFoodIds,
  creation,
  originUnavailable,
  rememberedQuantities,
  primera = null,
}: {
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  itemSubstitutions: NutritionItemSubstitutionRead[]
  /**
   * Catalogo VIGENTE de los alimentos de esos reemplazos (resuelto server-side). Solo alimenta el
   * display de la equivalencia («≈ 130 g») en la fila del reemplazo; ausente = la fila no pinta
   * numero, jamas uno falso. No viaja al draft ni al contador de cambios.
   */
  substitutionFoodsById?: Record<string, BuilderFood>
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
  /**
   * Entrada guiada «Arma su primera pauta» (W4 F4.3), resuelta SERVER-SIDE. `null` (el default) =
   * editor de siempre: sin tarjetas, sin aviso y saliendo al publicar como hasta hoy.
   */
  primera?: Omit<PrimeraPautaConfig, 'onWantsViveTuApp'> | null
}) {
  const router = useRouter()
  // La CTA «Publicar y ver como {demo}» solo ANOTA la intencion; el publish viaja por el camino
  // de siempre. Si sale bien, el cierre abre la hoja de «Vive tu app» en vez de irse en silencio.
  const [wantsViveTuApp, setWantsViveTuApp] = useState(false)
  const [published, setPublished] = useState(false)

  const exitToClient = useCallback(() => {
    router.push(`/coach/nutrition-v2/${clientId}`)
  }, [router, clientId])

  const afterPublish = useCallback(() => {
    // El paso 3 de la guia se tilda con la señal real del servidor; este evento es la MEDICION
    // (dedupe por indice unico parcial, ver `postFirstArtifactCreated`).
    postFirstArtifactCreated('nutrition_plan')
    setPublished(true)
  }, [])

  const primeraConfig = useMemo(
    () => (primera ? { ...primera, onWantsViveTuApp: () => setWantsViveTuApp(true) } : null),
    [primera],
  )

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
        foodsById={substitutionFoodsById}
        substitutionsLoadFailed={substitutionsLoadFailed}
        today={today}
        hasNutritionPro={hasNutritionPro}
        editPlanMeta
        creation={creation}
        onExit={exitToClient}
        afterPublish={primera ? afterPublish : null}
      >
        <PrimeraPautaProvider value={primeraConfig}>
          <RememberedQuantitiesContext.Provider value={rememberedQuantities}>
            <QuickEditPlanView />
          </RememberedQuantitiesContext.Provider>
        </PrimeraPautaProvider>
      </QuickEditProvider>
      {primera && published ? (
        <PrimeraPautaPublicada
          demoName={primera.isDemo ? primera.name : null}
          autoOpenViveTuApp={primera.isDemo && wantsViveTuApp}
          onClose={exitToClient}
        />
      ) : null}
    </FoodPickerPrefsProvider>
  )
}
