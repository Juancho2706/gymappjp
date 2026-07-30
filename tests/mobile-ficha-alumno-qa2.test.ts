import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applySignedCheckinPhotos,
  collectCheckinPhotoRefs,
  planCheckinPhotoFields,
  resetCheckinSignatureCache,
  signCheckinPhotoRows,
  toCheckinPath,
} from '../apps/mobile/lib/checkin-photo-urls'
import { buildClientKpiCards } from '../apps/mobile/lib/client-kpi-cards'
import { tabBarBackdropProgress, TAB_BAR_BACKDROP_RAMP_PX } from '../apps/mobile/lib/client-tabbar-backdrop'

/**
 * QA de dispositivo ronda 2 — cluster FICHA DE ALUMNO (coach, RN). Cubre la lógica pura de
 * los 3 hallazgos que la tienen: A2 (copys/tonos de las KPI cards), A4 (rampa del backdrop
 * de la tira sticky) y A5 (firma en lote de las fotos de check-in).
 */

const row = (id: string, photos: Partial<Record<'front_photo_url' | 'side_photo_url' | 'back_photo_url', string | null>> = {}) => ({
  id,
  front_photo_url: null,
  side_photo_url: null,
  back_photo_url: null,
  ...photos,
})

describe('A5 · fotos de check-in firmadas (espejo de resolveCheckinPhotoUrls)', () => {
  beforeEach(() => {
    resetCheckinSignatureCache()
  })

  it('normaliza paths, URLs públicas legacy y URLs YA firmadas al mismo path', () => {
    expect(toCheckinPath('clients/abc/front.jpg')).toBe('clients/abc/front.jpg')
    expect(toCheckinPath('/clients/abc/front.jpg')).toBe('clients/abc/front.jpg')
    expect(toCheckinPath('https://x.supabase.co/storage/v1/object/public/checkins/clients/abc/front.jpg')).toBe('clients/abc/front.jpg')
    expect(toCheckinPath('https://x.supabase.co/storage/v1/object/sign/checkins/clients/abc/front.jpg?token=zzz')).toBe('clients/abc/front.jpg')
    expect(toCheckinPath('https://x.supabase.co/storage/v1/object/public/checkins/clients/a%20b/front.jpg')).toBe('clients/a b/front.jpg')
  })

  it('descarta vacíos y URLs externas desconocidas (no se pueden firmar)', () => {
    expect(toCheckinPath(null)).toBeNull()
    expect(toCheckinPath('   ')).toBeNull()
    expect(toCheckinPath('https://cdn.otro.com/foto.jpg')).toBeNull()
  })

  it('firma los 3 campos solo de las N filas CON foto más recientes; el resto solo el frontal', () => {
    const rows = [
      row('sin-foto'),
      row('a', { front_photo_url: 'p/a-front.jpg', side_photo_url: 'p/a-side.jpg' }),
      row('b', { front_photo_url: 'p/b-front.jpg', back_photo_url: 'p/b-back.jpg' }),
      row('c', { front_photo_url: 'p/c-front.jpg', side_photo_url: 'p/c-side.jpg' }),
    ]
    const fields = planCheckinPhotoFields(rows, { fullPhotoRows: 2, tailFields: ['front_photo_url'] })
    // La fila SIN foto cae a tailFields (no tiene nada que firmar) y no consume cupo: las dos
    // primeras filas CON foto son las que reciben los 3 campos.
    expect(fields[0]).toEqual(['front_photo_url'])
    expect(fields[1]).toEqual(['front_photo_url', 'back_photo_url', 'side_photo_url'])
    expect(fields[2]).toEqual(['front_photo_url', 'back_photo_url', 'side_photo_url'])
    expect(fields[3]).toEqual(['front_photo_url'])

    const { refs } = collectCheckinPhotoRefs(rows, { fullPhotoRows: 2, tailFields: ['front_photo_url'] })
    expect(refs).toEqual(['p/a-front.jpg', 'p/a-side.jpg', 'p/b-front.jpg', 'p/b-back.jpg', 'p/c-front.jpg'])
  })

  it('dedupe por path: dos filas con el mismo path piden UNA firma', () => {
    const rows = [row('a', { front_photo_url: 'p/x.jpg' }), row('b', { front_photo_url: 'p/x.jpg' })]
    expect(collectCheckinPhotoRefs(rows).refs).toEqual(['p/x.jpg'])
  })

  it('un campo no pedido o sin firma queda en null (nunca un path no renderizable)', () => {
    const rows = [row('a', { front_photo_url: 'p/a.jpg', side_photo_url: 'p/side.jpg' })]
    const out = applySignedCheckinPhotos(rows, new Map([['p/a.jpg', 'https://signed/a']]), { fullPhotoRows: 1, tailFields: ['front_photo_url'] })
    expect(out[0]!.front_photo_url).toBe('https://signed/a')
    expect(out[0]!.side_photo_url).toBeNull()
    expect(out[0]!.back_photo_url).toBeNull()
  })

  it('signCheckinPhotoRows reemplaza los campos por las URLs firmadas', async () => {
    const sign = vi.fn(async (_clientId: string, refs: string[]) => ({
      urls: Object.fromEntries(refs.map((ref) => [ref, `https://signed/${ref}`])),
    }))
    const rows = [row('a', { front_photo_url: 'p/a.jpg' })]
    const out = await signCheckinPhotoRows('client-1', rows, sign)
    expect(out[0]!.front_photo_url).toBe('https://signed/p/a.jpg')
    expect(sign).toHaveBeenCalledWith('client-1', ['p/a.jpg'])
  })

  it('cachea por path con TTL: la segunda carga no vuelve a firmar', async () => {
    const sign = vi.fn(async (_clientId: string, refs: string[]) => ({
      urls: Object.fromEntries(refs.map((ref) => [ref, `https://signed/${ref}`])),
    }))
    const rows = [row('a', { front_photo_url: 'p/a.jpg' })]
    await signCheckinPhotoRows('client-1', rows, sign, undefined, 1_000)
    const second = await signCheckinPhotoRows('client-1', rows, sign, undefined, 2_000)
    expect(sign).toHaveBeenCalledTimes(1)
    expect(second[0]!.front_photo_url).toBe('https://signed/p/a.jpg')
  })

  it('re-firma cuando la firma cacheada expiró', async () => {
    const sign = vi.fn(async (_clientId: string, refs: string[]) => ({
      urls: Object.fromEntries(refs.map((ref) => [ref, `https://signed/${ref}`])),
    }))
    const rows = [row('a', { front_photo_url: 'p/a.jpg' })]
    await signCheckinPhotoRows('client-1', rows, sign, undefined, 0)
    await signCheckinPhotoRows('client-1', rows, sign, undefined, 10_000_000)
    expect(sign).toHaveBeenCalledTimes(2)
  })

  it('fail-soft: si el endpoint falla las fotos quedan en null, no explota', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rows = [row('a', { front_photo_url: 'p/a.jpg' })]
    const out = await signCheckinPhotoRows('client-1', rows, async () => { throw new Error('offline') })
    expect(out[0]!.front_photo_url).toBeNull()
    expect(out[0]!.id).toBe('a')
    warn.mockRestore()
  })

  it('sin filas con foto no pega al endpoint', async () => {
    const sign = vi.fn(async () => ({ urls: {} }))
    const out = await signCheckinPhotoRows('client-1', [row('a')], sign)
    expect(sign).not.toHaveBeenCalled()
    // Sin refs las filas vuelven intactas (no se nulifica nada que ya era null).
    expect(out[0]!.front_photo_url).toBeNull()
  })
})

