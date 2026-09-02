// @vitest-environment jsdom
// Opt-in por archivo: desde el reparto por projects (vitest.config.ts, 2026-09-02) los
// `*.test.ts` corren en `node`, y este ejercita DOM real (window/document/localStorage).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { triggerHaptic } from './haptics'

// El label oculto del háptico iOS vive fuera del árbol de React (hijo directo de <body>): el
// click sintético que lo toggleaba se colaba en el autocapture de PostHog (rage clicks falsos) y
// en los listeners globales de click de la app (la alarma del descanso se apagaba sola).
describe('triggerHaptic (label oculto del háptico iOS)', () => {
    afterEach(() => {
        document.querySelectorAll('body > label').forEach((el) => el.remove())
    })

    it('crea UN solo label oculto, marcado ph-no-capture para PostHog', () => {
        triggerHaptic()
        triggerHaptic()
        const labels = document.querySelectorAll('body > label')
        expect(labels).toHaveLength(1)
        const label = labels[0] as HTMLLabelElement
        expect(label.classList.contains('ph-no-capture')).toBe(true)
        expect(label.getAttribute('aria-hidden')).toBe('true')
        expect(label.style.display).toBe('none')
        expect(label.querySelector('input[type="checkbox"][switch]')).not.toBeNull()
    })

    it('el click sintético NO llega a los listeners de click de document', () => {
        const onDocumentClick = vi.fn()
        document.addEventListener('click', onDocumentClick)
        try {
            triggerHaptic()
            expect(onDocumentClick).not.toHaveBeenCalled()
        } finally {
            document.removeEventListener('click', onDocumentClick)
        }
    })

    it('el switch sigue toggleando en cada háptico (cortar el burbujeo no rompe la activación)', () => {
        triggerHaptic()
        const input = document.querySelector('body > label > input') as HTMLInputElement
        const before = input.checked
        triggerHaptic()
        expect(input.checked).toBe(!before)
    })

    it('re-crea el label si alguien lo sacó del DOM', () => {
        triggerHaptic()
        document.querySelector('body > label')?.remove()
        triggerHaptic()
        expect(document.querySelectorAll('body > label')).toHaveLength(1)
    })
})
