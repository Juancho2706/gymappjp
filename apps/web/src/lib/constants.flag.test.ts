import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Fail-closed del switch de lanzamiento de add-ons self-service.
 *
 * `SELF_SERVICE_ADDONS_ENABLED` se lee de `NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED` y DEBE ser
 * `false` salvo que la env valga EXACTAMENTE 'true'. Toda la historia de seguridad del lanzamiento
 * (mergear el código a master con el feature APAGADO; prod sin la env = OFF) descansa en este default.
 *
 * La suite global fuerza la env = 'true' (vitest.config.ts) para ejercitar los flujos de add-on;
 * este archivo es el ÚNICO que valida el camino OFF, re-evaluando el módulo con la env sobreescrita.
 */
describe('SELF_SERVICE_ADDONS_ENABLED — fail-closed default', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    async function readFlag(): Promise<boolean> {
        vi.resetModules()
        const mod = await import('@/lib/constants')
        return mod.SELF_SERVICE_ADDONS_ENABLED
    }

    it('env SIN setear → false (default seguro de master/prod)', async () => {
        vi.stubEnv('NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED', '')
        expect(await readFlag()).toBe(false)
    })

    it("env === 'true' → true (Preview / flip de lanzamiento)", async () => {
        vi.stubEnv('NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED', 'true')
        expect(await readFlag()).toBe(true)
    })

    it("valores 'truthy' que NO son 'true' (1 / yes / TRUE) → false (no se prende por accidente)", async () => {
        for (const v of ['1', 'yes', 'TRUE', 'on']) {
            vi.stubEnv('NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED', v)
            expect(await readFlag()).toBe(false)
        }
    })
})
