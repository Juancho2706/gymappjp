'use client'

/**
 * Entrada al modo edicion desde la ficha (§1.2.A): CTA unica "Editar plan" (lapiz) → EDITOR
 * UNICO (`[clientId]/editor`).
 *
 * RETIRO DEL PAR VIEJO (web, 2026-08-17): el menu "..." con "Edición rápida (clásica)"
 * (quick-edit in-place, `editing=true`) y "Rehacer con el asistente" (wizard
 * `[clientId]/builder`) se retiro al cumplirse la ventana de observacion con QA del owner.
 * La maquinaria del overlay clasico queda abajo SIN puerta —nada vuelve a poner
 * `editing=true`—: se demuele junto con el wizard en la tanda de borrado
 * (TASKS.md «Retiro del par viejo»), no en esta.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from '@eva/nutrition-v2'
import { FoodPickerPrefsProvider } from '@/app/coach/nutrition-v2/_components/food-picker/FoodPickerPrefsContext'
import type { FoodPickerRestriction } from '@/app/coach/nutrition-v2/_components/food-picker/food-picker-grouping'
import { QuickEditProvider, type QuickEditTodayIntakeSummary } from './QuickEditProvider'
import { QuickEditPlanView } from './QuickEditPlanView'
import { QE_COPY } from './microcopy'

export function QuickEditEntry({
  clientId,
  clientName,
  planModel,
  itemSubstitutions,
  substitutionsLoadFailed = false,
  today,
  hasNutritionPro = false,
  viewerCoachId = null,
  foodRestrictions,
  favoriteFoodIds,
  todayIntakeSummary = null,
}: {
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  /** Reemplazos autorizados de la version base (F-02), fetcheados server-side para el carry-over. */
  itemSubstitutions: NutritionItemSubstitutionRead[]
  /**
   * NUT-008: la lectura de reemplazos fallo (RLS/red/timeout). No es "no hay reemplazos":
   * publicar con el mapa vacio los borraria, asi que el modo edicion bloquea "Publicar".
   */
  substitutionsLoadFailed?: boolean
  today: string
  /**
   * Entitlement Nutricion Pro resuelto SERVER-SIDE. Solo gobierna la AFORDANCIA de los dias
   * especificos (candado + upsell en vez del picker): el gate real lo aplica el server
   * (`multi_variant` -> UPGRADE_REQUIRED). Default false = fail-closed.
   */
  hasNutritionPro?: boolean
  /**
   * Coach autenticado: el picker de alimentos separa "Mis alimentos" comparando `foods.coach_id`
   * con este id. Ausente = la seccion no se pinta (degradacion invisible).
   */
  viewerCoachId?: string | null
  /** Alergias/intolerancias/disgustos declarados del alumno (resueltos server-side). */
  foodRestrictions?: readonly FoodPickerRestriction[]
  /** Favoritos declarados del alumno (estrellita en el picker). */
  favoriteFoodIds?: readonly string[]
  /**
   * Qué hay REGISTRADO hoy (W3.2/W4.1): alimenta el aviso previo a republicar con vigencia HOY.
   * `null` = sin dato ⇒ el provider no avisa.
   */
  todayIntakeSummary?: QuickEditTodayIntakeSummary | null
}) {
  const [editing, setEditing] = useState(false)

  // Overlay abierto → sin scroll del body (la ficha queda debajo, intacta).
  // Además marca el <body> con `eva-quickedit-open` para ocultar por CSS la cápsula flotante
  // del nav del coach mientras se edita (mismo bug de apilamiento ya resuelto en el alumno con
  // `eva-v2-sheet-open`; ver globals.css y TodayModal.tsx). Acá solo puede haber UNA instancia de
  // quick-edit por página, así que basta un add/remove simple sin contador de referencias.
  useEffect(() => {
    if (!editing) return
    // Lock en <html>, no en <body>: con `html { overflow-x: clip }` (globals.css) el overflow
    // del body no propaga al viewport — el lock era un no-op y ademas re-anclaba el sidebar
    // sticky al body (mismo fix que TodayModal.tsx, bug QA 2026-08-14).
    const previous = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.classList.add('eva-quickedit-open')
    return () => {
      document.documentElement.style.overflow = previous
      document.body.classList.remove('eva-quickedit-open')
    }
  }, [editing])

  if (planModel.plan === null) return null

  return (
    <>
      {/* Retiro del par viejo: el lapiz al EDITOR UNICO es la unica entrada de edicion.
          El menu "..." (clasico in-place + wizard) murio con la ventana de observacion. */}
      <Link
        href={`/coach/nutrition-v2/${clientId}/editor`}
        aria-label={QE_COPY.enter}
        title={QE_COPY.enter}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-primary text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Pencil className="h-[18px] w-[18px]" />
      </Link>

      {editing ? (
        // Las senales del picker de alimentos (coach en pantalla, restricciones y favoritos del
        // alumno) viajan por contexto: asi ninguna pieza intermedia del quick-edit cambia de
        // firma para que una fila del buscador pinte una estrellita o bloquee un alergeno.
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
            todayIntakeSummary={todayIntakeSummary}
            onExit={() => setEditing(false)}
          >
            <QuickEditPlanView />
          </QuickEditProvider>
        </FoodPickerPrefsProvider>
      ) : null}
    </>
  )
}
