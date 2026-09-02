import path from 'node:path'
import { createRequire } from 'node:module'
import { createElement, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `apps/mobile/components/ModuleOffNotice.tsx` — espejo RN del test web
 * (`apps/web/src/components/coach/ModuleOffNotice.test.tsx`, W4.2 de la Ola de orden).
 *
 * Lo que se protege es el CONTRATO, no las palabras exactas de cada descripción:
 *  - el aviso es de MANTENIMIENTO, para un módulo apagado por el OPERADOR (kill-switch
 *    `EVA_DISABLED_MODULES`) o por acceso inactivo. Ya NO es un gate de plan (regla del owner
 *    2026-08-31: todo está en todos los planes, solo se cobra el cupo);
 *  - por lo tanto NO hay gesto de venta en ninguna de las 4 superficies. Eso además lo deja del
 *    lado seguro del anti-steering de las tiendas (Apple 3.1.1 / política de pagos de Google):
 *    acá adentro no puede haber ningún camino a pagar;
 *  - la única salida por default es «Volver», y `cta: null` (la vista del alumno) no pinta ninguna.
 *    Esa última rama no existe en la web: es propia de RN y por eso se cubre acá.
 *
 * GOTCHA de resolución (mismo patrón que `tour-autostart-guide.test.tsx`): los ids bare resuelven
 * distinto desde `tests/` que desde `apps/mobile/`, así que el grafo del componente se mockea por
 * PATH ABSOLUTO con `vi.doMock` + `import()` dinámico. Los primitivos de RN se cambian por
 * elementos del DOM para poder afirmar sobre el TEXTO con Testing Library.
 */

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const mobileFile = (...segments: string[]) => path.resolve(mobileDir, ...segments)

type Module = typeof import('../../apps/mobile/components/ModuleOffNotice')
type ModuleKey = 'cardio' | 'movement_assessment' | 'body_composition' | 'nutrition_exchanges'

const MODULE_KEYS: ModuleKey[] = ['cardio', 'movement_assessment', 'body_composition', 'nutrition_exchanges']

/** Las dos caras de `lucide-react-native` (CJS por `require`, ESM por `import`). */
function lucideIds(): string[] {
    const cjs = mobileDep('lucide-react-native').split('\\').join('/')
    return [cjs, cjs.replace('/dist/cjs/lucide-react-native.js', '/dist/esm/lucide-react-native.mjs')]
}

const back = vi.fn()

async function loadModule(): Promise<Module> {
    vi.resetModules()

    // `View`/`Text` → `div`/`span`. Solo se conserva `accessibilityLabel` (como `data-testid`):
    // el resto de los props de RN (style como array, accessibilityRole…) no son válidos en DOM.
    vi.doMock(mobileDep('react-native'), () => ({
        View: ({ children, accessibilityLabel }: { children?: ReactNode; accessibilityLabel?: string }) =>
            createElement('div', accessibilityLabel ? { 'data-testid': accessibilityLabel } : null, children),
        Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
        StyleSheet: { create: <T,>(styles: T) => styles },
    }))
    for (const id of lucideIds()) {
        const icon = () => createElement('i')
        vi.doMock(id, () => ({ HeartPulse: icon, Activity: icon, Ruler: icon, Apple: icon }))
    }
    vi.doMock(mobileDep('expo-router'), () => ({ useRouter: () => ({ back }) }))
    vi.doMock(mobileFile('context', 'ThemeContext'), () => ({
        useTheme: () => ({ theme: { muted: '#eee', mutedForeground: '#666', foreground: '#111', radius: { xl: 28 }, fontDisplay: 'D', fontSans: 'S' } }),
    }))
    vi.doMock(mobileFile('components', 'Button'), () => ({
        Button: ({ label, onPress }: { label: string; onPress: () => void }) =>
            createElement('button', { onClick: onPress }, label),
    }))

    return import('../../apps/mobile/components/ModuleOffNotice')
}

beforeEach(() => {
    back.mockClear()
})

describe('ModuleOffNotice (RN, espejo de W4.2)', () => {
    it('las 4 keys pintan un título que termina en «temporalmente no disponible» y el aviso', async () => {
        const { ModuleOffNotice } = await loadModule()

        for (const moduleKey of MODULE_KEYS) {
            const { unmount } = render(createElement(ModuleOffNotice, { moduleKey }))

            expect(screen.getByTestId('module-off-notice')).toBeInTheDocument()
            expect(screen.getByText(/temporalmente no disponible$/)).toBeInTheDocument()

            unmount()
        }
    })

    it('cardio: título LITERAL (red de regresión del copy exacto, igual que la web)', async () => {
        const { ModuleOffNotice } = await loadModule()

        render(createElement(ModuleOffNotice, { moduleKey: 'cardio' as ModuleKey }))

        expect(screen.getByText('Cardio temporalmente no disponible')).toBeInTheDocument()
    })

    it('párrafo de mantenimiento presente', async () => {
        const { ModuleOffNotice } = await loadModule()

        render(createElement(ModuleOffNotice, { moduleKey: 'cardio' as ModuleKey }))

        expect(screen.getByText(/Estamos haciendo mantenimiento en esta función/)).toBeInTheDocument()
    })

    it('CTA único: «Volver», y vuelve a la pantalla anterior', async () => {
        const { ModuleOffNotice } = await loadModule()

        render(createElement(ModuleOffNotice, { moduleKey: 'cardio' as ModuleKey }))

        const buttons = screen.getAllByRole('button')
        expect(buttons).toHaveLength(1)
        expect(buttons[0]).toHaveTextContent('Volver')

        buttons[0].click()
        expect(back).toHaveBeenCalledTimes(1)
    })

    it('`cta: null` (vista del alumno) no pinta ningún botón ni el párrafo de mantenimiento', async () => {
        const { ModuleOffNotice } = await loadModule()

        render(createElement(ModuleOffNotice, { moduleKey: 'cardio' as ModuleKey, cta: null }))

        expect(screen.queryByRole('button')).toBeNull()
        expect(screen.queryByText(/Estamos haciendo mantenimiento/)).toBeNull()
    })

    it('`cta` propio reemplaza al de default y dispara su acción', async () => {
        const { ModuleOffNotice } = await loadModule()
        const onPress = vi.fn()

        render(createElement(ModuleOffNotice, { moduleKey: 'cardio' as ModuleKey, cta: { label: 'Ir al panel', onPress } }))

        const button = screen.getByRole('button')
        expect(button).toHaveTextContent('Ir al panel')

        button.click()
        expect(onPress).toHaveBeenCalledTimes(1)
        expect(back).not.toHaveBeenCalled()
    })

    it('no hay gesto de venta: ni «ver planes», ni precio, ni upgrade, en ninguna de las 4', async () => {
        const { ModuleOffNotice } = await loadModule()

        // Ojo: NO se puede afirmar sobre /plan/i a secas — la descripción de nutrition_exchanges
        // habla de «las plantillas reutilizables» y la web ya tropezó con eso. Lo que no debe
        // aparecer es el VOCABULARIO de venta, no la palabra «plan» suelta.
        for (const moduleKey of MODULE_KEYS) {
            const { container, unmount } = render(createElement(ModuleOffNotice, { moduleKey }))

            expect(container.textContent).not.toMatch(/ver planes|plan pago|precio|upgrade|suscrip|incluido/i)

            unmount()
        }
    })
})
