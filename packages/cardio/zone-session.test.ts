import { describe, expect, it } from 'vitest'

import type { HrToZoneProfile } from './zones'
import {
    DEFAULT_MAX_SAMPLE_POINTS,
    MAX_DWELL_MS,
    addSample,
    createZoneSession,
    downsampleSeries,
    dwellDeltaMs,
    emptyZoneSec,
    roundZoneSec,
    updateOutOfZone,
    zoneSessionSummary,
    type ZoneSessionState,
} from './zone-session'

/**
 * Perfil de referencia: FCmax 200 sin FC reposo ⇒ %FCmax puro, zonas redondas.
 * Z1 100-120 · Z2 120-140 · Z3 140-160 · Z4 160-180 · Z5 180-200.
 */
const PROFILE: HrToZoneProfile = { max_hr: 200, resting_hr: null }

const T0 = 1_700_000_000_000

/** Alimenta muestras equiespaciadas (default 1 s) y devuelve el estado final. */
function feed(
    state: ZoneSessionState,
    bpms: readonly number[],
    opts: { stepMs?: number; profile?: HrToZoneProfile | null; startMs?: number } = {},
): ZoneSessionState {
    const { stepMs = 1000, profile = PROFILE, startMs = T0 } = opts
    let next = state
    bpms.forEach((bpm, i) => {
        next = addSample(next, bpm, startMs + i * stepMs, profile)
    })
    return next
}

describe('dwellDeltaMs', () => {
    it('primera muestra (sin previa) no aporta permanencia', () => {
        expect(dwellDeltaMs(null, T0)).toBe(0)
    })

    it('devuelve el delta real cuando es menor al tope', () => {
        expect(dwellDeltaMs(T0, T0 + 1000)).toBe(1000)
        expect(dwellDeltaMs(T0, T0 + 9999)).toBe(9999)
    })

    it('capa el gap largo a MAX_DWELL_MS (la correa desconectada no regala tiempo)', () => {
        expect(dwellDeltaMs(T0, T0 + 180_000)).toBe(MAX_DWELL_MS)
        expect(dwellDeltaMs(T0, T0 + MAX_DWELL_MS)).toBe(MAX_DWELL_MS)
    })

    it('delta cero o negativo (reloj hacia atras) no aporta', () => {
        expect(dwellDeltaMs(T0, T0)).toBe(0)
        expect(dwellDeltaMs(T0, T0 - 5000)).toBe(0)
    })
})

describe('createZoneSession', () => {
    it('arranca vacio con la zona objetivo declarada', () => {
        const st = createZoneSession(2)
        expect(st.targetZone).toBe(2)
        expect(st.count).toBe(0)
        expect(st.maxBpm).toBe(0)
        expect(st.samples).toEqual([])
        expect(st.zoneSec).toEqual(emptyZoneSec())
        expect(st.startedAtMs).toBeNull()
        expect(st.lastSampleAtMs).toBeNull()
    })

    it('acepta sesion sin zona prescrita', () => {
        expect(createZoneSession(null).targetZone).toBeNull()
    })
})

describe('addSample — acumulacion basica', () => {
    it('promedia, guarda el maximo y arma la serie con offsets desde la primera muestra', () => {
        const st = feed(createZoneSession(2), [130, 150, 140])
        expect(st.count).toBe(3)
        expect(st.sumBpm).toBe(420)
        expect(st.maxBpm).toBe(150)
        expect(st.samples).toEqual([
            [0, 130],
            [1, 150],
            [2, 140],
        ])
    })

    it('la primera muestra no acumula tiempo (no hay intervalo previo)', () => {
        const st = addSample(createZoneSession(2), 130, T0, PROFILE)
        expect(st.durationSec).toBe(0)
        expect(st.zoneSec).toEqual(emptyZoneSec())
        expect(st.count).toBe(1)
    })

    it('atribuye la permanencia a la zona de la muestra actual', () => {
        // 130 = Z2, 150 = Z3, 165 = Z4 (1 s entre cada una ⇒ 2 s repartidos).
        const st = feed(createZoneSession(2), [130, 150, 165])
        expect(st.zoneSec).toEqual({ '1': 0, '2': 0, '3': 1, '4': 1, '5': 0 })
        expect(st.durationSec).toBe(2)
    })

    it('suma inTargetSec solo mientras la zona coincide con la objetivo', () => {
        // Objetivo Z2 (120-140): 4 muestras a 1 s ⇒ 3 s de permanencia, 2 en Z2.
        const st = feed(createZoneSession(2), [130, 135, 165, 128])
        expect(st.inTargetSec).toBe(2)
        expect(st.zoneSec['2']).toBe(2)
        expect(st.zoneSec['4']).toBe(1)
    })

    it('sin zona objetivo nunca acumula inTargetSec', () => {
        const st = feed(createZoneSession(null), [130, 130, 130])
        expect(st.inTargetSec).toBe(0)
        expect(st.zoneSec['2']).toBe(2)
    })
})

