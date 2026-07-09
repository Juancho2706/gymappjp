/**
 * useClientCardioZones — zonas de frecuencia cardiaca del ALUMNO para el ejecutor cardio (E2-11),
 * GATEADAS por el modulo `cardio`.
 *
 * Client-side puro y money-safe: el alumno lee SU PROPIA fila de `clients`
 * (`birth_date`/`resting_hr`/`max_hr_override`) — RLS `clients_self_select` (id = auth.uid()) ya lo
 * permite, y esas columnas tienen GRANT SELECT (auditoria e0-db-audit.md §b). Cero endpoints nuevos,
 * cero datos de terceros. El calculo de bpm por zona vive en @eva/cardio (`resolveClientZones`) — el
 * MISMO dominio puro que usa la web (`cardio-zones.service`), sin drift.
 *
 * `enabled` DEBE combinar `hasModule('cardio')` (visibilidad de pago) con "el plan tiene bloques
 * cardio con hr_zone": cuando es false NO se pega a la DB (AC3: sin modulo, ni fetch extra). El
 * fallback por edad (Tanaka) cuando falta FCmax medida ya lo resuelve @eva/cardio.
 */
import { useEffect, useState } from 'react'
import { resolveClientZones, type CardioProfile, type HrZoneRange } from '@eva/cardio'
import { supabase } from './supabase'

export function useClientCardioZones(enabled: boolean): HrZoneRange[] | null {
  const [zones, setZones] = useState<HrZoneRange[] | null>(null)

  useEffect(() => {
    if (!enabled) {
      setZones(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('clients')
          .select('birth_date, resting_hr, max_hr_override')
          .eq('id', user.id)
          .maybeSingle()
        if (cancelled || !data) return
        const row = data as {
          birth_date?: string | null
          resting_hr?: number | null
          max_hr_override?: number | null
        }
        const profile: CardioProfile = {
          birthDate: row.birth_date ?? null,
          restingHr: row.resting_hr ?? null,
          maxHrOverride: row.max_hr_override ?? null,
        }
        const resolved = resolveClientZones(profile)
        setZones(resolved?.zones ?? null)
      } catch {
        if (!cancelled) setZones(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return zones
}
