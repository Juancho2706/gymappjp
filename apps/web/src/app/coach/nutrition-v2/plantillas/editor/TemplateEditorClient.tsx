'use client'

/**
 * Cliente del editor unico en modo PLANTILLA (T3.2b): monta el MISMO stack del editor de
 * planes (prefs del picker + provider + vista overlay) con `template` en vez de `creation`.
 * No hay alumno: el picker va coach-scoped (sin restricciones ni favoritos), la porcion
 * pegajosa no lee ni escribe memoria, y "publicar" es GUARDAR la plantilla. Salir vuelve a
 * la biblioteca (tab Plantillas del Centro V2).
 */

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { NutritionPlanReadModel } from '@eva/nutrition-v2'
import { FoodPickerPrefsProvider } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPickerPrefsContext'
import {
  QuickEditProvider,
  type EditorTemplateInput,
} from '../../[clientId]/_quick-edit/QuickEditProvider'
import { QuickEditPlanView } from '../../[clientId]/_quick-edit/QuickEditPlanView'
import { QE_COPY } from '../../[clientId]/_quick-edit/microcopy'
import { RememberedQuantitiesContext } from '../../[clientId]/builder/_components/RememberedQuantitiesContext'
import { TEMPLATE_MODE_CLIENT_ID } from '../../[clientId]/builder/_lib/template-mode'

const TEMPLATES_TAB_HREF = '/coach/nutrition-v2?tab=plantillas'

/**
 * Read model SIN plan: el modo plantilla no depende de el (el arbol nace del draft guardado).
 * Los campos que el provider/vista leen — `plan` (null), `protocolNotes`, `permissions`,
 * `dayVariants` (para `collectPortionGroups`) — quedan neutros. `generatedAt` estatico a
 * proposito: no se renderiza y un `new Date()` distinto entre SSR e hidratacion es la familia
 * de bug de EVA-NEXTJS-18.
 */
function buildTemplatePlanModel(today: string, timezone: string): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: `${today}T00:00:00.000Z`,
    asOfDate: today,
    timezone,
    plan: null,
    visibleNotes: null,
    protocolNotes: null,
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    dayVariants: [],
    syncToken: 'template-editor',
  }
}

export function TemplateEditorClient({
  template,
  templateUnavailable,
  today,
  hasNutritionPro,
  viewerCoachId,
}: {
  template: EditorTemplateInput
  /** Se pidio `?template=` y no se pudo abrir: editor en blanco CON aviso (jamas en silencio). */
  templateUnavailable: boolean
  today: string
  hasNutritionPro: boolean
  viewerCoachId: string
}) {
  const router = useRouter()

  // Degradacion AVISADA (leccion JP 2026-08-11): guardar en blanco creyendo que se edita la
  // plantilla pedida seria pisarla... al reves: crear una copia huerfana. Que se sepa.
  useEffect(() => {
    if (!templateUnavailable) return
    toast.error(QE_COPY.templateUnavailable, { duration: 10000 })
  }, [templateUnavailable])

  // Mismo lock de scroll que el editor de planes: en <html> (con `html { overflow-x: clip }`
  // el del body es no-op) + clase para ocultar la capsula flotante del nav del coach.
  useEffect(() => {
    const previous = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.classList.add('eva-quickedit-open')
    return () => {
      document.documentElement.style.overflow = previous
      document.body.classList.remove('eva-quickedit-open')
    }
  }, [])

  const planModel = useMemo(
    () => buildTemplatePlanModel(today, template.baseDraft.timezone),
    [today, template.baseDraft.timezone],
  )

  return (
    <FoodPickerPrefsProvider
      viewerCoachId={viewerCoachId}
      clientName={null}
      restrictions={[]}
      favoriteIds={[]}
    >
      <QuickEditProvider
        clientId={TEMPLATE_MODE_CLIENT_ID}
        clientName=""
        planModel={planModel}
        itemSubstitutions={[]}
        substitutionsLoadFailed={false}
        today={today}
        hasNutritionPro={hasNutritionPro}
        editPlanMeta
        template={template}
        onExit={() => router.push(TEMPLATES_TAB_HREF)}
      >
        {/* Sin alumno no hay memoria de porciones: contexto vacio = prefill del catalogo. */}
        <RememberedQuantitiesContext.Provider value={{}}>
          <QuickEditPlanView />
        </RememberedQuantitiesContext.Provider>
      </QuickEditProvider>
    </FoodPickerPrefsProvider>
  )
}
