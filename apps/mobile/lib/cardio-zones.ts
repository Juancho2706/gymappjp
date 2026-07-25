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
import { resolveClientZones, type CardioProfile, type HrToZoneProfile, type HrZoneRange, type ResolvedClientZones } from '@eva/cardio'
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

/**
 * Variante que devuelve las zonas resueltas COMPLETAS (`ResolvedClientZones`): mismos datos y misma
 * lectura money-safe que `useClientCardioZones`, pero conserva la FCmax/FC-reposo efectivas para
 * clasificar el BPM EN VIVO del sensor BLE (E6.1) con `hrToZone`. Una sola lectura de la fila propia.
 * El ejecutor V3 la usa; V2 sigue con `useClientCardioZones` (sin sensor) intacto.
 */
export function useClientCardioResolved(enabled: boolean): ResolvedClientZones | null {
  const [resolved, setResolved] = useState<ResolvedClientZones | null>(null)

  useEffect(() => {
    if (!enabled) {
      setResolved(null)
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
        setResolved(resolveClientZones(profile))
      } catch {
        if (!cancelled) setResolved(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return resolved
}

/** Deriva el perfil mínimo para `hrToZone` (BPM en vivo) desde las zonas resueltas. null si no hay FCmax. */
export function hrToZoneProfileFromResolved(resolved: ResolvedClientZones | null): HrToZoneProfile | null {
  if (!resolved) return null
  return { max_hr: resolved.maxHr, resting_hr: resolved.restingHr }
}
