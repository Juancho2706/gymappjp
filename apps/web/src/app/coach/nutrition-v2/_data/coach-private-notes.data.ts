import 'server-only'

import { cache } from 'react'
import { formatDateDdMmYyyySantiago } from '@/lib/date-utils'
import { createClient } from '@/lib/supabase/server'
import { NutritionNotesService } from '@/services/nutrition-notes.service'

// Nota privada del coach sobre un alumno para la ficha V2 (`nutrition_private_notes`, RLS
// coach-scoped: el alumno NO tiene policy de lectura, ni siquiera de existencia). Camino de
// datos REPUESTO tras la poda V1 (decision owner 2026-07-29 punto 4): la query vivia en
// `coach/clients/[clientId]/_data/nutrition-notes.queries.ts`, que murio junto al tab V1 de
// la ficha del alumno. Reusa `NutritionNotesService` — cero SQL nuevo, cero DDL, misma tabla.
//
// El resultado es DISCRIMINADO a proposito (misma leccion que NUT-008 en
// `item-substitutions.data.ts`): un fallo de lectura NO puede degradarse a "sin nota". El
// textarea se siembra con la nota vigente y guardar hace UPDATE sobre ESA fila, asi que un
// `[]` falso convertiria un error de red en el borrado silencioso de la nota del coach.
// `ok:false` viaja hasta la UI, que bloquea el guardado y pide recargar.

export type CoachPrivateNote = {
  id: string
  body: string
  /**
   * `dd-mm-yyyy` en America/Santiago, ya formateado en el SERVIDOR: el panel es un client
   * component que tambien se renderiza en SSR, y formatear el instante alli desalinearia la
   * hidratacion cuando la TZ del navegador no es la del servidor.
   */
  updatedAtLabel: string
}

export type CoachPrivateNotesLoad = { ok: true; notes: CoachPrivateNote[] } | { ok: false }

/**
 * Notas privadas del coach sobre un alumno, la vigente primero (`updated_at` desc). React
 * `cache` → dedupe por request. La RLS hace cumplir coach↔alumno; el cliente es el de la
 * sesion (JAMAS service role).
 */
export const fetchCoachPrivateNotes = cache(
  async (clientId: string): Promise<CoachPrivateNotesLoad> => {
    try {
      const supabase = await createClient()
      const rows = await new NutritionNotesService(supabase).listPrivateNotes(clientId)
      return {
        ok: true,
        notes: rows.map((row) => ({
          id: row.id,
          body: row.body,
          updatedAtLabel: formatDateDdMmYyyySantiago(row.updated_at ?? row.created_at),
        })),
      }
    } catch (err) {
      console.error('nutrition_v2_web_read', {
        source: 'coach_private_notes',
        clientId,
        message: err instanceof Error ? err.message : String(err),
      })
      return { ok: false }
    }
  },
)