describe('addSample — muestras invalidas y gaps', () => {
    it('descarta bpm <= 0, no finitos y los que redondean a 0 (devuelve el MISMO estado)', () => {
        const base = addSample(createZoneSession(2), 130, T0, PROFILE)
        expect(addSample(base, 0, T0 + 1000, PROFILE)).toBe(base)
        expect(addSample(base, -50, T0 + 1000, PROFILE)).toBe(base)
        expect(addSample(base, Number.NaN, T0 + 1000, PROFILE)).toBe(base)
        expect(addSample(base, 0.4, T0 + 1000, PROFILE)).toBe(base)
    })

    it('descarta timestamps no finitos', () => {
        const base = addSample(createZoneSession(2), 130, T0, PROFILE)
        expect(addSample(base, 130, Number.NaN, PROFILE)).toBe(base)
    })

    it('una muestra descartada NO adelanta el reloj: el dwell siguiente se mide desde la ultima valida', () => {
        let st = addSample(createZoneSession(2), 130, T0, PROFILE)
        st = addSample(st, 0, T0 + 1000, PROFILE) // descartada
        st = addSample(st, 130, T0 + 2000, PROFILE)
        expect(st.count).toBe(2)
        expect(st.durationSec).toBe(2)
    })

    it('un gap largo se capa en 10 s en vez de regalar el tiempo perdido', () => {
        let st = addSample(createZoneSession(2), 130, T0, PROFILE)
        st = addSample(st, 130, T0 + 300_000, PROFILE) // 5 min sin senal
        expect(st.durationSec).toBe(MAX_DWELL_MS / 1000)
        expect(st.zoneSec['2']).toBe(10)
        // El offset de la serie SI refleja el tiempo real transcurrido.
        expect(st.samples[1][0]).toBe(300)
    })

    it('muestras desordenadas no restan tiempo ni generan offsets negativos', () => {
        let st = addSample(createZoneSession(2), 130, T0, PROFILE)
        st = addSample(st, 130, T0 - 5000, PROFILE)
        expect(st.durationSec).toBe(0)
        expect(st.samples[1][0]).toBe(0)
    })

    it('redondea el bpm a entero (serie compacta en jsonb)', () => {
        const st = feed(createZoneSession(2), [130.6])
        expect(st.samples).toEqual([[0, 131]])
        expect(st.maxBpm).toBe(131)
    })
})

describe('addSample — sin perfil FC (degradacion honesta)', () => {
    it('acumula avg/max/serie pero NO clasifica zonas', () => {
        const st = feed(createZoneSession(2), [130, 150, 140], { profile: null })
        expect(st.count).toBe(3)
        expect(st.maxBpm).toBe(150)
        expect(st.durationSec).toBe(2)
        expect(st.classifiedCount).toBe(0)
        expect(st.zoneSec).toEqual(emptyZoneSec())
        expect(st.inTargetSec).toBe(0)
    })

    it('un perfil sin FCmax utilizable tampoco clasifica', () => {
        const st = feed(createZoneSession(2), [130, 150], { profile: { max_hr: null, resting_hr: 60 } })
        expect(st.classifiedCount).toBe(0)
        expect(st.zoneSec).toEqual(emptyZoneSec())
    })
})

describe('addSample — inmutabilidad', () => {
    it('no muta el estado recibido', () => {
        const before = feed(createZoneSession(2), [130, 130])
        const snapshot = JSON.parse(JSON.stringify(before))
        addSample(before, 165, T0 + 5000, PROFILE)
        expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot)
    })
})

