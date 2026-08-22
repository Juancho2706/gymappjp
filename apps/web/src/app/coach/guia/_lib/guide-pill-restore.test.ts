import { describe, expect, it } from 'vitest'
import {
    guideMirrorStorageKey,
    guidePillRestorePayload,
    restoreGuidePillLocally,
    type GuideMirrorStorage,
} from './guide-pill-restore'

/** Doble mínimo de `localStorage`, para no depender del jsdom global. */
function fakeStorage(seed: Record<string, string> = {}): GuideMirrorStorage & { data: Record<string, string> } {
    const data = { ...seed }
    return {
        data,
        getItem: (key) => (key in data ? data[key] : null),
        setItem: (key, value) => {
            data[key] = value
        },
    }
}

describe('guidePillRestorePayload', () => {
    it('apaga las DOS banderas: con `dismissed` en true la píldora seguiría oculta', () => {
        expect(guidePillRestorePayload()).toEqual({ dismissed: false, hidden: false })
    })
})

describe('restoreGuidePillLocally', () => {
    const key = guideMirrorStorageKey('coach-1')

    it('limpia `dismissed`/`hidden` del espejo local', () => {
        const storage = fakeStorage({
            [key]: JSON.stringify({ completed: {}, dismissed: true, hidden: true, emitted: [] }),
        })
        restoreGuidePillLocally('coach-1', storage)
        expect(JSON.parse(storage.data[key])).toMatchObject({ dismissed: false, hidden: false })
    })

    it('NO pierde el progreso ni la memoria de eventos (si no, se re-emite todo y vuelve el confeti)', () => {
        const storage = fakeStorage({
            [key]: JSON.stringify({
                completed: { profile_branding: true, vive_tu_app: true },
                dismissed: true,
                hidden: true,
                emitted: ['profile_branding', 'vive_tu_app'],
                ahaMomentSent: true,
                guide_seen_at: '2026-08-22T10:00:00.000Z',
            }),
        })
        restoreGuidePillLocally('coach-1', storage)
        const next = JSON.parse(storage.data[key])
        expect(next.completed).toEqual({ profile_branding: true, vive_tu_app: true })
        expect(next.emitted).toEqual(['profile_branding', 'vive_tu_app'])
        expect(next.ahaMomentSent).toBe(true)
        expect(next.guideSeenAt).toBe('2026-08-22T10:00:00.000Z')
    })

    it('sin espejo previo escribe uno limpio en vez de romperse', () => {
        const storage = fakeStorage()
        restoreGuidePillLocally('coach-1', storage)
        expect(JSON.parse(storage.data[key])).toMatchObject({ dismissed: false, hidden: false })
    })

    it('con JSON corrupto no lanza (el servidor ya quedó limpio)', () => {
        const storage = fakeStorage({ [key]: '{no-json' })
        expect(() => restoreGuidePillLocally('coach-1', storage)).not.toThrow()
    })

    it('la clave es POR COACH: restaurar una cuenta no toca la otra', () => {
        expect(guideMirrorStorageKey('a')).not.toBe(guideMirrorStorageKey('b'))
        expect(guideMirrorStorageKey('a')).toBe('eva:coach-onboarding:v2:a')
    })
})