describe('A2 · contrato de las 5 KPI cards del Resumen', () => {
  const base = {
    longestStreakDays: 9,
    sessions30d: 18,
    workoutAdherencePct: 100,
    weightDelta30dKg: 1.1,
    programCurrentWeek: 5,
    programTotalWeeks: 6,
    hasActiveProgram: true,
  }

  it('copys fijos y cortos, sin hint concatenado (lo que truncaba a mitad de palabra)', () => {
    const labels = buildClientKpiCards(base).map((card) => card.label)
    expect(labels).toEqual(['Mejor racha', 'Sesiones (30d)', 'Adherencia entreno', 'Δ peso (30d)', 'Semana de programa'])
    for (const label of labels) {
      expect(label).not.toContain('·')
      expect(label).not.toContain('…')
    }
  })

  it('iconos y tonos del contrato; la 5ta ocupa la fila completa', () => {
    const cards = buildClientKpiCards(base)
    expect(cards.map((card) => card.icon)).toEqual(['flame', 'dumbbell', 'pieChart', 'scale', 'calendarDays'])
    expect(cards.map((card) => card.tone)).toEqual(['ember', 'sport', 'success', 'info', 'neutral'])
    expect(cards.map((card) => card.span)).toEqual(['half', 'half', 'half', 'half', 'full'])
  })

  it('conserva el tooltip de adherencia y no inventa otros', () => {
    const cards = buildClientKpiCards(base)
    expect(cards.filter((card) => card.info).map((card) => card.key)).toEqual(['workoutAdherence'])
  })

  it('formatea valores: racha en días, Δ peso con signo, semana N / total', () => {
    const cards = buildClientKpiCards(base)
    expect(cards[0]!.value).toBe('9 días')
    expect(cards[1]!.value).toBe('18')
    expect(cards[2]!.value).toBe('100%')
    expect(cards[3]!.value).toBe('+1.1 kg')
    expect(cards[4]!.value).toBe('5 / 6')
    expect(buildClientKpiCards({ ...base, longestStreakDays: 1 })[0]!.value).toBe('1 día')
    expect(buildClientKpiCards({ ...base, weightDelta30dKg: -0.8 })[3]!.value).toBe('-0.8 kg')
  })

  it('sin dato muestra "—" (Δ peso sin check-ins, semana sin programa activo)', () => {
    expect(buildClientKpiCards({ ...base, weightDelta30dKg: null })[3]!.value).toBe('—')
    expect(buildClientKpiCards({ ...base, hasActiveProgram: false })[4]!.value).toBe('—')
    expect(buildClientKpiCards({ ...base, programCurrentWeek: null })[4]!.value).toBe('—')
  })
})

describe('A4 · rampa del backdrop de la tira de tabs', () => {
  it('transparente lejos del anclaje, opaco al anclarse', () => {
    const stickyY = 400
    expect(tabBarBackdropProgress(0, stickyY)).toBe(0)
    expect(tabBarBackdropProgress(stickyY - TAB_BAR_BACKDROP_RAMP_PX, stickyY)).toBe(0)
    expect(tabBarBackdropProgress(stickyY, stickyY)).toBe(1)
    expect(tabBarBackdropProgress(stickyY + 500, stickyY)).toBe(1)
  })

  it('interpola de forma monótona dentro de la rampa', () => {
    const stickyY = 400
    const mid = tabBarBackdropProgress(stickyY - TAB_BAR_BACKDROP_RAMP_PX / 2, stickyY)
    expect(mid).toBeCloseTo(0.5, 5)
    expect(tabBarBackdropProgress(stickyY - 10, stickyY)).toBeGreaterThan(mid)
  })

  it('sin anclaje medido todavía no pinta backdrop', () => {
    expect(tabBarBackdropProgress(1200, Number.MAX_SAFE_INTEGER)).toBe(0)
    expect(tabBarBackdropProgress(1200, Number.NaN)).toBe(0)
  })
})