describe('downsampleSeries', () => {
    it('serie vacia ⇒ sin puntos ni periodo', () => {
        expect(downsampleSeries([])).toEqual({ samplePeriodSec: 0, samples: [] })
    })

    it('bajo el tope la serie pasa intacta (copiada)', () => {
        const samples: [number, number][] = [
            [0, 120],
            [1, 130],
            [2, 140],
        ]
        const out = downsampleSeries(samples, 360)
        expect(out.samples).toEqual(samples)
        expect(out.samples).not.toBe(samples)
        expect(out.samplePeriodSec).toBe(1)
    })

    it('un solo punto no tiene periodo derivable', () => {
        expect(downsampleSeries([[0, 120]])).toEqual({ samplePeriodSec: 0, samples: [[0, 120]] })
    })

    it('promedia por bucket y respeta el tope de puntos', () => {
        // 1000 muestras a 1 s ⇒ factor 3 ⇒ 334 puntos.
        const samples: [number, number][] = Array.from({ length: 1000 }, (_, i) => [i, 100 + (i % 10)])
        const out = downsampleSeries(samples, DEFAULT_MAX_SAMPLE_POINTS)
        expect(out.samples.length).toBe(334)
        expect(out.samples.length).toBeLessThanOrEqual(DEFAULT_MAX_SAMPLE_POINTS)
        // Primer bucket: offsets 0,1,2 ⇒ 1; bpm 100,101,102 ⇒ 101.
        expect(out.samples[0]).toEqual([1, 101])
        expect(out.samplePeriodSec).toBe(3)
    })

    it('una hora a 1 Hz cabe en el tope (payload acotado)', () => {
        const samples: [number, number][] = Array.from({ length: 3600 }, (_, i) => [i, 150])
        const out = downsampleSeries(samples)
        expect(out.samples.length).toBeLessThanOrEqual(DEFAULT_MAX_SAMPLE_POINTS)
        expect(out.samples.every(([, bpm]) => bpm === 150)).toBe(true)
    })

    it('preserva los picos porque promedia (no descarta muestras)', () => {
        const samples: [number, number][] = [
            [0, 100],
            [1, 200],
            [2, 100],
            [3, 200],
        ]
        expect(downsampleSeries(samples, 2).samples).toEqual([
            [1, 150],
            [3, 150],
        ])
    })

    it('maxPoints invalido cae al default', () => {
        const samples: [number, number][] = Array.from({ length: 800 }, (_, i) => [i, 150])
        expect(downsampleSeries(samples, 0).samples.length).toBeLessThanOrEqual(DEFAULT_MAX_SAMPLE_POINTS)
        expect(downsampleSeries(samples, Number.NaN).samples.length).toBeLessThanOrEqual(DEFAULT_MAX_SAMPLE_POINTS)
    })
})

describe('roundZoneSec', () => {
    it('redondea cada zona una sola vez (los acumuladores son fraccionarios)', () => {
        expect(roundZoneSec({ '1': 0.4, '2': 12.6, '3': 0, '4': 59.5, '5': 1.2 })).toEqual({
            '1': 0,
            '2': 13,
            '3': 0,
            '4': 60,
            '5': 1,
        })
    })
})

describe('zoneSessionSummary', () => {
    it('arma el metadata.hr v1 con source ble', () => {
        const st = feed(createZoneSession(2), [130, 132, 128, 165])
        const hr = zoneSessionSummary(st)
        expect(hr.v).toBe(1)
        expect(hr.source).toBe('ble')
        expect(hr.avg).toBe(Math.round((130 + 132 + 128 + 165) / 4))
        expect(hr.max).toBe(165)
        expect(hr.duration_sec).toBe(3)
        expect(hr.target_zone).toBe(2)
        expect(hr.zone_sec).toEqual({ '1': 0, '2': 2, '3': 0, '4': 1, '5': 0 })
        expect(hr.in_target_sec).toBe(2)
        expect(hr.sample_period_sec).toBe(1)
        expect(hr.samples).toEqual([
            [0, 130],
            [1, 132],
            [2, 128],
            [3, 165],
        ])
    })

    it('sin perfil FC no inventa zonas: zone_sec e in_target_sec quedan null', () => {
        const hr = zoneSessionSummary(feed(createZoneSession(2), [130, 150], { profile: null }))
        expect(hr.zone_sec).toBeNull()
        expect(hr.in_target_sec).toBeNull()
        expect(hr.avg).toBe(140)
        expect(hr.max).toBe(150)
    })

    it('con perfil pero sin zona prescrita: hay zone_sec, no hay in_target_sec', () => {
        const hr = zoneSessionSummary(feed(createZoneSession(null), [130, 130]))
        expect(hr.target_zone).toBeNull()
        expect(hr.in_target_sec).toBeNull()
        expect(hr.zone_sec).toEqual({ '1': 0, '2': 1, '3': 0, '4': 0, '5': 0 })
    })

    it('sesion sin muestras: resumen honesto en ceros y serie null', () => {
        const hr = zoneSessionSummary(createZoneSession(3))
        expect(hr).toEqual({
            v: 1,
            source: 'ble',
            avg: 0,
            max: 0,
            duration_sec: 0,
            target_zone: 3,
            zone_sec: null,
            in_target_sec: null,
            sample_period_sec: null,
            samples: null,
        })
    })

    it('downsamplea la serie larga y redondea los segundos por zona', () => {
        const st = feed(
            createZoneSession(2),
            Array.from({ length: 900 }, () => 130),
        )
        const hr = zoneSessionSummary(st)
        expect(hr.samples?.length).toBeLessThanOrEqual(DEFAULT_MAX_SAMPLE_POINTS)
        expect(hr.duration_sec).toBe(899)
        expect(hr.zone_sec).toEqual({ '1': 0, '2': 899, '3': 0, '4': 0, '5': 0 })
        expect(hr.in_target_sec).toBe(899)
    })

    it('los segundos por zona suman la duracion con senal', () => {
        const st = feed(createZoneSession(2), [130, 150, 165, 185, 110])
        const hr = zoneSessionSummary(st)
        const total = Object.values(hr.zone_sec ?? {}).reduce((a, b) => a + b, 0)
        expect(total).toBe(hr.duration_sec)
    })
})

describe('updateOutOfZone', () => {
    it('dentro de zona no dispara y no cambia el estado', () => {
        const st = createZoneSession(2)
        const out = updateOutOfZone(st, true, T0)
        expect(out.fire).toBe(false)
        expect(out.state).toBe(st)
    })

    it('dispara UNA vez tras 10 s sostenidos fuera de zona', () => {
        let st = createZoneSession(2)
        let fired = 0
        for (let i = 0; i <= 15; i += 1) {
            const out = updateOutOfZone(st, false, T0 + i * 1000)
            st = out.state
            if (out.fire) fired += 1
        }
        expect(fired).toBe(1)
    })

    it('el aviso cae exactamente en el umbral, no antes', () => {
        let st = updateOutOfZone(createZoneSession(2), false, T0).state
        expect(updateOutOfZone(st, false, T0 + 9_999).fire).toBe(false)
        st = updateOutOfZone(st, false, T0 + 9_999).state
        expect(updateOutOfZone(st, false, T0 + 10_000).fire).toBe(true)
    })

    it('un bandazo corto (vuelve antes del umbral) no avisa nunca', () => {
        let st = createZoneSession(2)
        st = updateOutOfZone(st, false, T0).state
        st = updateOutOfZone(st, false, T0 + 3000).state
        const back = updateOutOfZone(st, true, T0 + 4000)
        expect(back.fire).toBe(false)
        expect(back.state.outOfZoneSinceMs).toBeNull()
        st = back.state
        expect(updateOutOfZone(st, false, T0 + 5000).fire).toBe(false)
    })

    it('volver a zona rearma: el segundo tramo largo vuelve a avisar', () => {
        let st = createZoneSession(2)
        st = updateOutOfZone(st, false, T0).state
        expect(updateOutOfZone(st, false, T0 + 10_000).fire).toBe(true)
        st = updateOutOfZone(st, false, T0 + 10_000).state
        // Sigue fuera: no repite el aviso.
        expect(updateOutOfZone(st, false, T0 + 30_000).fire).toBe(false)
        st = updateOutOfZone(st, true, T0 + 31_000).state
        expect(st.outOfZoneFired).toBe(false)
        st = updateOutOfZone(st, false, T0 + 32_000).state
        expect(updateOutOfZone(st, false, T0 + 42_000).fire).toBe(true)
    })

    it('umbral configurable', () => {
        let st = updateOutOfZone(createZoneSession(2), false, T0, 3000).state
        expect(updateOutOfZone(st, false, T0 + 2000, 3000).fire).toBe(false)
        st = updateOutOfZone(st, false, T0 + 2000, 3000).state
        expect(updateOutOfZone(st, false, T0 + 3000, 3000).fire).toBe(true)
    })

    it('timestamp no finito no dispara ni ensucia el estado', () => {
        const st = updateOutOfZone(createZoneSession(2), false, T0).state
        const out = updateOutOfZone(st, false, Number.NaN)
        expect(out.fire).toBe(false)
        expect(out.state).toBe(st)
    })

    it('convive con la acumulacion (el debounce no toca los contadores)', () => {
        const st = feed(createZoneSession(2), [130, 165])
        const out = updateOutOfZone(st, false, T0 + 1000)
        expect(out.state.count).toBe(st.count)
        expect(out.state.zoneSec).toBe(st.zoneSec)
    })
})
